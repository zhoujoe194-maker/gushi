'use client';
import {Fragment,useId,useState} from 'react';
import {Plus,Search,Users,Layers3,ShieldCheck,UserRoundCheck,Copy,Check,ArrowRight} from 'lucide-react';
import {Member,Desk,Portal,PORTALS,SCOPES_IN_PORTAL,portalInfo,portalOfDesk,deskOf,roleInfo,isScopedManager} from './team';
import {grantedDesks,grantedPortals,scopesInPortal,preferredScope,defaultDesk as defaultDeskOf} from './access';
import {FinanceModal} from './role-panels';

type Draft=Partial<Member>&{password?:string};
type GrantHolder=Pick<Member,'role'|'assignedDesks'|'accountRole'>;
const asGrants=(m:Partial<Member>,desks:Desk[]):GrantHolder=>({role:(m.accountRole||m.role||'operations') as Member['role'],accountRole:m.accountRole,assignedDesks:desks});
const scopeName=(d:Desk)=>roleInfo(d).name;
const portalName=(p:Portal)=>portalInfo(p).name;
const defaultLabel=(m:Member)=>{const desk=defaultDeskOf(m);const portal=portalOfDesk(desk);return portalName(portal)+(portal==='management'?'（'+scopeName(desk)+'）':'');};
// Keep the default desk inside the same workbench when it is still granted.
function keepDefault(m:Partial<Member>,desks:Desk[],current?:Desk):Desk|undefined {
  if(!desks.length)return undefined;
  const holder=asGrants(m,desks);
  if(current){
    const portal=portalOfDesk(current);
    if(scopesInPortal(holder,portal).length)return preferredScope(holder,portal,desks.includes(current)?current:undefined);
  }
  const portals=grantedPortals(holder);
  return portals.length?preferredScope(holder,portals[0]):desks[0];
}
function regionFor(desks:Desk[],region?:string){return desks.includes('sales')&&!desks.includes('management')&&region==='全部分部'?'广州总部':region||'广州总部';}

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
  const filtered=members.filter(m=>(!query||[m.name,m.email,m.phone,m.region].join(' ').toLowerCase().includes(query.toLowerCase()))&&(filter==='全部成员'||filter==='待激活'&&m.status==='active'&&(m.profileCompleted===false||m.mustChangePassword)||filter==='多个工作台'&&grantedPortals(m).length>1||filter==='已停用'&&m.status==='disabled'));

  function start(m?:Member) {
    setError('');
    if(m) {
      const desks=grantedDesks(m);
      setEditing({...m,assignedDesks:desks,defaultDesk:defaultDeskOf(m),region:regionFor(desks,m.region),password:''});
    } else {
      setEditing({name:'',email:'',phone:'',password:'',assignedDesks:['sales'],defaultDesk:'sales',region:isScopedManager(member)?member.region:'广州总部',status:'active'});
    }
  }

  function toggle(d:Desk) {
    if(!editing)return;
    setError('');
    const old=editing.assignedDesks||[];
    if(old.includes(d)){
      if(d===requiredDesk){setError('当前岗位对应的岗位范围不能移除；如需调整岗位请联系系统管理员。');return;}
      const desks=old.filter(k=>k!==d);
      setEditing({...editing,assignedDesks:desks,defaultDesk:keepDefault(editing,desks,editing.defaultDesk),region:regionFor(desks,editing.region)});
    } else {
      const desks=[...old,d];
      setEditing({...editing,assignedDesks:desks,defaultDesk:keepDefault(editing,desks,editing.defaultDesk),region:regionFor(desks,editing.region)});
    }
  }

  function togglePortal(p:Portal) {
    if(!editing)return;
    setError('');
    const scopes=SCOPES_IN_PORTAL[p];
    const old=editing.assignedDesks||[];
    const chosen=scopes.filter(d=>old.includes(d));
    let desks:Desk[];
    if(chosen.length){
      desks=old.filter(d=>!scopes.includes(d));
      if(requiredDesk&&scopes.includes(requiredDesk))desks=[...new Set([...desks,requiredDesk])];
    } else {
      desks=[...new Set([...old,scopes[0]])];
    }
    setEditing({...editing,assignedDesks:desks,defaultDesk:keepDefault(editing,desks,editing.defaultDesk),region:regionFor(desks,editing.region)});
  }

  async function instructions(m:Member) {
    const s=`公司工作区：${location.origin}\n登录账号：${m.email||m.phone}\n首次登录：填写本人真实姓名并修改初始密码。\n已开通工作台：${grantedPortals(m).map(portalName).join('、')}\n默认工作台：${defaultLabel(m)}\n初始密码请由管理人员另行提供，请勿转发。`;
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
  // D1: the granular desk of the account's current role is the identity the
  // server preserves on save, so it can never be removed here.
  const requiredDesk=editing?.id?deskOf(editing.accountRole||editing.role||'operations'):undefined;
  const selectedPortals=grantedPortals(asGrants(editing||{},selected));
  const defaultPortalValue=editing?.defaultDesk&&selected.includes(editing.defaultDesk)?portalOfDesk(editing.defaultDesk):selectedPortals[0];
  const managementSelected=selected.some(d=>SCOPES_IN_PORTAL.management.includes(d));
  return <div className="people-management">
    <div className="people-heading">
      <div><h2>成员账号</h2><p>一个员工一个账号，按实际分工开通一个或多个工作台。</p></div>
      <button type="button" className="button primary" disabled={saving} onClick={()=>start()}><Plus size={16} aria-hidden="true"/>添加新成员</button>
    </div>
    <div className="people-metrics">{counts.map(([name,n,Icon])=><div key={name}><span>{name}<Icon size={18} aria-hidden="true"/></span><strong>{n}<small>人</small></strong></div>)}</div>
    <div className="people-onboarding" aria-label="员工账号开通流程">{['管理添加账号','勾选工作台与岗位范围','员工实名与改密','按授权进入工作台'].map((s,i)=><div key={s}><span>{i+1}</span>{s}{i<3&&<ArrowRight size={13} aria-hidden="true"/>}</div>)}</div>
    {error&&!editing&&<div className="error-box" role="alert">{error}</div>}
    <p className="sr-only" role="status" aria-live="polite">{copyStatus}</p>
    <section className="panel" aria-label="成员列表">
      <div className="people-toolbar">
        <div className="list-tabs" role="group" aria-label="筛选成员">{['全部成员','待激活','多个工作台','已停用'].map(f=><button type="button" key={f} className={filter===f?'active':''} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}</button>)}</div>
        <label className="search-field"><Search size={16} aria-hidden="true"/><span className="sr-only">搜索姓名、账号或分部</span><input type="search" placeholder="搜索姓名、账号或分部" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      </div>
      <div className="table-scroll">
        <table className="member-table people-table" role="table">
          <caption className="sr-only">成员账号与工作台权限，共 {filtered.length} 位成员</caption>
          <thead><tr>{['成员 / 登录账号','可进入的工作台','默认工作台','历史区域','使用状态','操作'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{filtered.map(m=><tr key={m.id}>
            <td data-label="成员 / 账号"><div className="people-name"><span className="avatar" aria-hidden="true">{m.name.slice(0,1)}</span><strong>{m.name}{(m.accountRole||m.role)==='owner'&&<small>系统管理员</small>}</strong></div><small>{m.email||m.phone||'未填写登录账号'}</small>{m.email&&m.phone&&<small>{m.phone}</small>}</td>
            <td data-label="工作台权限"><div className="people-desk-tags">{grantedPortals(m).map(p=>{const scopes=scopesInPortal(m,p);return <Fragment key={p}><span>{portalName(p)}</span>{p==='management'&&scopes.map(d=><span key={d}>{scopeName(d)}</span>)}</Fragment>;})}</div></td>
            <td data-label="默认工作台">{defaultLabel(m)}</td>
            <td data-label="历史区域" title="V2 权限按工作台与岗位范围控制，区域仅保留历史数据">{m.region}</td>
            <td data-label="状态"><span className={'badge '+(m.status==='disabled'?'gray':m.profileCompleted===false?'amber':m.mustChangePassword?'blue':'green')}>{m.status==='disabled'?'已停用':m.profileCompleted===false?'待完善实名':m.mustChangePassword?'待修改密码':'已激活'}</span></td>
            <td data-label="操作"><div className="people-row-actions">{(m.accountRole||m.role)!=='owner'&&m.id!==member.id&&<button type="button" className="button small-button" aria-label={'管理'+m.name+'的权限'} disabled={saving} onClick={()=>start(m)}>管理权限</button>}<button type="button" className="icon-button" aria-label={'复制'+m.name+'的登录说明'} onClick={()=>instructions(m)}>{copied===m.id?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length&&<div className="small-empty" role="status">暂无符合条件的成员。请尝试其他姓名、账号或筛选条件。</div>}
    </section>
    <div className="membership-notice"><ShieldCheck size={19} aria-hidden="true"/><p>管理工作台负责分配工作台与岗位范围，员工不能自行选择岗位获得权限。修改授权、停用或重置密码后，原登录立即失效；成员再次登录时按最新授权进入。</p></div>
    {editing&&<FinanceModal title={editing.id?'管理成员与工作台权限':'添加新成员'} close={()=>!saving&&setEditing(null)}>
      <form className="project-form people-form" aria-busy={saving} onSubmit={async e=>{
        e.preventDefault();
        if(saving)return;
        setError('');
        setSubmitting(true);
        try {
          if(!selected.length)throw Error('至少选择一个工作台');
          if(requiredDesk&&!selected.includes(requiredDesk))throw Error(`当前岗位对应「${scopeName(requiredDesk)}」岗位范围，不能移除；如需调整岗位请联系系统管理员。`);
          if(!defaultPortalValue)throw Error('请选择默认工作台');
          const defaultDesk=preferredScope(asGrants(editing,selected),defaultPortalValue,editing.defaultDesk&&selected.includes(editing.defaultDesk)?editing.defaultDesk:undefined);
          const payload:Record<string,unknown>={assignedDesks:selected,defaultDesk,name:editing.name||'',email:editing.email||'',phone:editing.phone||'',region:editing.region||'广州总部',status:editing.status||'active'};
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
          <legend className="sr-only">成员资料与工作台授权</legend>
          <div className="form-grid">
            <label className="field span2">成员称呼（可暂不填写）<input name="memberName" autoComplete="off" maxLength={50} aria-describedby={`${id}-name-hint`} placeholder="例如：张明" value={editing.name||''} onChange={e=>setEditing({...editing,name:e.target.value})}/><small id={`${id}-name-hint`}>员工首次登录时，需本人确认真实姓名。</small></label>
            <label className="field">邮箱<input name="memberEmail" type="email" autoComplete="off" required={!editing.phone?.trim()} aria-describedby={`${id}-account-hint`} maxLength={200} value={editing.email||''} onChange={e=>setEditing({...editing,email:e.target.value})}/></label>
            <label className="field">手机号<input name="memberPhone" type="tel" autoComplete="off" required={!editing.email?.trim()} aria-describedby={`${id}-account-hint`} maxLength={30} value={editing.phone||''} onChange={e=>setEditing({...editing,phone:e.target.value})}/></label>
          </div>
          <p className="helper-text" id={`${id}-account-hint`}>邮箱或手机号至少填写一项；两者都填时，可登录同一个账号。</p>
          <label className="field">{editing.id?'重置初始密码（留空保持原密码）':'初始密码（必填）'}<input name="memberPassword" required={!editing.id} minLength={12} maxLength={128} type="password" autoComplete="new-password" aria-describedby={`${id}-password-hint`} value={editing.password||''} onChange={e=>setEditing({...editing,password:e.target.value})}/><small id={`${id}-password-hint`}>至少 12 位，通过公司内部渠道提供给本人。首次登录需改为个人密码。</small></label>
          <fieldset className="people-grants-fieldset" aria-describedby={`${id}-grants-hint`}>
            <legend className="people-grants-title">允许进入的工作台（至少选择一个）</legend>
            <p className="helper-text" id={`${id}-grants-hint`}>一个工作台可包含多个岗位范围 · 已选 {selectedPortals.length} 个工作台{isScopedManager(member)&&'。管理工作台权限由系统管理员分配。'}</p>
            <div className="people-grants">
              {PORTALS.map(p=>{
                const scopes=SCOPES_IN_PORTAL[p.id];
                const chosen=scopes.filter(d=>selected.includes(d));
                const isRequired=!!requiredDesk&&scopes.includes(requiredDesk);
                return <label key={p.id} className={chosen.length?'selected':''}>
                  <input type="checkbox" checked={chosen.length>0} disabled={(isScopedManager(member)&&p.id==='management')||(isRequired&&scopes.length===1)} onChange={()=>togglePortal(p.id)}/>
                  <span><strong>{p.name}</strong><small>{p.scopes}{isRequired?' · 当前岗位必需':''}</small></span>
                </label>;
              })}
            </div>
            {managementSelected&&<>
              <div className="people-grants-title"><strong>管理工作台内的岗位范围（至少选择一个）</strong><span>可多选</span></div>
              <div className="people-grants">
                {SCOPES_IN_PORTAL.management.map(d=><label key={d} className={selected.includes(d)?'selected':''}>
                  <input type="checkbox" checked={selected.includes(d)} disabled={d===requiredDesk} onChange={()=>toggle(d)}/>
                  <span><strong>{scopeName(d)}</strong><small>{roleInfo(d).description}</small></span>
                </label>)}
              </div>
            </>}
            {requiredDesk&&<p className="helper-text">当前岗位为「{scopeName(requiredDesk)}」，对应岗位范围不能移除；如需调整岗位请联系系统管理员。</p>}
          </fieldset>
          {managementSelected&&<p className="people-grant-note"><ShieldCheck size={14} aria-hidden="true"/>管理工作台可派单、验收及管理人员授权；管理、运营、售后三个范围请按实际职责勾选。</p>}
          <div className="form-grid">
            <label className="field">默认工作台<select name="memberDefaultDesk" required value={defaultPortalValue||''} onChange={e=>{const p=e.target.value as Portal;if(!editing)return;setEditing({...editing,defaultDesk:preferredScope(asGrants(editing,selected),p,editing.defaultDesk&&portalOfDesk(editing.defaultDesk)===p?editing.defaultDesk:undefined)})}}>{!selectedPortals.length&&<option value="">先选择工作台权限</option>}{selectedPortals.map(p=><option key={p} value={p}>{portalName(p)}</option>)}</select></label>
            <label className="field">历史区域（不用于权限）<select name="memberRegion" disabled={isScopedManager(member)} value={editing.region||'广州总部'} onChange={e=>setEditing({...editing,region:e.target.value})}>{(selected.includes('sales')&&!selected.includes('management')?['广州总部','湖南分部']:['广州总部','湖南分部','全部分部']).map(r=><option key={r}>{r}</option>)}</select></label>
          </div>
          <label className="field">账号状态<select name="memberStatus" value={editing.status||'active'} onChange={e=>setEditing({...editing,status:e.target.value as Member['status']})}><option value="active">启用，可登录</option><option value="disabled">停用，禁止登录</option></select></label>
        </fieldset>
        <div className="form-actions"><button className="button" type="button" disabled={saving} onClick={()=>setEditing(null)}>取消</button><button className="button primary" type="submit" disabled={saving||!selected.length}>{saving?'正在保存…':editing.id?'保存人员权限':'添加成员并开通账号'}</button></div>
      </form>
    </FinanceModal>}
  </div>;
}
