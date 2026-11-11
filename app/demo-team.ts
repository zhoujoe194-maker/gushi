import {hasPortal, inPortal} from './access';
import {ROLES,Role,Member,Portal,Desk,canReadProject,roleInfo,visibleProject} from './team';
import {demoData,shiftDate} from './model';
import {demoWorkflow,departmentDesk,DEPARTMENTS} from './workflow';
import {emptyBook,FinanceBook} from './finance-model';
export const demoMembers:Member[]=[{...roleInfo('owner'),id:'owner' as Role},...ROLES].map(r=>({id:'demo-'+r.id,name:r.name+'（演示）',email:r.id+'@example.invalid',role:r.id,region:r.id==='branch_manager'?'湖南分部':r.id==='sales'?'广州总部':'全部分部',status:'active',bound:true,version:1}));
export const demoMultiMember:Member={id:'demo-multi',name:'张明（兼岗演示）',email:'multi@example.invalid',phone:'',role:'sales',accountRole:'sales',assignedDesks:['sales','operations'],defaultDesk:'sales',region:'广州总部',status:'active',bound:true,version:1,profileCompleted:true};
demoMembers.push(demoMultiMember);
// D1-RECTIFY: demo identities mirror the real model. There are only three
// workbenches; operations/aftersales appear inside the management workbench
// only when the demo account's real role or granted capability implies them.
const demoRoleOf = (portal:Portal):Role =>
  portal==='sales'?'sales':portal==='finance'?'finance':'management';
export function demoRoleMember(portal:Portal,multi=false):Member{
  if(multi&&hasPortal(demoMultiMember,portal))
    return inPortal({...demoMultiMember},portal);
  const base=demoMembers.find(m=>m.role===demoRoleOf(portal))||demoMembers[0];
  return inPortal(base,portal);
}
// Adapter used by the demo workspace. `multi` keeps the兼岗 account valid
// (assignedDesks ['sales','operations']), so its management entry resolves to
// the operations scope while the sales entry stays a sales identity.
export function roleDemo(portal:Portal,multi=false){
 const baseMember=demoRoleMember(portal,multi);
 const member=multi?{...baseMember,name:(typeof window!=='undefined'?sessionStorage.getItem('gushi-demo-real-name'):'')||baseMember.name}:baseMember;
 const base=demoData();const projects=base.projects.map((p,i)=>({...p,owner:i%2===0?(multi?member.name:demoMembers.find(m=>m.role==='sales')!.name):'其他销售（演示）',ownerMemberId:i%2===0?(multi?member.id:'demo-sales'):'demo-other-sales',workflow:{...demoWorkflow(p,i),assignmentMembers:Object.fromEntries([...DEPARTMENTS.map(r=>[r.id,multi&&['sales','operations'].includes(departmentDesk(r.id))?member.id:'demo-'+departmentDesk(r.id)]),...['technical','marketing','project','logistics'].map(d=>[d,multi?member.id:'demo-operations'])]),tasks:demoWorkflow(p,i).tasks.map(t=>({...t,assigneeMemberId:multi&&['sales','operations'].includes(departmentDesk(t.department))?member.id:'demo-'+departmentDesk(t.department),createdByMemberId:'demo-sales'}))},opportunities:p.opportunities.map((o,j)=>({...o,filingDate:j===0?shiftDate(i===3?-45:-12):''}))}));
 const books:Record<string,FinanceBook>={};for(const [i,p]of projects.entries()){const b=emptyBook(p.id);if([1,4,0].includes(i)){b.contractNo='DEMO-2026-'+(i+1);b.contractAmountCents=p.amount*1000000;b.paymentTerms='按合同约定分批收款';b.reviewStatus=i===0?'待审核':'已审核';b.version=1;if(i!==0){b.plans=[{id:'demo-plan-'+i,label:'合同货款',amountCents:b.contractAmountCents,dueDate:shiftDate(-3)}];b.receipts=[{id:'demo-receipt-'+i,planId:'demo-plan-'+i,amountCents:b.contractAmountCents/2,date:shiftDate(-5),reference:'演示记录',note:'',recordedBy:'demo-finance'}];b.invoices=[{id:'demo-invoice-'+i,amountCents:b.contractAmountCents/2,title:p.customer,taxNo:'演示税号',remark:'演示开票申请',requestedBy:'demo-sales',requestedAt:new Date().toISOString(),status:'待开票',number:'',issuedDate:'',reply:''}];}}books[p.id]=b;}
 const readable=projects.filter(p=>canReadProject(p,member));
 const visible=new Set(readable.map(p=>p.id));
 return {member,members:demoMembers,projects:readable.map(p=>visibleProject(p,member)),events:base.events.filter(e=>visible.has(e.projectId)),finances:Object.fromEntries(Object.entries(books).filter(([id])=>visible.has(id)))};
}
