'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import {
  Building2,
  ArrowRight,
  BriefcaseBusiness,
  Wallet,
  Users,
  ShieldCheck,
  HeartHandshake,
  LogOut,
  Star,
} from 'lucide-react';
import { Member, roleInfo } from '../team';
import { grantedDesks, defaultDesk } from '../access';
const icons = {
  sales: BriefcaseBusiness,
  finance: Wallet,
  operations: Users,
  aftersales: HeartHandshake,
  management: ShieldCheck,
};
const subscribeName = () => () => {};
export default function DeskSelector({
  member,
  demo = false,
}: {
  member: Member;
  demo?: boolean;
}) {
  const displayName = useSyncExternalStore(
    subscribeName,
    () => {
      try {
        return demo
          ? sessionStorage.getItem('gushi-demo-real-name') || member.name
          : member.name;
      } catch {
        return member.name;
      }
    },
    () => member.name,
  );
  return (
    <main className="desk-selector-shell">
      <header>
        <Link className="entry-brand" href="/">
          <span>
            <Building2 size={25} />
          </span>
          <strong>
            固实能源<small>PROJECT WORKSPACE</small>
          </strong>
        </Link>
        <div>
          <span>{displayName}</span>
          <button
            className="text-button"
            onClick={async () => {
              if (!demo)
                await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'logout' }),
                });
              location.assign('/');
            }}
          >
            <LogOut size={14} />
            切换账号
          </button>
        </div>
      </header>
      <section className="desk-selector-title">
        <span className="entry-eyebrow">YOUR WORKSPACES</span>
        <h1>选择本次工作的工作台</h1>
        <p>
          {demo ? '演示一个账号兼任多个岗位。' : '你已完成账号设置。'}
          这里只显示管理人员为你开通的工作台，之后也可在页面顶部切换。
        </p>
      </section>
      <div className="desk-selector-grid">
        {grantedDesks(member).map((d) => {
          const Icon = icons[d];
          return (
            <Link
              key={d}
              className={'desk-selector-card desk-' + d}
              href={demo ? '/demo?role=' + d + '&account=multi' : '/work/' + d}
            >
              <span className="desk-selector-symbol">
                <Icon size={25} />
              </span>
              {d === defaultDesk(member) && (
                <small>
                  <Star size={11} />
                  默认工作台
                </small>
              )}
              <h2>{roleInfo(d).name}台</h2>
              <p>{roleInfo(d).description}</p>
              <span className="desk-selector-enter">
                进入工作台
                <ArrowRight size={17} />
              </span>
            </Link>
          );
        })}
      </div>
      <div className="desk-selector-help">
        <ShieldCheck size={17} />
        <p>
          需要增加或调整工作台？请联系管理台。切换工作台会同步切换对应的项目、任务和消息范围。
        </p>
      </div>
    </main>
  );
}
