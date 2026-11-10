import {safeSum,dateAdd,type CashLine,type CompanyBook} from './cash-model';
export type Scenario='conservative'|'base'|'optimistic';
const signed=(l:CashLine,amount:number)=>l.direction==='in'?amount:-amount;
export function planned(l:CashLine,scenario:Scenario){return l.status==='confirmed'&&l.remainingCents>0&&!!l.dueDate&&(l.direction==='out'||l.certainty==='confirmed'||(l.certainty==='expected'&&scenario!=='conservative')||scenario==='optimistic');}
export function cashForecast(lines:CashLine[],company:CompanyBook,asOf:string,scenario:Scenario){
 const actual=lines.flatMap(l=>l.payments.filter(p=>!p.voidAt&&p.date<=asOf).map(p=>({lineId:l.id,projectId:l.projectId,label:l.label,date:p.date,amount:signed(l,p.amountCents)})));
 const current=company.opening?safeSum([company.opening.amountCents,...actual.filter(p=>p.date>=company.opening!.date).map(p=>p.amount)]):null;
 const future=lines.filter(l=>planned(l,scenario)).map(l=>({...l,forecastDate:l.dueDate<asOf?asOf:l.dueDate,overdue:l.dueDate<asOf}));
 let balance=current;
 const weeks=Array.from({length:13},(_,i)=>{
  const start=dateAdd(asOf,i*7),end=dateAdd(start,6),details=future.filter(l=>l.forecastDate>=start&&l.forecastDate<=end);
  const income=safeSum(details.filter(l=>l.direction==='in').map(l=>l.remainingCents)),expense=safeSum(details.filter(l=>l.direction==='out').map(l=>l.remainingCents));
  const opening=balance;let minimum=balance;
  for(const date of [...new Set(details.map(l=>l.forecastDate))].sort()){if(balance!==null){balance=safeSum([balance,...details.filter(l=>l.forecastDate===date).map(l=>signed(l,l.remainingCents))]);minimum=Math.min(minimum!,balance);}}
  return {week:i+1,start,end,opening,income,expense,closing:balance,minimum,details};
 });
 const next30=future.filter(l=>l.forecastDate<=dateAdd(asOf,29));
 const confirmed=lines.filter(l=>l.status==='confirmed');
 return {asOf,scenario,current,opening:company.opening,weeks,receivable:safeSum(confirmed.filter(l=>l.direction==='in').map(l=>l.remainingCents)),payable:safeSum(confirmed.filter(l=>l.direction==='out').map(l=>l.remainingCents)),overdueReceivable:safeSum(confirmed.filter(l=>l.direction==='in'&&!!l.dueDate&&l.dueDate<asOf).map(l=>l.remainingCents)),income30:safeSum(next30.filter(l=>l.direction==='in').map(l=>l.remainingCents)),expense30:safeSum(next30.filter(l=>l.direction==='out').map(l=>l.remainingCents)),excluded:lines.filter(l=>l.remainingCents>0&&!planned(l,scenario)).map(l=>({id:l.id,projectId:l.projectId,label:l.label,reason:l.status==='draft'?'尚未确认':l.status==='cancelled'||l.status==='settled'?'已取消或结清':!l.dueDate?'缺少预计日期':'本情景不计入该回款'})),historical:actual,funding:projectFunding(lines,asOf,scenario)};
}
export function projectFunding(lines:CashLine[],asOf:string,scenario:Scenario){
 const horizon=dateAdd(asOf,90);
 return [...new Set(lines.map(l=>l.projectId).filter(Boolean))].map(id=>{
  const rows=lines.filter(l=>l.projectId===id),items=rows.flatMap(l=>[
   ...l.payments.filter(p=>!p.voidAt&&p.date<=asOf).map(p=>({date:p.date,value:signed(l,p.amountCents),label:l.label})),
   ...(planned(l,scenario)&&l.dueDate<=horizon?[{date:l.dueDate<asOf?asOf:l.dueDate,value:signed(l,l.remainingCents),label:l.label}]:[]),
  ]);
  let balance=0,maximumAdvance=0,start:string|null=null,totalDays=0,firstGap:string|null=null,lastRecovery:string|null=null;
  const details=[];for(const date of [...new Set(items.map(i=>i.date))].sort()){
   const net=safeSum(items.filter(i=>i.date===date).map(i=>i.value));balance=safeSum([balance,net]);maximumAdvance=Math.max(maximumAdvance,-balance);
   if(balance<0&&!start){start=date;firstGap||=date;}if(balance>=0&&start){totalDays+=Math.round((Date.parse(date)-Date.parse(start))/86400000);lastRecovery=date;start=null;}
   details.push({date,net,balance,labels:items.filter(i=>i.date===date).map(i=>i.label)});
  }
  if(start)totalDays+=Math.max(0,Math.round((Date.parse(horizon)-Date.parse(start))/86400000)+1);
  return {projectId:id,name:rows[0].projectName,maximumAdvance,gapAtHorizon:Math.max(0,-balance),firstGap,recovery:start?null:lastRecovery,occupationDays:totalDays,unrecovered:!!start,horizon,details};
 }).sort((a,b)=>b.maximumAdvance-a.maximumAdvance);
}
