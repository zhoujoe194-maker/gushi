'use client';
import Link from 'next/link';
import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  Building2,
  Check,
  ArrowRight,
  ShieldCheck,
  UserRound,
  LockKeyhole,
} from 'lucide-react';
import { Member, portalInfo, roleInfo } from '../../team';
import {
  grantedDesks,
  grantedPortals,
  needsOnboarding,
  realNameProblem,
} from '../../access';
const subscribeHydration = () => () => {};
export default function Security({
  member,
  demo = false,
}: {
  member: Member;
  demo?: boolean;
}) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const onboarding = needsOnboarding(member),
    profileNeeded = member.profileCompleted === false,
    passwordNeeded = !!member.mustChangePassword || !onboarding;
  const [name, setName] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [oldPassword, setOld] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <main className="onboarding-shell">
      <Link className="entry-brand" href="/">
        <span>
          <Building2 size={25} />
        </span>
        <strong>
          固实能源<small>PROJECT WORKSPACE</small>
        </strong>
      </Link>
      <div className="onboarding-layout">
        <section className="onboarding-intro">
          <span className="entry-eyebrow">
            {onboarding ? '欢迎加入公司工作区' : '账号与安全'}
          </span>
          <h1>
            {onboarding ? (
              <>
                先认识你，
                <br />
                再开始协作。
              </>
            ) : (
              '管理你的账号安全'
            )}
          </h1>
          <p>
            {onboarding
              ? '只需完成首次设置，同事就能在任务、项目和消息中看到你的真实姓名。'
              : '修改密码后，其他设备需要重新登录。'}
          </p>
          <ol>
            {[
              '管理人员已开通账号并分配工作台',
              '本人确认真实姓名，设置个人密码',
              '按授权进入工作台，开始处理业务',
            ].map((s, i) => (
              <li key={s}>
                <span>{i === 0 ? <Check size={15} /> : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="onboarding-access">
            <small>管理人员已为你开通的工作台</small>
            <div>
              {grantedPortals(member).map((p) => (
                <span key={p}>{portalInfo(p).name}</span>
              ))}
            </div>
            <p>
              岗位范围：
              {grantedDesks(member).map((d) => roleInfo(d).name).join('、')}
              。岗位由管理人员分配，如有不符请联系管理工作台调整。
            </p>
          </div>
        </section>
        <section className="password-card onboarding-card">
          <span className="login-card-icon">
            {profileNeeded ? (
              <UserRound size={24} />
            ) : (
              <LockKeyhole size={24} />
            )}
          </span>
          <h2 id="security-form-title">
            {profileNeeded
              ? '完成首次使用设置'
              : member.mustChangePassword
                ? '设置你的个人密码'
                : '修改账号密码'}
          </h2>
          <p id="security-form-description">
            {demo
              ? '演示首次登录流程，不会修改真实账号。'
              : profileNeeded
                ? '账号已验证。请填写本人真实姓名，完成后即可进入授权工作台。'
                : member.mustChangePassword
                  ? '初始密码或重置密码需在使用前修改。'
                  : member.name + ' · 修改后旧登录会失效。'}
          </p>
          <form
            aria-labelledby="security-form-title"
            aria-describedby="security-form-description"
            aria-busy={busy}
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError('');
              if (profileNeeded) {
                const issue = realNameProblem(name);
                if (issue) {
                  setError(issue);
                  return;
                }
                if (!confirmed) {
                  setError('请确认本人真实姓名');
                  return;
                }
              }
              if (passwordNeeded && password !== confirm) {
                setError('两次新密码不一致');
                return;
              }
              setBusy(true);
              try {
                if (demo) {
                  sessionStorage.setItem('gushi-demo-real-name', name);
                  location.assign('/demo?view=workspaces');
                  return;
                }
                const r = await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: onboarding ? 'complete_profile' : 'change_password',
                    name,
                    confirmName: confirmed,
                    oldPassword,
                    password,
                  }),
                });
                const b = (await r.json()) as {
                  error?: string;
                  redirectTo: string;
                };
                if (!r.ok) throw Error(b.error);
                location.assign(b.redirectTo);
              } catch (e) {
                setError(e instanceof Error ? e.message : '设置未完成，请重试');
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <div
                ref={errorRef}
                id="security-form-error"
                tabIndex={-1}
                className="error-box"
                role="alert"
              >
                {error}
              </div>
            )}
            {profileNeeded && (
              <>
                <label className="field">
                  真实姓名 <em>*</em>
                  <input
                    aria-label="真实姓名"
                    aria-describedby="security-name-hint"
                    aria-invalid={!!error && !!realNameProblem(name)}
                    disabled={!hydrated || busy}
                    required
                    minLength={2}
                    maxLength={50}
                    autoComplete="name"
                    placeholder="请输入你本人的真实姓名"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <small id="security-name-hint">
                    用于任务承办、项目分工及消息留名，不是登录账号。
                  </small>
                </label>
                <label className="confirm-real-name">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    disabled={!hydrated || busy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  我确认填写的是本人真实姓名
                </label>
              </>
            )}
            {passwordNeeded && (
              <>
                <label className="field">
                  {member.mustChangePassword
                    ? '管理员提供的初始密码'
                    : '原密码'}
                  <input
                    disabled={!hydrated || busy}
                    required
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    value={oldPassword}
                    onChange={(e) => setOld(e.target.value)}
                  />
                </label>
                <div className="onboarding-passwords">
                  <label className="field">
                    新密码
                    <input
                      disabled={!hydrated || busy}
                      required
                      type="password"
                      autoComplete="new-password"
                      aria-describedby="security-password-hint"
                      minLength={12}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    再次输入新密码
                    <input
                      disabled={!hydrated || busy}
                      required
                      type="password"
                      autoComplete="new-password"
                      aria-describedby="security-password-hint"
                      minLength={12}
                      maxLength={128}
                      aria-invalid={!!error && password !== confirm}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </label>
                </div>
                <p
                  id="security-password-hint"
                  className="onboarding-password-hint"
                >
                  至少 12 位，建议使用不易猜测的字母、数字和符号组合。
                </p>
              </>
            )}
            <button
              className="button primary login-submit"
              disabled={busy || !hydrated}
            >
              {busy
                ? '正在保存…'
                : onboarding
                  ? '完成设置，进入工作区'
                  : '保存新密码'}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="login-security">
            <ShieldCheck size={15} />
            <span>只能进入管理人员已授权的工作台</span>
          </div>
          <Link className="text-button onboarding-exit" href="/">
            返回登录页
          </Link>
        </section>
      </div>
    </main>
  );
}
