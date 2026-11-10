'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import {
  Building2,
  ArrowRight,
  BriefcaseBusiness,
  Wallet,
  ShieldCheck,
  LogOut,
  Star,
} from 'lucide-react';
import {
  Member,
  PORTALS,
  Portal,
  SCOPES_IN_PORTAL,
  roleInfo,
} from '../team';
import { grantedPortals, defaultPortal, scopesInPortal } from '../access';
// D1: the only entrances are the three workbenches. Operations and aftersales
// still have their own granular scope inside the management workbench.
const icons = {
  sales: BriefcaseBusiness,
  management: ShieldCheck,
  finance: Wallet,
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
  const portals: Portal[] = demo ? [...PORTALS.map((p) => p.id)] : grantedPortals(member);
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
        <span className="entry-eyebrow">THREE WORKBENCHES</span>
        <h1>选择本次工作的工作台</h1>
        <p>
          {demo
            ? '演示账号可进入全部三个工作台。'
            : '你已完成账号设置。这里只显示管理人员为你开通的工作台。'}
          三个工作台是日常工作的主要入口；运营、售后在管理工作台内协作，无需单独进入。
        </p>
      </section>
      <div className="desk-selector-grid">
        {portals.map((p) => {
          const portal = PORTALS.find((x) => x.id === p)!;
          const Icon = icons[p];
          const scopes = demo ? SCOPES_IN_PORTAL[p] : scopesInPortal(member, p);
          return (
            <Link
              key={p}
              className={'desk-selector-card desk-' + p}
              href={demo ? '/demo?role=' + p : '/work/' + p}
            >
              <span className="desk-selector-symbol">
                <Icon size={25} />
              </span>
              {p === defaultPortal(member) && (
                <small>
                  <Star size={11} />
                  默认工作台
                </small>
              )}
              <h2>{portal.name}</h2>
              <p>{portal.description}</p>
              <p>岗位范围：{scopes.map((d) => roleInfo(d).name).join(' · ')}</p>
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
          需要增加或调整工作台？请联系管理工作台。切换工作台会同步切换对应的项目、任务和消息范围。
        </p>
      </div>
    </main>
  );
}
