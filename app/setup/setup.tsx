'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react';
import { realNameProblem } from '../access';
import type { SetupState } from './model';

const subscribe = () => () => {};

export default function Setup({ state }: { state: SetupState }) {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(''),
    [name, setName] = useState('');
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(''),
    [closed, setClosed] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const disabled = !ready || busy || closed;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const problem = realNameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirmation) {
      setError('两次新密码不一致');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name,
          confirmName: confirmed,
          password,
          confirmPassword: confirmation,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (res.status === 409) setClosed(true);
      if (!res.ok) throw Error(data.error || '启用未完成，请稍后重试');
      setToken('');
      setPassword('');
      setConfirmation('');
      window.location.assign(data.redirectTo || '/workspaces');
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : '暂时无法连接，请稍后重试',
      );
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell setup-shell">
      <Link className="entry-brand" href="/" aria-label="固实能源工作台首页">
        <span>
          <Building2 size={25} aria-hidden="true" />
        </span>
        <strong>
          固实能源<small>PROJECT WORKSPACE</small>
        </strong>
      </Link>
      <div className="onboarding-layout setup-layout">
        <section className="onboarding-intro" aria-labelledby="setup-title">
          <span className="entry-eyebrow">公司首次启用</span>
          <h1 id="setup-title">
            启用公司
            <br />
            工作区。
          </h1>
          <p>
            确认启用码，设置你的管理员账号。完成后，就可以为同事开通工作台。
          </p>
          <ol>
            <li>
              <span>1</span>填写部署负责人提供的启用码
            </li>
            <li>
              <span>2</span>确认真实姓名，设置个人密码
            </li>
            <li>
              <span>3</span>进入管理台，添加成员与分配权限
            </li>
          </ol>
          <div className="onboarding-access">
            <small>首位管理员的工作台</small>
            <div>
              {['管理', '销售', '财务', '运营', '售后'].map((d) => (
                <span key={d}>{d}台</span>
              ))}
            </div>
            <p>启用成功后，本入口自动关闭。</p>
          </div>
        </section>
        <section
          className="password-card onboarding-card setup-card"
          aria-labelledby="setup-form-title"
        >
          <span className="login-card-icon">
            <ShieldCheck size={24} aria-hidden="true" />
          </span>
          <h2 id="setup-form-title">
            {state.status === 'ready' ? '设置首位管理员' : '等待启用配置'}
          </h2>
          {state.status !== 'ready' ? (
            <>
              <p role="status">
                {state.status === 'unavailable'
                  ? '暂时无法连接公司工作区，请联系部署负责人检查服务后重试。'
                  : '启用信息尚未配置，请联系部署负责人设置管理员邮箱与启用码。'}
              </p>
              <a className="button primary login-submit" href="/setup">
                重新检查
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <p className="setup-note">
                员工账号由管理员开通。公司启用完成后，员工从首页登录。
              </p>
            </>
          ) : (
            <>
              <dl className="setup-account">
                <div>
                  <dt>预设管理员邮箱</dt>
                  <dd>{state.emailHint}</dd>
                </div>
              </dl>
              <form
                onSubmit={submit}
                aria-labelledby="setup-form-title"
                aria-busy={busy}
              >
                {error && (
                  <div
                    ref={errorRef}
                    tabIndex={-1}
                    className="error-box"
                    role="alert"
                  >
                    {error}
                    {closed && (
                      <p>
                        <Link href="/">前往登录</Link>
                      </p>
                    )}
                  </div>
                )}
                <label className="field" htmlFor="setup-token">
                  一次性启用码 <em>*</em>
                  <input
                    id="setup-token"
                    disabled={disabled}
                    type="password"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={128}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    aria-describedby="setup-token-hint"
                  />
                  <small id="setup-token-hint">
                    由部署负责人提供，仅用于第一次启用公司工作区。
                  </small>
                </label>
                <label className="field" htmlFor="setup-name">
                  真实姓名 <em>*</em>
                  <input
                    id="setup-name"
                    disabled={disabled}
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={50}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-describedby="setup-name-hint"
                  />
                  <small id="setup-name-hint">
                    用于项目分工、任务承办和消息留名。
                  </small>
                </label>
                <label className="confirm-real-name">
                  <input
                    type="checkbox"
                    required
                    disabled={disabled}
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  我确认填写的是本人真实姓名
                </label>
                <div className="onboarding-passwords">
                  <label className="field" htmlFor="setup-password">
                    设置个人密码 <em>*</em>
                    <input
                      id="setup-password"
                      disabled={disabled}
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby="setup-password-hint"
                    />
                  </label>
                  <label className="field" htmlFor="setup-confirm">
                    再次输入密码 <em>*</em>
                    <input
                      id="setup-confirm"
                      disabled={disabled}
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      aria-describedby="setup-password-hint"
                    />
                  </label>
                </div>
                <p
                  id="setup-password-hint"
                  className="onboarding-password-hint"
                >
                  至少 12 位。以后使用预设邮箱和这个个人密码登录。
                </p>
                <button
                  type="submit"
                  className="button primary login-submit"
                  disabled={disabled}
                >
                  {busy ? '正在启用…' : '启用并进入工作区'}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </form>
              <p className="setup-note">
                这是公司管理员的首次启用页面。员工账号由管理台统一开通。
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
