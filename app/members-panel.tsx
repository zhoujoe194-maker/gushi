'use client';
import {Fragment,useId,useState} from 'react';
import {Plus,Search,Users,Layers3,ShieldCheck,UserRoundCheck,Copy,Check,ArrowRight} from 'lucide-react';
import {Desk,Member,Portal,PORTALS,Role,ROLES,MANAGEMENT_CAPABILITY_DESKS,deskOf,portalInfo,portalOfDesk,realRole,roleInfo} from './team';
import {grantedDesks,grantedPortals,defaultPortal} from './access';
import {FinanceModal} from './role-panels';

type Draft=Partial<Member>&{password?:string;professionRole?:Role};
type GrantHolder=Pick<Member,'role'|'assignedDesks'|'accountRole'>;
const asGrants=(m:Partial<Member>,desks:Desk[],professionRole?:Role):GrantHolder=>({role:(professionRole||m.accountRole||m.role||'operations') as Member['role'],accountRole:professionRole||m.accountRole,assignedDesks:desks});
const scopeName=(d:Desk)=>roleInfo(d).name;
const portalName=(p:Portal)=>portalInfo(p).name;
const professionOf=(m:Draft):Role=>(m.professionRole||m.accountRole||m.role||'operations') as Role;
const professionIsManager=(r:Role)=>['management','general','director','branch_manager'].includes(r);
const professionOptions=ROLES.filter(r=>r.id!=='owner');
// Management workbench capability desks already selected; used by the portal
// checkbox and the task-collaboration checkboxes.
const managementDesksOf=(desks:Desk[])=>desks.filter(d=>MANAGEMENT_CAPABILITY_DESKS.includes(d));
const defaultLabel=(m:Member)=>portalName(defaultPortal(m));
function regionFor(desks:Desk[],region?:string){return desks.includes('sales')&&!desks.some(d=>MANAGEMENT_CAPABILITY_DESKS.includes(d))&&region==='全部分部'?'广州总部':region||'广州总部';}
function keepDefaultPortal(desks:Desk[],current?:Portal,professionRole?:Role):Portal|undefined{
  if(!desks.length)return undefined;
  const holder=asGrants({},desks,professionRole);
  const portals=grantedPortals(holder);
  if(current&&portals.includes(current))return current;
  return portals[0];
}

