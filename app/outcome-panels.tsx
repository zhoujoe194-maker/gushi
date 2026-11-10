'use client';
import {useEffect,useRef,useState} from 'react';
import {BUSINESS_STATUSES,statusOf,type BusinessStatus,type OutcomeRecord} from './outcome-model';
import {type Project,type Event} from './model';
import {type Member,canEditProject,isManager} from './team';
import {useModalFocus} from './use-modal-focus';
type Requester=(url:string,init?:RequestInit)=>Promise<Response>;
type Data={outcomes:OutcomeRecord[];categories:{id:string;label:string}[];reviews:{id:string;actor_id:string;action:string;content:string;created_at:string;next_review_date:string|null}[];counts:{total:number;won:number;paused:number;lost:number};history:{paused:Group;lost:Group};people:{id:string;name:string}[];reviewDays:number;queue:{projectId:string;name:string;owner:string;ownerMemberId:string;version:number;dueDate:string}[]};
type Group={events:number;projects:number;categories:{label:string;events:number;projects:number}[]};
const stamp=(v:string)=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
async function json<T = Data>(request:Requester,url:string,body?:unknown){const r=await request(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const b=await r.json() as T & {error?:string};if(!r.ok)throw Error(b.error||'操作失败');return b;}
function History({items,edit}:{items:OutcomeRecord[];edit?:(o:OutcomeRecord)=>void}) {
 return <div className="outcome-history">{!items.length&&<p className="muted">暂无暂停或丢单记录。</p>}{items.map(o=><article className="finance-block" key={o.id}>
  <div className="section-heading"><div><strong>{o.type==='paused'?'暂停':'丢单'} · {o.projectName}</strong><p>{stamp(o.createdAt)} · {o.actorName}</p></div>{edit&&o.canEdit&&<button className="button" onClick={()=>edit(o)}>补充 / 更正</button>}</div>
  <p><strong>原始原因：{o.categoryLabel}</strong></p><p className="business-prewrap">{o.explanation}</p>
  <p className="muted">{o.data.fromStatus} → {o.data.toStatus}{o.reviewDueDate?` · 当时复查日期：${o.reviewDueDate}`:''}</p>
  {o.data.improvement&&<p>改进建议：{o.data.improvement}</p>}{o.data.competitor&&<p>竞争对手：{o.data.competitor}</p>}
  {o.revisions.map(r=><div className="outcome-revision" key={r.id}><strong>补充 / 更正 · {stamp(r.createdAt)}</strong><p>{r.data.actorName} · {r.data.categoryLabel}</p><p className="business-prewrap">{r.data.explanation}</p>{r.data.improvement&&<p>改进建议：{r.data.improvement}</p>}{r.data.competitor&&<p>竞争对手：{r.data.competitor}</p>}{r.data.reviewDate&&<p>复查日期：{r.data.reviewDate}</p>}</div>)}
 </article>)}</div>;
}
function StatusDialog({project,target,record,categories,busy,error,close,save}:{project:Project;target:BusinessStatus;record?:OutcomeRecord;categories:Data['categories'];busy:boolean;error:string;close:()=>void;save:(reason:unknown)=>void}) {
 const latest=record?.revisions.at(-1)?.data;
 const [categoryId,setCategory]=useState(latest?.categoryId||record?.categoryId||''),[explanation,setExplanation]=useState(latest?.explanation||record?.explanation||''),[improvement,setImprovement]=useState(latest?.improvement||record?.data.improvement||''),[competitor,setCompetitor]=useState(latest?.competitor||record?.data.competitor||''),[reviewDate,setReviewDate]=useState(latest?.reviewDate??record?.reviewDueDate??'');
 const ref=useRef<HTMLDivElement>(null);useModalFocus(ref,()=>{if(!busy)close();},true);
 const needed=target==='已暂停'||target==='已丢单';
 return <div className="modal-backdrop"><div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="status-dialog-title"><div className="modal-heading"><div><h2 id="status-dialog-title">{record?'补充 / 更正原因':needed?`记录${target==='已暂停'?'暂停':'丢单'}原因`:'修改项目状态'}</h2><p>{project.name} · {record?'原始内容会永久保留':`${statusOf(project)} → ${target}`}</p></div><button type="button" className="icon-button" disabled={busy} onClick={close} aria-label="关闭状态窗口">×</button></div>
 <form className="project-form" onSubmit={e=>{e.preventDefault();save({categoryId,explanation,improvement,competitor,reviewDate});}}>
 {error&&<p className="error-box" role="alert">{error}</p>}
 {needed?<><label className="field">主要原因分类 <em>*</em><select required data-modal-initial-focus value={categoryId} onChange={e=>setCategory(e.target.value)}><option value="">请选择原因</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
 <label className="field">具体情况说明 <em>*</em><textarea required maxLength={4000} rows={3} value={explanation} onChange={e=>setExplanation(e.target.value)} placeholder="用一句话说明实际情况即可" /></label>
 <details className="project-supplement"><summary>补充信息（选填）</summary>{target==='已暂停'&&<label className="field">预计重新启动 / 复查日期<input type="date" value={reviewDate} onChange={e=>setReviewDate(e.target.value)} /></label>}<label className="field">改进建议<textarea maxLength={4000} rows={2} value={improvement} onChange={e=>setImprovement(e.target.value)} /></label><label className="field">竞争对手信息<textarea maxLength={4000} rows={2} value={competitor} onChange={e=>setCompetitor(e.target.value)} /></label></details>
 <p className="muted">保存后通知管理，不需要等待审批。暂停与丢单分别记录，不自动扣绩效。</p></>:<p>确认将项目设为“{target}”？历史跟进与原因记录都会保留。</p>}
 <div className="form-actions"><button className="button" type="button" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy}>{busy?'正在保存…':record?'保存更正':'保存状态'}</button></div>
 </form></div></div>;
}
export function ProjectOutcomes({project,member,request,onChanged,demo=false}:{project:Project;member:Member;request:Requester;onChanged:(p:Project,e:Event)=>void;demo?:boolean}) {
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState<BusinessStatus|null>(null),[record,setRecord]=useState<OutcomeRecord|undefined>(),[reviewAction,setReviewAction]=useState('request_details'),[content,setContent]=useState(''),[nextReviewDate,setNextReviewDate]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');if(!demo)json(request,'/api/outcomes?projectId='+encodeURIComponent(project.id)).then(b=>{if(active)setData(b);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[project.id,project.version,request,demo]);
 async function send(body:unknown){setBusy(true);setError('');try{const b=await json<{project:Project;event:Event}>(request,'/api/outcomes',body);setTarget(null);setRecord(undefined);setContent('');onChanged(b.project,b.event);}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}
 return <section className="project-outcomes"><div className="section-heading"><div><h3>项目状态与结果</h3><p>业务状态：<strong>{statusOf(project)}</strong> · 详细工程阶段可在补充资料中维护。</p></div>{!demo&&canEditProject(project,member)&&<label className="field">修改业务状态<select disabled={busy||!data} value={statusOf(project)} onChange={e=>{setRecord(undefined);setError('');setTarget(e.target.value as BusinessStatus);}}>{BUSINESS_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>}</div>
 {demo&&<p className="muted">状态与结果功能请使用本机试用账号体验；静态演示不写入记录。</p>}
 {error&&!target&&<p className="error-box" role="alert">{error}</p>}
 {statusOf(project)==='已暂停'&&<p className="muted">不进入普通跟进逾期列表。{project.pauseReviewDate?`计划复查：${project.pauseReviewDate}`:`未指定日期，按管理配置每 ${data?.reviewDays||7} 天复查。`}</p>}
 {!data&&!demo&&!error&&<p role="status">正在读取原因历史…</p>}
 {data&&<History items={data.outcomes} edit={o=>{setRecord(o);setTarget(o.type==='paused'?'已暂停':'已丢单');setError('');}} />}
 {!demo&&isManager(member)&&statusOf(project)==='已暂停'&&<form className="finance-block" onSubmit={e=>{e.preventDefault();void send({action:'review',projectId:project.id,version:project.version,reviewAction,content,nextReviewDate});}}><h4>管理复查</h4><label className="field">复查处理<select value={reviewAction} onChange={e=>setReviewAction(e.target.value)}><option value="request_details">要求补充说明</option><option value="objection">提出异议</option><option value="reviewed">已复查，继续观察</option><option value="reactivate">恢复项目并要求重新跟进</option></select></label><label className="field">管理意见<textarea required rows={2} maxLength={4000} value={content} onChange={e=>setContent(e.target.value)} /></label>{reviewAction!=='reactivate'&&<label className="field">下次复查日期（选填）<input type="date" value={nextReviewDate} onChange={e=>setNextReviewDate(e.target.value)} /></label>}<button className="button primary" disabled={busy}>{busy?'正在保存…':'保存复查意见'}</button></form>}
 {data?.reviews.map(r=><div className="outcome-revision" key={r.id}><strong>管理复查 · {stamp(r.created_at)}</strong><p className="business-prewrap">{r.content}</p>{r.next_review_date&&<p>下次复查：{r.next_review_date}</p>}</div>)}
 {target&&data&&<StatusDialog project={project} target={target} record={record} categories={data.categories} busy={busy} error={error} close={()=>{if(!busy){setTarget(null);setRecord(undefined);setError('');}}} save={reason=>void send({action:record?'revise':'status',projectId:project.id,version:project.version,status:target,outcomeId:record?.id,reason})} />}
 </section>;
}
export function ProjectResults({member,request,onOpen,projects,demo=false}:{member:Member;request:Requester;onOpen:(p:Project)=>void;projects:Project[];demo?:boolean}) {
 const [target,setTarget]=useState(''),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[days,setDays]=useState(7),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const manager=isManager(member);
 useEffect(()=>{let active=true;setError('');setData(null);if(!demo)json(request,'/api/outcomes'+(target?'?memberId='+encodeURIComponent(target):'')).then(b=>{if(active){setData(b);setDays(b.reviewDays);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[target,refresh,request,demo,projects]);
 return <section className="panel results-panel"><div className="section-heading"><div><h2>{manager?'员工项目结果与暂停复查':'我的项目结果'}</h2><p>用于分析和改善；暂停不等于失败，不按丢单数量自动扣分。</p></div></div>
 {demo&&<p>请使用本机试用账号查看真实保存的模拟结果记录。</p>}{error&&<p className="error-box" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{!data&&!demo&&!error&&<p role="status">正在加载项目结果…</p>}
 {data&&<>{manager&&<label className="field">查看员工<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">全公司</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
 <div className="result-metrics">{[['当前负责',data.counts.total],['已成交',data.counts.won],['已暂停',data.counts.paused],['已丢单',data.counts.lost]].map(([label,n])=><div key={label}><span>{label}项目</span><strong>{n}</strong></div>)}</div>
 <p className="muted">上方按当前负责项目统计。下方按事件发生时的负责人归档，转交项目后只保留历史快照。</p>
 {manager&&<section className="finance-block"><h3>暂停项目复查清单（全公司）</h3><form className="review-policy" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await json(request,'/api/outcomes',{action:'review-policy',days});setNotice('复查周期已保存');setRefresh(n=>n+1);}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}}><label className="field">未指定日期的复查周期（天）<input type="number" required min={1} max={90} value={days} onChange={e=>setDays(Number(e.target.value))} /></label><button className="button" disabled={busy}>保存周期</button></form>
 {!data.queue.length&&<p>当前没有到期暂停项目。</p>}{data.queue.map(q=><div className="review-row" key={q.projectId}><div><strong>{q.name}</strong><p>负责人：{q.owner||'待分配'} · 复查日：{q.dueDate}</p></div><button className="button" onClick={()=>{const p=projects.find(p=>p.id===q.projectId);if(p)onOpen(p);}}>打开复查</button></div>)}</section>}
 {(['paused','lost'] as const).map(type=><section key={type} className="finance-block"><h3>{type==='paused'?'历史暂停':'历史丢单'}</h3><p>{data.history[type].projects} 个独立项目 · {data.history[type].events} 次事件</p><div className="reason-counts">{data.history[type].categories.map(c=><span className="badge" key={c.label}>{c.label}：{c.events} 次 / {c.projects} 个项目</span>)}</div><History items={data.outcomes.filter(o=>o.type===type)} /></section>)}</>}
 </section>;
}
export function PauseReviewReminder({request,projects,open}:{request:Requester;projects:Project[];open:()=>void}) {
 const [count,setCount]=useState<number|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;json(request,'/api/outcomes').then(b=>{if(active){setCount(b.queue.length);setError('');}}).catch(()=>{if(active)setError('暂停复查提醒暂未加载，请打开复查清单重试');});return()=>{active=false;};},[request,projects]);
 return <section className="pause-review-reminder"><div><strong>{error|| (count===null?'正在读取暂停复查提醒…':`暂停项目到期复查：${count} 个`)}</strong><p>包含已到复查日期和未设日期、达到复查周期的项目。</p></div><button className="button" onClick={open}>查看暂停复查</button></section>;
}
