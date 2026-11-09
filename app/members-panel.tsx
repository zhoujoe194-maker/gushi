'use client';
import {useId,useState} from 'react';
import {Plus,Search,Users,Layers3,ShieldCheck,UserRoundCheck,Copy,Check,ArrowRight} from 'lucide-react';
import {Member,Desk,ROLES,roleInfo,isScopedManager} from './team';
import {grantedDesks,defaultDesk} from './access';
import {FinanceModal} from './role-panels';

type Draft=Partial<Member>&{password?:string};

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
  const multi=active.filter(m=>grantedDesks(m).length>1);
  const counts=[['启用成员',active.length,Users],['待完成首次设置',pending.length,UserRoundCheck],['拥有多个工作台',multi.length,Layers3]] as const;
  const filtered=members.filter(m=>(!query||[m.name,m.email,m.phone,m.region].join(' ').toLowerCase().includes(query.toLowerCase()))&&(filter==='全部成员'||filter==='待激活'&&m.status==='active'&&(m.profileCompleted===false||m.mustChangePassword)||filter==='多台授权'&&grantedDesks(m).length>1||filter==='已停用'&&m.status==='disabled'));

  function start(m?:Member) {
    setError('');
    setEditing(m?{...m,assignedDesks:grantedDesks(m),defaultDesk:defaultDesk(m),password:''}:{name:'',email:'',phone:'',password:'',assignedDesks:['sales'],defaultDesk:'sales',region:isScopedManager(member)?member.region:'广州总部',status:'active'});
  }

  function toggle(d:Desk) {
    if(!editing)return;
    const old=editing.assignedDesks||[];
    const desks=old.includes(d)?old.filter(k=>k!==d):[...old,d];
    setEditing({...editing,assignedDesks:desks,defaultDesk:desks.includes(editing.defaultDesk!)?editing.defaultDesk:desks[0],region:desks.includes('sales')&&!desks.includes('management')&&editing.region==='全部分部'?'广州总部':editing.region});
  }

  async function instructions(m:Member) {
    const s=`公司工作区：${location.origin}\n登录账号：${m.email||m.phone}\n首次登录：填写本人真实姓名并修改初始密码。\n已开通：${grantedDesks(m).map(d=>roleInfo(d).name+'台').join('、')}\n默认工作台：${roleInfo(defaultDesk(m)).name}台\n初始密码请由管理人员另行提供，请勿转发。`;
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
  return <div className="people-management">
    <div className="people-heading">
      <div><h2>成员账号</h2><p>一个员工一个账号，按实际分工开通一个或多个工作台。</p></div>
      <button type="button" className="button primary" disabled={saving} onClick={()=>start()}><Plus size={16} aria-hidden="true"/>添加新成员</button>
    </div>
    <div className="people-metrics">{counts.map(([name,n,Icon])=><div key={name}><span>{name}<Icon size={18} aria-hidden="true"/></span><strong>{n}<small>人</small></strong></div>)}</div>
    <div className="people-onboarding" aria-label="员工账号开通流程">{['管理添加账号','勾选工作台权限','员工实名与改密','按授权进入工作台'].map((s,i)=><div key={s}><span>{i+1}</span>{s}{i<3&&<ArrowRight size={13} aria-hidden="true"/>}</div>)}</div>
    {error&&!editing&&<div className="error-box" role="alert">{error}</div>}
    <p className="sr-only" role="status" aria-live="polite">{copyStatus}</p>
    <section className="panel" aria-label="成员列表">
      <div className="people-toolbar">
        <div className="list-tabs" role="group" aria-label="筛选成员">{['全部成员','待激活','多台授权','已停用'].map(f=><button type="button" key={f} className={filter===f?'active':''} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}</button>)}</div>
        <label className="search-field"><Search size={16} aria-hidden="true"/><span className="sr-only">搜索姓名、账号或分部</span><input type="search" placeholder="搜索姓名、账号或分部" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      </div>
      <div className="table-scroll">
        <table className="member-table people-table" role="table">
          <caption className="sr-only">成员账号与工作台权限，共 {filtered.length} 位成员</caption>
          <thead><tr>{['成员 / 登录账号','可进入的工作台','默认工作台','所属分部','使用状态','操作'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{filtered.map(m=><tr key={m.id}>
            <td data-label="成员 / 账号"><div className="people-name"><span className="avatar" aria-hidden="true">{m.name.slice(0,1)}</span><strong>{m.name}{(m.accountRole||m.role)==='owner'&&<small>系统管理员</small>}</strong></div><small>{m.email||m.phone||'未填写登录账号'}</small>{m.email&&m.phone&&<small>{m.phone}</small>}</td>
            <td data-label="工作台权限"><div className="people-desk-tags">{grantedDesks(m).map(d=><span key={d}>{roleInfo(d).name}</span>)}</div></td>
            <td data-label="默认工作台">{roleInfo(defaultDesk(m)).name}台</td>
            <td data-label="所属分部">{m.region}</td>
            <td data-label="状态"><span className={'badge '+(m.status==='disabled'?'gray':m.profileCompleted===false?'amber':m.mustChangePassword?'blue':'green')}>{m.status==='disabled'?'已停用':m.profileCompleted===false?'待完善实名':m.mustChangePassword?'待修改密码':'已激活'}</span></td>
            <td data-label="操作"><div className="people-row-actions">{(m.accountRole||m.role)!=='owner'&&m.id!==member.id&&<button type="button" className="button small-button" aria-label={'管理'+m.name+'的权限'} disabled={saving} onClick={()=>start(m)}>管理权限</button>}<button type="button" className="icon-button" aria-label={'复制'+m.name+'的登录说明'} onClick={()=>instructions(m)}>{copied===m.id?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length&&<div className="small-empty" role="status">暂无符合条件的成员。请尝试其他姓名、账号或筛选条件。</div>}
    </section>
    <div className="membership-notice"><ShieldCheck size={19} aria-hidden="true"/><p>管理台负责分配权限，员工不能自行选择岗位获得权限。修改授权、停用或重置密码后，原登录立即失效；成员再次登录时按最新授权进入。</p></div>
    {editing&&<FinanceModal title={editing.id?'管理成员与工作台权限':'添加新成员'} close={()=>!saving&&setEditing(null)}>
      <form className="project-form people-form" aria-busy={saving} onSubmit={async e=>{
        e.preventDefault();
        if(saving)return;
        setError('');
        setSubmitting(true);
        try {
          if(!selected.length)throw Error('至少选择一个工作台');
          if(await onSave({...editing,role:editing.defaultDesk}))setEditing(null);
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
            <p className="helper-text" id={`${id}-grants-hint`}>可以多选 · 已选 {selected.length} 个{isScopedManager(member)&&'。管理台权限由系统管理员分配。'}</p>
            <div className="people-grants">{ROLES.map(r=><label key={r.id} className={selected.includes(r.id as Desk)?'selected':''}><input type="checkbox" checked={selected.includes(r.id as Desk)} disabled={isScopedManager(member)&&r.id==='management'} onChange={()=>toggle(r.id as Desk)}/><span><strong>{r.name}台</strong><small>{r.description}</small></span></label>)}</div>
          </fieldset>
          {selected.includes('management')&&<p className="people-grant-note"><ShieldCheck size={14} aria-hidden="true"/>管理台可派单、验收及管理人员授权，请按实际职责分配。</p>}
          <div className="form-grid">
            <label className="field">默认工作台<select name="memberDefaultDesk" required value={editing.defaultDesk||''} onChange={e=>setEditing({...editing,defaultDesk:e.target.value as Desk})}>{!selected.length&&<option value="">先选择工作台权限</option>}{selected.map(d=><option key={d} value={d}>{roleInfo(d).name}台</option>)}</select></label>
            <label className="field">所属分部<select name="memberRegion" disabled={isScopedManager(member)} value={editing.region||'广州总部'} onChange={e=>setEditing({...editing,region:e.target.value})}>{(selected.includes('sales')&&!selected.includes('management')?['广州总部','湖南分部']:['广州总部','湖南分部','全部分部']).map(r=><option key={r}>{r}</option>)}</select></label>
          </div>
          <label className="field">账号状态<select name="memberStatus" value={editing.status||'active'} onChange={e=>setEditing({...editing,status:e.target.value as Member['status']})}><option value="active">启用，可登录</option><option value="disabled">停用，禁止登录</option></select></label>
        </fieldset>
        <div className="form-actions"><button className="button" type="button" disabled={saving} onClick={()=>setEditing(null)}>取消</button><button className="button primary" type="submit" disabled={saving||!selected.length}>{saving?'正在保存…':editing.id?'保存人员权限':'添加成员并开通账号'}</button></div>
      </form>
    </FinanceModal>}
  </div>;
}