export default function MembersPanel({members,member,busy,onSave}:{members:Member[];member:Member;busy:boolean;onSave:(data:Record<string,unknown>)=>Promise<boolean>}) {
  const id=useId();
  const [editing,setEditing]=useState<Draft|null>(null);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('全部成员');
  const [copied,setCopied]=useState('');
  const [copyStatus,setCopyStatus]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const saving=busy||submitting;
  const active=members.filter(m=>m.status==='active');
  const pending=active.filter(m=>m.profileCompleted===false||m.mustChangePassword);
  const multi=active.filter(m=>grantedPortals(m).length>1);
  const counts=[['启用成员',active.length,Users],['待完成首次设置',pending.length,UserRoundCheck],['拥有多个工作台',multi.length,Layers3]] as const;
  const filtered=members.filter(m=>(!query||[m.name,m.email,m.phone,m.region,roleInfo(realRole(m)).name].join(' ').toLowerCase().includes(query.toLowerCase()))&&(filter==='全部成员'||filter==='待激活'&&m.status==='active'&&(m.profileCompleted===false||m.mustChangePassword)||filter==='多个工作台'&&grantedPortals(m).length>1||filter==='已停用'&&m.status==='disabled'));

  function start(m?:Member) {
    setError('');
    if(m) {
      const desks=grantedDesks(m);
      setEditing({...m,professionRole:realRole(m),assignedDesks:desks,defaultDesk:defaultPortal(m),region:regionFor(desks,m.region),password:''});
    } else {
      setEditing({name:'',email:'',phone:'',password:'',professionRole:'sales',assignedDesks:['sales'],defaultDesk:'sales',region:'广州总部',status:'active'});
    }
  }

  // D1-RECTIFY: three workbench checkboxes only. Management grants access to
  // the management workbench; it never changes the professional role.
  function togglePortal(p:Portal) {
    if(!editing)return;
    setError('');
    const desks=editing.assignedDesks||[];
    const profession=professionOf(editing);
    const scopes:Desk[]=p==='management'?MANAGEMENT_CAPABILITY_DESKS:[p];
    const chosen=desks.some(d=>scopes.includes(d));
    let next:Desk[];
    if(chosen){
      if(portalOfDesk(deskOf(profession))===p){setError(`当前专业岗位属于${portalName(p)}，请先调整专业岗位再取消该工作台授权。`);return;}
      next=desks.filter(d=>!scopes.includes(d));
    }else if(p==='management'){
      // An operations/aftersales professional keeps their own capability; any
      // other role merely gets management-workbench collaboration access.
      next=[...new Set([...desks,managementDesksOf([deskOf(profession)])[0]||'management'])];
    }else{
      next=[...new Set([...desks,p])];
    }
    setEditing({...editing,assignedDesks:next,defaultDesk:keepDefaultPortal(next,editing.defaultDesk,profession),region:regionFor(next,editing.region)});
  }

  // Extra task-collaboration capabilities inside the management workbench.
  function toggleCapability(d:Desk) {
    if(!editing)return;
    setError('');
    const profession=professionOf(editing);
    const desks=editing.assignedDesks||[];
    if(d===deskOf(profession)){setError(`「${scopeName(d)}」是当前专业岗位对应的能力，不能在此移除；如需转岗请调整专业岗位。`);return;}
    const next=desks.includes(d)?desks.filter(k=>k!==d):[...desks,d];
    setEditing({...editing,assignedDesks:next,defaultDesk:keepDefaultPortal(next,editing.defaultDesk,profession),region:regionFor(next,editing.region)});
  }

  // Explicit transfer/promotion/demotion. The server records before/after role
  // and grants in member_audit; UI never derives the role from a checkbox.
  function changeProfession(profession:Role) {
    if(!editing)return;
    setError('');
    const previousDesk=deskOf(professionOf(editing));
    const nextDesk=deskOf(profession);
    let desks=(editing.assignedDesks||[]).filter(d=>d!==previousDesk||d===nextDesk);
    if(!desks.includes(nextDesk))desks=[...desks,nextDesk];
    setEditing({...editing,professionRole:profession,assignedDesks:desks,defaultDesk:keepDefaultPortal(desks,editing.defaultDesk,profession),region:regionFor(desks,editing.region)});
  }

  async function instructions(m:Member) {
    const s=`公司工作区：${location.origin}\n登录账号：${m.email||m.phone}\n首次登录：填写本人真实姓名并修改初始密码。\n专业岗位：${roleInfo(realRole(m)).name}\n已开通工作台：${grantedPortals(m).map(portalName).join('、')}\n默认工作台：${defaultLabel(m)}\n初始密码请由管理人员另行提供，请勿转发。`;
    try {
      await navigator.clipboard.writeText(s);
      setCopied(m.id);
      setCopyStatus(`已复制${m.name}的登录说明`);
      setTimeout(()=>setCopied(''),2500);
    } catch {
      setError('无法复制，请手动提供公司网址和登录账号。');
    }
  }

  const selected=editing?.assignedDesks||[];
  const professionRole=professionOf(editing||{});
  const selectedPortals=grantedPortals(asGrants(editing||{},selected,professionRole));
  const defaultPortalValue=editing?.defaultDesk&&selectedPortals.includes(editing.defaultDesk)?editing.defaultDesk:selectedPortals[0];
  const managementSelected=managementDesksOf(selected).length>0;
  const editingManager=editing?.id?professionIsManager(realRole(editing as Member)):false;
  return <div className="people-management">
    <div className="people-heading">
      <div><h2>成员账号</h2><p>一个员工一个账号；工作台授权与专业岗位分开设置，管理台协作成员不会因此成为公司管理员。</p></div>
      <button type="button" className="button primary" disabled={saving} onClick={()=>start()}><Plus size={16} aria-hidden="true"/>添加新成员</button>
    </div>
    <div className="people-metrics">{counts.map(([name,n,Icon])=><div key={name}><span>{name}<Icon size={18} aria-hidden="true"/></span><strong>{n}<small>人</small></strong></div>)}</div>
    <div className="people-onboarding" aria-label="员工账号开通流程">{['管理添加账号','勾选工作台并设置专业岗位','员工实名与改密','按授权进入工作台'].map((s,i)=><div key={s}><span>{i+1}</span>{s}{i<3&&<ArrowRight size={13} aria-hidden="true"/>}</div>)}</div>
    {error&&!editing&&<div className="error-box" role="alert">{error}</div>}
    <p className="sr-only" role="status" aria-live="polite">{copyStatus}</p>
    <section className="panel" aria-label="成员列表">
      <div className="people-toolbar">
        <div className="list-tabs" role="group" aria-label="筛选成员">{['全部成员','待激活','多个工作台','已停用'].map(f=><button type="button" key={f} className={filter===f?'active':''} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}</button>)}</div>
        <label className="search-field"><Search size={16} aria-hidden="true"/><span className="sr-only">搜索姓名、账号、分部或专业岗位</span><input type="search" placeholder="搜索姓名、账号、分部或专业岗位" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      </div>
      <div className="table-scroll">
        <table className="member-table people-table" role="table">
          <caption className="sr-only">成员账号与工作台权限，共 {filtered.length} 位成员</caption>
          <thead><tr>{['成员 / 登录账号','可进入的工作台','专业岗位','默认工作台','使用状态','操作'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{filtered.map(m=><tr key={m.id}>
            <td data-label="成员 / 账号"><div className="people-name"><span className="avatar" aria-hidden="true">{m.name.slice(0,1)}</span><strong>{m.name}{realRole(m)==='owner'&&<small>系统管理员</small>}</strong></div><small>{m.email||m.phone||'未填写登录账号'}</small>{m.email&&m.phone&&<small>{m.phone}</small>}</td>
            <td data-label="工作台权限"><div className="people-desk-tags">{grantedPortals(m).map(p=><span key={p}>{portalName(p)}</span>)}</div></td>
            <td data-label="专业岗位">{roleInfo(realRole(m)).name}{professionIsManager(realRole(m))&&realRole(m)!=='owner'&&<small className="people-scope-note">管理工作台管理员</small>}</td>
            <td data-label="默认工作台">{defaultLabel(m)}</td>
            <td data-label="状态"><span className={'badge '+(m.status==='disabled'?'gray':m.profileCompleted===false?'amber':m.mustChangePassword?'blue':'green')}>{m.status==='disabled'?'已停用':m.profileCompleted===false?'待完善实名':m.mustChangePassword?'待修改密码':'已激活'}</span></td>
            <td data-label="操作"><div className="people-row-actions">{realRole(m)!=='owner'&&m.id!==member.id&&<button type="button" className="button small-button" aria-label={'管理'+m.name+'的权限'} disabled={saving} onClick={()=>start(m)}>管理权限</button>}<button type="button" className="icon-button" aria-label={'复制'+m.name+'的登录说明'} onClick={()=>instructions(m)}>{copied===m.id?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length&&<div className="small-empty" role="status">暂无符合条件的成员。请尝试其他姓名、账号或筛选条件。</div>}
    </section>
    <div className="membership-notice"><ShieldCheck size={19} aria-hidden="true"/><p>管理工作台负责分配工作台与专业岗位。勾选管理工作台只表示可进入该工作台协作，是否拥有公司管理权限由专业岗位明确决定；修改授权、转岗、停用或重置密码后原登录立即失效，审计保留变更前后角色与授权。</p></div>
    {editing&&<FinanceModal title={editing.id?'管理成员与工作台权限':'添加新成员'} close={()=>!saving&&setEditing(null)}>
      <form className="project-form people-form" aria-busy={saving} onSubmit={async e=>{
        e.preventDefault();
        if(saving)return;
        setError('');
        setSubmitting(true);
        try {
          if(!selected.length)throw Error('至少选择一个工作台');
          if(!selected.includes(deskOf(professionRole)))throw Error(`专业岗位「${roleInfo(professionRole).name}」对应的岗位能力未授权；如确需转岗，请先调整专业岗位。`);
          if(editing.id&&editingManager&&!professionIsManager(professionRole))throw Error('取消管理岗位会降权；请确认专业岗位调整正确后保存。');
          if(!defaultPortalValue)throw Error('请选择默认工作台');
          const payload:Record<string,unknown>={professionRole,assignedDesks:selected,defaultDesk:defaultPortalValue,name:editing.name||'',email:editing.email||'',phone:editing.phone||'',region:editing.region||'广州总部',status:editing.status||'active'};
          if(editing.id){payload.id=editing.id;payload.version=editing.version;}
          if(editing.password)payload.password=editing.password;
          if(await onSave(payload))setEditing(null);
        } catch(e) {
          setError((e as Error).message);
        } finally {
          setSubmitting(false);
        }
      }}>
        {error&&<div className="error-box" role="alert">{error}</div>}
        <fieldset className="people-form-fields" disabled={saving}>
          <legend className="sr-only">成员资料、工作台授权与专业岗位</legend>
          <div className="form-grid">
            <label className="field span2">成员称呼（可暂不填写）<input name="memberName" autoComplete="off" maxLength={50} aria-describedby={`${id}-name-hint`} placeholder="例如：张明" value={editing.name||''} onChange={e=>setEditing({...editing,name:e.target.value})}/><small id={`${id}-name-hint`}>员工首次登录时，需本人确认真实姓名。</small></label>
            <label className="field">邮箱<input name="memberEmail" type="email" autoComplete="off" required={!editing.phone?.trim()} aria-describedby={`${id}-account-hint`} maxLength={200} value={editing.email||''} onChange={e=>setEditing({...editing,email:e.target.value})}/></label>
            <label className="field">手机号<input name="memberPhone" type="tel" autoComplete="off" required={!editing.email?.trim()} aria-describedby={`${id}-account-hint`} maxLength={30} value={editing.phone||''} onChange={e=>setEditing({...editing,phone:e.target.value})}/></label>
          </div>
          <p className="helper-text" id={`${id}-account-hint`}>邮箱或手机号至少填写一项；两者都填时，可登录同一个账号。</p>
          <label className="field">{editing.id?'重置初始密码（留空保持原密码）':'初始密码（必填）'}<input name="memberPassword" required={!editing.id} minLength={12} maxLength={128} type="password" autoComplete="new-password" aria-describedby={`${id}-password-hint`} value={editing.password||''} onChange={e=>setEditing({...editing,password:e.target.value})}/><small id={`${id}-password-hint`}>至少 12 位，通过公司内部渠道提供给本人。首次登录需改为个人密码。</small></label>
          <label className="field">专业岗位<select name="memberProfession" required value={professionRole} onChange={e=>changeProfession(e.target.value as Role)}>{professionOptions.map(r=><option key={r.id} value={r.id}>{r.name} · {r.portal}</option>)}</select><small>管理、运营、售后是管理工作台内的真实岗位；销售、财务分别对应各自工作台。转岗会记录变更前后角色与授权。</small></label>
          <fieldset className="people-grants-fieldset" aria-describedby={`${id}-grants-hint`}>
            <legend className="people-grants-title">允许进入的工作台（至少选择一个）</legend>
            <p className="helper-text" id={`${id}-grants-hint`}>仅销售、管理、财务三个工作台 · 已选 {selectedPortals.length} 个。工作台授权不等于公司管理权限。</p>
            <div className="people-grants">
              {PORTALS.map(p=>{
                const chosen=selected.some(d=>p.id==='management'?MANAGEMENT_CAPABILITY_DESKS.includes(d):d===p.id);
                const professionPortal=portalOfDesk(deskOf(professionRole));
                return <label key={p.id} className={chosen?'selected':''}>
                  <input type="checkbox" checked={chosen} onChange={()=>togglePortal(p.id)}/>
                  <span><strong>{p.name}</strong><small>{p.id==='management'?'公司经营、任务协作与员工结果；运营/售后按专业岗位协作':p.id==='sales'?'本人项目、跟进与销售任务':'合同票款、工资费用与现金流'}{professionPortal===p.id?' · 当前岗位必需':''}</small></span>
                </label>;
              })}
            </div>
            {managementSelected&&<>
              <div className="people-grants-title"><strong>管理工作台内的任务协作能力</strong><span>按实际职责勾选</span></div>
              <div className="people-grants">
                {MANAGEMENT_CAPABILITY_DESKS.map(d=><label key={d} className={selected.includes(d)?'selected':''}>
                  <input type="checkbox" checked={selected.includes(d)} disabled={d===deskOf(professionRole)} onChange={()=>toggleCapability(d)}/>
                  <span><strong>{scopeName(d)}</strong><small>{roleInfo(d).description}{d===deskOf(professionRole)?' · 当前专业岗位必需':''}</small></span>
                </label>)}
              </div>
            </>}
          </fieldset>
          <div className="form-grid">
            <label className="field">默认工作台<select name="memberDefaultDesk" required value={defaultPortalValue||''} onChange={e=>setEditing({...editing,defaultDesk:e.target.value as Portal})}>{!selectedPortals.length&&<option value="">先选择工作台权限</option>}{selectedPortals.map(p=><option key={p} value={p}>{portalName(p)}</option>)}</select></label>
            <label className="field">历史区域（不用于权限）<select name="memberRegion" value={editing.region||'广州总部'} onChange={e=>setEditing({...editing,region:e.target.value})}>{(selected.includes('sales')&&!managementSelected?['广州总部','湖南分部']:['广州总部','湖南分部','全部分部']).map(r=><option key={r}>{r}</option>)}</select></label>
          </div>
          <label className="field">账号状态<select name="memberStatus" value={editing.status||'active'} onChange={e=>setEditing({...editing,status:e.target.value as Member['status']})}><option value="active">启用，可登录</option><option value="disabled">停用，禁止登录</option></select></label>
        </fieldset>
        <div className="form-actions"><button className="button" type="button" disabled={saving} onClick={()=>setEditing(null)}>取消</button><button className="button primary" type="submit" disabled={saving||!selected.length}>{saving?'正在保存…':editing.id?'保存人员权限':'添加成员并开通账号'}</button></div>
      </form>
    </FinanceModal>}
  </div>;
}
