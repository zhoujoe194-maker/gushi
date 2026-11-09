'use client';
import {useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {Building2,ArrowRight,ShieldCheck,Eye,EyeOff,Mail,LockKeyhole,Users,UserRoundCheck,Layers3,Check} from 'lucide-react';
import {ROLES,Role,Session} from './team';
import {entryDestination} from './access';

function subscribeToSearch(onChange:()=>void) {
  window.addEventListener('popstate',onChange);
  return ()=>window.removeEventListener('popstate',onChange);
}

export default function Entry({session,error,initialized=true}:{session?:Session|null;error?:string;role?:Role;initialized?:boolean}) {
  const search=useSyncExternalStore(subscribeToSearch,()=>location.search,()=>null);
  const hydrated=search!==null;
  const [identifier,setIdentifier]=useState('');
  const [password,setPassword]=useState('');
  const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(error||'');
  const [assistance,setAssistance]=useState('');
  const [guide,setGuide]=useState<boolean|null>(null);
  const showGuide=guide??(!initialized||new URLSearchParams(search||'').get('guide')==='1');

  async function submit(e:React.FormEvent) {
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    setMessage('');
    setAssistance('');
    try {
      const res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',identifier,password})});
      const body=await res.json() as {error?:string;redirectTo:string};
      if(!res.ok)throw Error(body.error);
      window.location.assign(body.redirectTo);
    } catch(e) {
      setMessage((e as Error).message||'登录失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  const unavailable=busy||!hydrated||!initialized;
  return <main className="entry-shell password-entry company-login" id="main-content">
    <header className="entry-header">
      <Link href="/" className="entry-brand" aria-label="固实能源工作台首页"><span><Building2 size={25} aria-hidden="true"/></span><strong>固实能源<small>PROJECT WORKSPACE</small></strong></Link>
      <div className="entry-header-links"><button type="button" className="text-button" aria-expanded={showGuide} aria-controls="first-use-guide" onClick={()=>setGuide(!showGuide)}>首次使用说明</button><a className="entry-demo" href="/demo?role=management">体验演示<ArrowRight size={15} aria-hidden="true"/></a></div>
    </header>
    <div className="password-entry-layout">
      <section className="password-intro" aria-labelledby="login-page-title">
        <span className="entry-eyebrow">一个账号，连接你的每一份工作</span>
        <h1 id="login-page-title">从这里登录，<br/>在各岗位协同。</h1>
        <p>项目、任务、消息与业务记录集中处理。<br/>管理人员分配权限，你专注自己的工作。</p>
        <div className="login-desks" aria-label="公司工作台">{ROLES.map(r=><span key={r.id}>{r.name}</span>)}</div>
        <div className="login-onboarding-preview">{[[Users,'管理开通账号','先分配可进入的工作台'],[UserRoundCheck,'本人完善资料','首次填写真实姓名并改密'],[Layers3,'进入授权工作台','单台直达，多台选择与切换']].map(([Icon,title,detail])=>{
          const I=Icon as typeof Users;
          return <div key={String(title)}><span><I size={19} aria-hidden="true"/></span><div><strong>{String(title)}</strong><p>{String(detail)}</p></div><Check size={15} aria-hidden="true"/></div>;
        })}</div>
      </section>
      <section className="password-card" aria-labelledby="login-form-title">
        <span className="login-card-icon"><LockKeyhole size={23} aria-hidden="true"/></span>
        <h2 id="login-form-title">登录公司工作区</h2>
        <p id="login-account-hint">使用公司管理人员为你开通的账号。<br/>工作台权限由账号决定，无需选择登录岗位。</p>
        {!initialized&&<div className="login-initialization-note" role="status"><strong>公司工作区尚未初始化</strong><p>公司管理员可通过首次启用向导完成设置，再为员工开通账号。</p><a className="text-button" href="/setup">前往首次启用<ArrowRight size={14} aria-hidden="true"/></a></div>}
        {session?<>
          <a className="button primary login-submit" href={entryDestination(session.member)}>以 {session.member.name} 继续<ArrowRight size={16} aria-hidden="true"/></a>
          <button type="button" className="text-button" disabled={busy} onClick={async()=>{
            if(busy)return;
            setBusy(true);
            try {
              const res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
              if(!res.ok)throw Error('暂时无法切换账号，请重试。');
              location.reload();
            } catch(e) {
              setMessage((e as Error).message);
              setBusy(false);
            }
          }}>{busy?'正在切换…':'切换账号'}</button>
          {message&&<div className="error-box" role="alert">{message}</div>}
        </>:<form onSubmit={submit} aria-labelledby="login-form-title" aria-busy={busy}>
          {message&&<div id="login-error" className="error-box" role="alert">{message}</div>}
          <div className="field">
            <label htmlFor="login-identifier">邮箱或手机号</label>
            <div className="login-input"><Mail size={17} aria-hidden="true"/><input id="login-identifier" name="identifier" disabled={unavailable} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={200} aria-describedby={message?'login-account-hint login-error':'login-account-hint'} value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="请输入公司开通的邮箱或手机号"/></div>
          </div>
          <div className="field">
            <label htmlFor="login-password">密码</label>
            <div className="login-input"><LockKeyhole size={17} aria-hidden="true"/><input id="login-password" name="password" disabled={unavailable} type={visible?'text':'password'} autoComplete="current-password" required maxLength={128} aria-describedby={message?'login-password-hint login-error':'login-password-hint'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="请输入密码"/><button type="button" aria-label="显示密码" aria-pressed={visible} aria-controls="login-password" disabled={unavailable} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={17} aria-hidden="true"/>:<Eye size={17} aria-hidden="true"/>}</button></div>
            <small id="login-password-hint">首次登录请使用管理人员提供的初始密码。</small>
          </div>
          <button type="submit" className="button primary login-submit" disabled={unavailable}>{busy?'正在登录…':'登录工作区'}<ArrowRight size={17} aria-hidden="true"/></button>
          <div className="login-assistance"><button type="button" aria-expanded={showGuide} aria-controls="first-use-guide" onClick={()=>setGuide(true)}>还没有账号？</button><button type="button" onClick={()=>setAssistance('请联系公司管理人员核实身份并重置密码；重置后需设置新的个人密码。')}>忘记密码</button></div>
          <p className={assistance?'login-assistance-note':'sr-only'} role="status" aria-live="polite">{assistance}</p>
        </form>}
        <div className="login-security"><ShieldCheck size={16} aria-hidden="true"/><span>员工账号与工作台权限由管理人员开通</span></div>
      </section>
    </div>
    <section id="first-use-guide" className="first-use-guide" aria-labelledby="first-use-title" hidden={!showGuide}>
      <div><span className="entry-eyebrow">GET STARTED</span><h2 id="first-use-title">网站刚启用，大家怎样开始？</h2><p>先开通、再登录，账号与真实员工一一对应。</p></div>
      <div className="first-use-steps">{[['公司先启用管理员','首次打开网站后，管理员填写部署负责人提供的启用码、本人真实姓名和个人密码，完成公司启用。'],['管理台添加员工并授权','在“人员管理”添加邮箱或手机号、初始密码，勾选可进入的工作台，并设置默认台与分部。'],['员工首次登录完善资料','管理人员提供公司网址、登录账号和初始密码；员工本人填写真实姓名，并设置个人密码。'],['进入对应岗位开始工作','只有一个台时直接进入；拥有多个台时选择本次工作台，登录后仍可在顶部切换。']].map(([title,body],i)=><div key={title}><span>{i+1}</span><h3>{title}</h3><p>{body}</p></div>)}</div>
      <div className="first-use-foot"><span>岗位在开通账号时由管理台设定；需要调整时联系管理人员。</span><a href="/demo?view=onboarding">体验首次登录流程<ArrowRight size={14} aria-hidden="true"/></a></div>
    </section>
    <footer className="entry-footer"><span>广州总部 · 湖南分部</span><span>仅限已授权公司成员使用</span></footer>
  </main>;
}
