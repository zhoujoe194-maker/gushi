"use client";
import { FinanceOperationsQueue } from "./finance-operations-panel";
import React, { useState, useRef, useId } from "react";
import { useModalFocus } from "./use-modal-focus";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
  X,
  BookOpen,
  TriangleAlert,
  Bell,
} from "lucide-react";
import {
  Member,
  Role,
  ROLES,
  roleInfo,
  canFinance,
  canEditProject,
  isManager,
  canViewFinance,
  canCreateProject,
  deskOf,
  taskVisible,
} from "./team";
import { Project, today, isActive, risk, Config } from "./model";
import { WorkflowOverview } from "./workflow-panels";
import { workflowOf, filingAlerts, departmentName } from "./workflow";
import {
  FinanceBook,
  PaymentPlan,
  emptyBook,
  totals,
  money,
  toCents,
} from "./finance-model";
export type FinanceAction = (
  project: Project,
  book: FinanceBook,
  action: Record<string, unknown>,
) => Promise<boolean>;
const Badge = ({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: string;
}) => <span className={"badge " + tone}>{children}</span>;
export function RoleHome({
  member,
  projects,
  books,
  config,
  onOpen,
  onFinance,
  onTab,
  onTask,
  onFollowup,
}: {
  member: Member;
  projects: Project[];
  books: Record<string, FinanceBook>;
  config: Config;
  onOpen: (p: Project) => void;
  onFinance: (p: Project) => void;
  onTab: (tab: string, department?: string) => void;
  onTask: (p: Project) => void;
  onFollowup: (p: Project) => void;
}) {
  if (isManager(member))
    return (
      <>
        <div className="role-welcome">
          <span>
            <ShieldCheck size={15} />
            {roleInfo(member.role).name}
          </span>
          <p>
            {member.role === "branch_manager"
              ? member.region + " · 仅显示授权分部项目"
              : "公司项目、部门进度与经营风险"}
          </p>
        </div>
        <WorkflowOverview
          projects={projects}
          config={config}
          onOpen={onOpen}
          onFollowup={onFollowup}
          onDepartment={(d) => onTab("tasks", d)}
          onFilings={() => onTab("filings")}
          onProjects={() => onTab("projects")}
        />
        <FinanceSummary
          projects={projects}
          books={books}
          onOpen={() => onTab("finance")}
        />
      </>
    );
  if (member.role === "finance")
    return (
      <FinanceCenter
        member={member}
        projects={projects}
        books={books}
        onOpen={onFinance}
      />
    );
  const tasks = projects.flatMap((p) =>
    workflowOf(p)
      .tasks.filter(
        (t) => taskVisible(t.department, member) && t.status !== "已完成",
      )
      .map((task) => ({ project: p, task })),
  );
  const active = projects.filter(isActive),
    todayProjects = active.filter((p) => p.nextDate === today()),
    alerts = filingAlerts(projects);
  return (
    <>
      <div className="role-welcome">
        <span>
          <Users size={15} />
          {member.name} · {roleInfo(member.role).name}
        </span>
        <p>
          {member.role === "sales"
            ? "专注本人负责的机会、客户和下一步行动"
            : "查看分配给本岗位的项目与协作，处理结果同步项目主跟。"}
        </p>
      </div>
      <div className="workflow-stats">
        <button onClick={() => onTab("projects")}>
          <span>
            {member.role === "sales" ? "我的项目" : "参与项目"}
            <BriefcaseBusiness size={18} />
          </span>
          <strong>
            {projects.length}
            <small>个</small>
          </strong>
          <p>按账号分配，服务端控制可见范围</p>
        </button>
        <button onClick={() => onTab("tasks")}>
          <span>
            {member.role === "sales" ? "历史销售协作" : "历史项目协作"}
            <ClipboardCheck size={18} />
          </span>
          <strong>
            {tasks.length}
            <small>项</small>
          </strong>
          <p>{tasks.filter((x) => x.task.dueDate < today()).length} 项已逾期</p>
        </button>
        <button
          onClick={() => onTab(member.role === "sales" ? "projects" : "tasks")}
        >
          <span>
            {member.role === "sales" ? "今日跟进" : "待反馈事项"}
            <Clock3 size={18} />
          </span>
          <strong>
            {member.role === "sales"
              ? todayProjects.length
              : tasks.filter((x) => x.task.status === "待反馈").length}
            <small>项</small>
          </strong>
          <p>办理结果回到同一个项目</p>
        </button>
        <button onClick={() => onTab("filings")}>
          <span>
            报备关注
            <FileCheck2 size={18} />
          </span>
          <strong>
            {alerts.length}
            <small>项</small>
          </strong>
          <p>相关项目的厂家报备与更新</p>
        </button>
      </div>
      <div className="management-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>
                {member.role === "sales"
                  ? "今日及逾期跟进"
                  : "我需要处理的事项"}
              </h2>
              <p>点击进入项目，查看背景和具体要求。</p>
            </div>
          </div>
          {member.role === "sales"
            ? active
                .filter((p) => p.nextDate <= today())
                .map((p) => (
                  <div className="role-project-line" key={p.id}>
                    <div>
                      <button
                        className="project-link"
                        onClick={() => onOpen(p)}
                      >
                        {p.name}
                      </button>
                      <p>{p.nextAction || "待安排下一步"}</p>
                    </div>
                    <Badge tone={risk(p, config.staleDays).tone}>
                      {p.nextDate}
                    </Badge>
                    <button
                      className="button small-button"
                      onClick={() => onFollowup(p)}
                    >
                      记录跟进
                    </button>
                  </div>
                ))
            : tasks.map(({ project: p, task: t }) => (
                <div className="role-project-line" key={t.id}>
                  <div>
                    <button className="project-link" onClick={() => onTask(p)}>
                      {t.title}
                    </button>
                    <p>
                      {p.name} · 期限 {t.dueDate}
                    </p>
                  </div>
                  <Badge tone={t.dueDate < today() ? "red" : "blue"}>
                    {t.status}
                  </Badge>
                </div>
              ))}
          {!(member.role === "sales"
            ? active.some((p) => p.nextDate <= today())
            : tasks.length) && (
            <div className="small-empty">目前没有需要立即处理的事项。</div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>项目与协作进展</h2>
              <p>共享项目上下文，按岗位维护工作结果。</p>
            </div>
          </div>
          {projects.slice(0, 5).map((p) => (
            <button
              className="handoff-line"
              key={p.id}
              onClick={() => onOpen(p)}
            >
              <span>
                <strong>{p.name}</strong>
                <small>
                  {p.stage} · 主跟 {p.owner} · {workflowOf(p).region}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!projects.length && (
            <div className="small-empty">
              尚未分配项目。
              {member.role === "sales"
                ? "可新建本人项目，或由管理人员分配。"
                : "由项目主跟或管理人员分配项目或协作事项后显示。"}
            </div>
          )}
        </section>
      </div>
      {member.role === "sales" && (
        <FinanceSummary
          projects={projects}
          books={books}
          onOpen={() => onTab("finance")}
        />
      )}
      <div className="role-shortcuts">
        <button onClick={() => onTab("guide")}>
          <BookOpen size={17} />
          查看本岗位跟进指南
          <ArrowRight size={14} />
        </button>
        <button onClick={() => onTab("tasks")}>
          <ClipboardCheck size={17} />
          查看本台任务
          <ArrowRight size={14} />
        </button>
      </div>
    </>
  );
}
export function FinanceSummary({
  projects,
  books,
  onOpen,
}: {
  projects: Project[];
  books: Record<string, FinanceBook>;
  onOpen: () => void;
}) {
  const list = projects.map((p) => books[p.id] || emptyBook(p.id));
  const sums = list.reduce(
    (s, b) => {
      const t = totals(b);
      return {
        balance: s.balance + t.balance,
        overdue: s.overdue + t.overdue,
        pending: s.pending + (b.reviewStatus === "待审核" ? 1 : 0),
        invoices: s.invoices + t.pendingInvoices,
      };
    },
    { balance: 0, overdue: 0, pending: 0, invoices: 0 },
  );
  return (
    <section className="panel finance-summary">
      <div>
        <Wallet size={22} />
        <span>
          <strong>合同与票款进度</strong>
          <small>已审核合同的应收及已确认流水</small>
        </span>
      </div>
      <button onClick={onOpen}>
        <small>待核合同</small>
        <strong>
          {sums.pending}
          <i>份</i>
        </strong>
      </button>
      <button onClick={onOpen}>
        <small>待收金额</small>
        <strong>¥ {money(sums.balance)}</strong>
      </button>
      <button onClick={onOpen}>
        <small>逾期金额</small>
        <strong className={sums.overdue ? "text-red" : ""}>
          ¥ {money(sums.overdue)}
        </strong>
      </button>
      <button onClick={onOpen}>
        <small>待开票</small>
        <strong>
          {sums.invoices}
          <i>项</i>
        </strong>
      </button>
    </section>
  );
}
export function FinanceCenter({
  member,
  projects,
  books,
  onOpen,
}: {
  member: Member;
  projects: Project[];
  books: Record<string, FinanceBook>;
  onOpen: (p: Project) => void;
}) {
  const [filter, setFilter] = useState(
    member.role === "finance" ? "待核合同" : "全部项目",
  );
  const rows = projects.filter((p) => {
    const b = books[p.id] || emptyBook(p.id),
      t = totals(b);
    return (
      filter === "全部项目" ||
      (filter === "待核合同" && b.reviewStatus === "待审核") ||
      (filter === "应收款" && t.balance > 0) ||
      (filter === "逾期款" && t.overdue > 0) ||
      (filter === "待开票" && t.pendingInvoices > 0)
    );
  });
  return (
    <>
      <FinanceOperationsQueue
        member={member}
        projects={projects}
        books={books}
        onOpen={onOpen}
      />
      <FinanceSummary
        projects={projects}
        books={books}
        onOpen={() => setFilter("全部项目")}
      />
      <section className="panel">
        <div className="list-tabs">
          {["全部项目", "待核合同", "应收款", "逾期款", "待开票"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="table-scroll">
          <table className="finance-table">
            <thead>
              <tr>
                <th>项目 / 客户</th>
                <th>合同状态</th>
                <th>合同金额</th>
                <th>已确认收款</th>
                <th>未收 / 逾期</th>
                <th>待开票</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const b = books[p.id] || emptyBook(p.id),
                  t = totals(b);
                return (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="project-link"
                        onClick={() => onOpen(p)}
                      >
                        {p.name}
                      </button>
                      <small>
                        {p.customer || "客户待补充"} · {p.owner}
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          b.reviewStatus === "已审核"
                            ? "green"
                            : b.reviewStatus === "退回修改"
                              ? "red"
                              : "amber"
                        }
                      >
                        {b.reviewStatus}
                      </Badge>
                    </td>
                    <td>¥ {money(b.contractAmountCents)}</td>
                    <td>¥ {money(t.received)}</td>
                    <td>
                      ¥ {money(t.balance)}
                      {t.overdue > 0 && (
                        <small className="text-red">
                          逾期 ¥ {money(t.overdue)}
                        </small>
                      )}
                    </td>
                    <td>{t.pendingInvoices} 项</td>
                    <td>
                      <button
                        className="button small-button"
                        onClick={() => onOpen(p)}
                      >
                        {member.role === "finance" ? "核验 / 处理" : "查看票款"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="small-empty">当前筛选下没有票款事项。</div>
        )}
      </section>
      <p className="helper-text">
        开票功能用于申请和登记实际发票信息；不会自动向税务系统开具发票。应收金额按财务审核后的收款计划计算。
      </p>
    </>
  );
}
export function FinanceModal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null),
    titleId = useId();
  useModalFocus(ref, close);
  return (
    <div
      className="modal-backdrop finance-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={"modal" + (wide ? " wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-heading">
          <h2 id={titleId} tabIndex={-1} data-modal-initial-focus>
            {title}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label={"关闭" + title}
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function ProjectFinance({
  member,
  project,
  book,
  onAction,
  busy,
}: {
  member: Member;
  project: Project;
  book: FinanceBook;
  onAction: FinanceAction;
  busy: boolean;
}) {
  const [mode, setMode] = useState(""),
    [error, setError] = useState(""),
    [amount, setAmount] = useState(""),
    [contractNo, setContractNo] = useState(""),
    [terms, setTerms] = useState(""),
    [note, setNote] = useState(""),
    [selected, setSelected] = useState(""),
    [decision, setDecision] = useState("approved"),
    [date, setDate] = useState(today()),
    [number, setNumber] = useState(""),
    [title, setTitle] = useState(project.customer),
    [taxNo, setTaxNo] = useState(""),
    [reference, setReference] = useState(""),
    [plans, setPlans] = useState<PaymentPlan[]>([]),
    [memo, setMemo] = useState(book.financeMemo || ""),
    [formVersion, setFormVersion] = useState(book.version);
  const total = totals(book);
  const finance = canFinance(member),
    edit = canEditProject(project, member);
  function open(m: string, id = "") {
    setFormVersion(book.version);
    setMode(m);
    setSelected(id);
    setError("");
    setNote("");
    setAmount("");
    setNumber("");
    setReference("");
    setDate(today());
    if (m === "contract") {
      setContractNo(book.contractNo);
      setAmount(
        book.contractAmountCents ? String(book.contractAmountCents / 100) : "",
      );
      setTerms(book.paymentTerms);
    }
    if (m === "review") {
      setDecision("approved");
      setPlans(book.plans.length ? book.plans.map(p=>({...p})) : [
        {
          id: crypto.randomUUID(),
          label: "合同货款",
          amountCents: book.contractAmountCents,
          dueDate: today(),
        },
      ]);
    }
    if (m === "receipt") {
      const p = book.plans.find((p) => p.id === id)!;
      const paid = book.receipts
        .filter((r) => !r.voidAt && r.planId === id)
        .reduce((s, r) => s + r.amountCents, 0);
      setAmount(String((p.amountCents - paid) / 100));
    }
    if (m === "process_invoice") setDecision("issued");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let action: Record<string, unknown> = {};
    const cents = toCents(amount);
    try {
      if (
        ["contract", "receipt", "invoice"].includes(mode) &&
        (!Number.isSafeInteger(cents) || cents <= 0)
      )
        throw Error("请填写正确金额，最多两位小数");
      if (mode === "contract")
        action = {
          action: "submit_contract",
          contractNo,
          contractAmountCents: cents,
          paymentTerms: terms,
        };
      if (mode === "review")
        action = { action: "review_contract", decision, note, plans };
      if (mode === "receipt")
        action = {
          action: "record_receipt",
          planId: selected,
          amountCents: cents,
          date,
          reference,
          note,
        };
      if (mode === "void")
        action = { action: "void_receipt", receiptId: selected, reason: note };
      if (mode === "invoice")
        action = {
          action: "request_invoice",
          amountCents: cents,
          title,
          taxNo,
          remark: note,
        };
      if (mode === "process_invoice")
        action = {
          action: "process_invoice",
          invoiceId: selected,
          decision,
          number,
          issuedDate: date,
          reply: note,
        };
      if (await onAction(project, { ...book, version: formVersion }, action))
        setMode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查填写内容");
    }
  }
  return (
    <div className="project-finance">
      {error && !mode && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div className="finance-contract-heading">
        <div>
          <h3>合同与票款</h3>
          <p>所有记录关联当前项目，销售、财务和管理同步查看。</p>
        </div>
        <Badge
          tone={
            book.reviewStatus === "已审核"
              ? "green"
              : book.reviewStatus === "退回修改"
                ? "red"
                : "amber"
          }
        >
          {book.reviewStatus}
        </Badge>
      </div>
      <div className="finance-project-stats">
        <div>
          <small>合同金额</small>
          <strong>¥ {money(book.contractAmountCents)}</strong>
        </div>
        <div>
          <small>已收金额</small>
          <strong>¥ {money(total.received)}</strong>
        </div>
        <div>
          <small>未收金额</small>
          <strong>¥ {money(total.balance)}</strong>
        </div>
        <div>
          <small>逾期金额</small>
          <strong className={total.overdue ? "text-red" : ""}>
            ¥ {money(total.overdue)}
          </strong>
        </div>
      </div>
      <section className="finance-block">
        {project.execution && (
          <>
            <h4>当前项目约定（商务与交付档案）</h4>
            <p className="business-prewrap">
              结算：{project.execution.settlement || "待补充"}；付款方式：
              {project.execution.paymentMethod || "待补充"}
            </p>
            <p className="business-prewrap">
              付款要求：{project.execution.paymentRequirements || "待补充"}
            </p>
            <p>
              约定 {project.execution.batchCount || "待确认"} 批；货期：
              {project.execution.leadTime || "待确认"}
            </p>
          </>
        )}
        {book.contractSnapshot && (
          <details>
            <summary>
              提交审核时的合同与交付快照（项目版本{" "}
              {book.contractSnapshot.projectVersion}）
            </summary>
            <p>
              合同面积：{book.contractSnapshot.commercial?.area ?? "待补充"}{" "}
              {book.contractSnapshot.commercial?.areaUnit}
            </p>
            <p className="business-prewrap">
              {book.contractSnapshot.execution?.contractTerms}
            </p>
            <p className="business-prewrap">
              结算：{book.contractSnapshot.execution?.settlement}；付款方式：
              {book.contractSnapshot.execution?.paymentMethod}
            </p>
            <p className="business-prewrap">
              付款要求：{book.contractSnapshot.execution?.paymentRequirements}
            </p>
            <p className="business-prewrap">
              技术要求：{book.contractSnapshot.execution?.technicalRequirements}
            </p>
            <p className="business-prewrap">
              货期：{book.contractSnapshot.execution?.leadTime}
            </p>
            {book.contractSnapshot.execution?.batches.map((b) => (
              <p key={b.id}>
                {b.name} · {b.goods} · {b.quantity ?? "待确认"} {b.unit} · 发货{" "}
                {b.shipDate || "待确认"} · 到货 {b.arrivalDate || "待确认"} ·{" "}
                {b.paymentTrigger} · {b.paymentTerms} · 付款日{" "}
                {b.paymentDueDate || "待确认"}
              </p>
            ))}
          </details>
        )}
        <div className="finance-block-heading">
          <h4>合同审核</h4>
          <div>
            {edit && book.reviewStatus !== "已审核" && (
              <button
                className="button small-button"
                onClick={() => open("contract")}
              >
                {book.contractNo ? "修改并提交" : "提交合同"}
              </button>
            )}
            {finance && book.reviewStatus === "待审核" && (
              <button
                className="button primary small-button"
                onClick={() => open("review")}
              >
                审核合同
              </button>
            )}
          </div>
        </div>
        <dl className="finance-contract-info">
          <div>
            <dt>合同编号</dt>
            <dd>{book.contractNo || "尚未提交"}</dd>
          </div>
          <div>
            <dt>付款约定</dt>
            <dd>{book.paymentTerms || "待销售提交合同及付款条件"}</dd>
          </div>
          <div>
            <dt>审核反馈</dt>
            <dd>{book.reviewNote || "暂无反馈"}</dd>
          </div>
        </dl>
      </section>
      <section className="finance-block">
        <div className="finance-block-heading">
          <h4>收款计划与确认</h4>
          <span>仅财务可确认实收</span>
        </div>
        {book.plans.length ? (
          book.plans.map((p) => {
            const paid = book.receipts
              .filter((r) => !r.voidAt && r.planId === p.id)
              .reduce((s, r) => s + r.amountCents, 0);
            return (
              <div className="payment-plan-row" key={p.id}>
                <div>
                  <strong>{p.label}</strong>
                  <p>
                    到期 {p.dueDate} · 应收 ¥ {money(p.amountCents)}
                  </p>
                </div>
                <div>
                  <strong>未收 ¥ {money(p.amountCents - paid)}</strong>
                  <small>已收 ¥ {money(paid)}</small>
                </div>
                {finance && paid < p.amountCents && (
                  <button
                    className="button small-button"
                    onClick={() => open("receipt", p.id)}
                  >
                    确认收款
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="small-empty">财务审核合同后生成收款计划。</div>
        )}
        {book.receipts.length > 0 && (
          <div className="receipt-history">
            <h5>收款流水</h5>
            {book.receipts.map((r) => (
              <div key={r.id}>
                <span>
                  {r.date} · ¥ {money(r.amountCents)}{" "}
                  {r.voidAt && <Badge tone="gray">已冲销</Badge>}
                  <small>
                    {r.voidAt
                      ? "冲销原因：" + r.voidReason
                      : r.note || "财务已确认"}
                  </small>
                </span>
                {finance && !r.voidAt && (
                  <button
                    className="text-button"
                    onClick={() => open("void", r.id)}
                  >
                    冲销记录
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="finance-block">
        <div className="finance-block-heading">
          <h4>开票申请与登记</h4>
          {(edit || finance) && book.reviewStatus === "已审核" && (
            <button
              className="button small-button"
              onClick={() => open("invoice")}
            >
              <Plus size={14} />
              申请开票
            </button>
          )}
        </div>
        {book.invoices.length ? (
          book.invoices.map((i) => (
            <div className="invoice-row" key={i.id}>
              <div>
                <strong>
                  ¥ {money(i.amountCents)} · {i.title}
                </strong>
                <p>税号 {i.taxNo}</p>
                <small>
                  {i.status === "已开票"
                    ? "发票号 " + i.number + " · " + i.issuedDate
                    : i.reply || i.remark || "等待财务核验与开票登记"}
                </small>
              </div>
              <Badge
                tone={
                  i.status === "已开票"
                    ? "green"
                    : i.status === "已退回"
                      ? "red"
                      : "amber"
                }
              >
                {i.status}
              </Badge>
              {finance && i.status === "待开票" && (
                <button
                  className="button small-button"
                  onClick={() => open("process_invoice", i.id)}
                >
                  处理申请
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="small-empty">
            暂无开票申请。合同审核通过后可申请。
          </div>
        )}
      </section>
      {finance && (
        <section className="finance-block">
          <h4>财务内部核验备注</h4>
          <p className="helper-text">
            仅财务和系统管理员可以读取，销售及其他岗位不返回此字段。
          </p>
          <textarea
            aria-label="财务内部备注"
            rows={3}
            maxLength={4000}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <button
            className="button small-button"
            disabled={busy}
            onClick={async () => {
              try {
                await onAction(project, book, { action: "finance_memo", memo });
              } catch (e) {
                setError(e instanceof Error ? e.message : "保存失败");
              }
            }}
          >
            保存内部备注
          </button>
        </section>
      )}
      {mode && (
        <FinanceModal
          title={
            (
              {
                contract: "提交合同审核",
                review: "财务审核合同",
                receipt: "确认实际收款",
                void: "冲销收款记录",
                invoice: "申请开票",
                process_invoice: "处理开票申请",
              } as Record<string, string>
            )[mode]
          }
          close={() => {
            if (!busy) setMode("");
          }}
        >
          <form className="project-form" onSubmit={submit}>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            {mode === "contract" && (
              <>
                <label className="field">
                  合同编号
                  <input
                    required
                    maxLength={100}
                    value={contractNo}
                    onChange={(e) => setContractNo(e.target.value)}
                  />
                </label>
                <label className="field">
                  合同金额（元）
                  <input
                    required
                    inputMode="decimal"
                    placeholder="精确到分"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="field">
                  付款与交付约定
                  <textarea
                    required
                    maxLength={4000}
                    rows={4}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                  />
                </label>
              </>
            )}
            {mode === "review" && (
              <>
                <label className="field">
                  审核结论
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    <option value="approved">审核通过并确认收款计划</option>
                    <option value="returned">退回销售修改</option>
                  </select>
                </label>
                {decision === "approved" && (
                  <>
                    <p className="helper-text">
                      合同 ¥ {money(book.contractAmountCents)}
                      ；收款计划合计必须与合同金额一致。已有项目收款计划会沿用原编号，避免重复。
                    </p>
                    {plans.map((p, i) => (
                      <div className="plan-editor" key={p.id}>
                        <label className="field">
                          节点名称
                          <input
                            required
                            value={p.label}
                            onChange={(e) =>
                              setPlans(
                                plans.map((p, j) =>
                                  i === j ? { ...p, label: e.target.value } : p,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          应收金额（元）
                          <input
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={
                              Number.isNaN(p.amountCents)
                                ? ""
                                : p.amountCents / 100
                            }
                            onChange={(e) =>
                              setPlans(
                                plans.map((p, j) =>
                                  i === j
                                    ? {
                                        ...p,
                                        amountCents: toCents(e.target.value),
                                      }
                                    : p,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          约定收款日期
                          <input
                            required
                            type="date"
                            value={p.dueDate}
                            onChange={(e) =>
                              setPlans(
                                plans.map((p, j) =>
                                  i === j
                                    ? { ...p, dueDate: e.target.value }
                                    : p,
                                ),
                              )
                            }
                          />
                        </label>
                        {plans.length > 1 && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              setPlans(plans.filter((_, j) => i !== j))
                            }
                          >
                            移除节点
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="button small-button"
                      onClick={() =>
                        setPlans([
                          ...plans,
                          {
                            id: crypto.randomUUID(),
                            label: "分批货款",
                            amountCents: 0,
                            dueDate: today(),
                          },
                        ])
                      }
                    >
                      <Plus size={14} />
                      增加收款节点
                    </button>
                  </>
                )}
                <label className="field">
                  审核意见
                  <textarea
                    required={decision === "returned"}
                    rows={3}
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </>
            )}
            {mode === "receipt" && (
              <>
                <label className="field">
                  本次收款金额（元）
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="field">
                  实际收款日期
                  <input
                    required
                    type="date"
                    max={today()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="field">
                  唯一银行流水号（必填）
                  <input
                    required
                    maxLength={150}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <label className="field">
                  收款说明
                  <textarea
                    maxLength={4000}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </>
            )}
            {mode === "void" && (
              <>
                <p className="helper-text">
                  原收款记录会保留，并记录冲销原因；未收金额将重新计算。
                </p>
                <label className="field">
                  冲销原因
                  <textarea
                    required
                    maxLength={1000}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </>
            )}
            {mode === "invoice" && (
              <>
                <label className="field">
                  开票金额（元）
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="field">
                  发票抬头
                  <input
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="field">
                  纳税人识别号
                  <input
                    required
                    maxLength={100}
                    value={taxNo}
                    onChange={(e) => setTaxNo(e.target.value)}
                  />
                </label>
                <label className="field">
                  开票要求
                  <textarea
                    maxLength={4000}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </>
            )}
            {mode === "process_invoice" && (
              <>
                <label className="field">
                  处理结果
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    <option value="issued">登记已开票</option>
                    <option value="returned">退回申请</option>
                  </select>
                </label>
                {decision === "issued" && (
                  <>
                    <label className="field">
                      实际发票号码
                      <input
                        required
                        maxLength={100}
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      实际开票日期
                      <input
                        required
                        type="date"
                        max={today()}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                  </>
                )}
                <label className="field">
                  反馈说明
                  <textarea
                    required={decision === "returned"}
                    maxLength={4000}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setMode("")}
              >
                取消
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "正在保存…" : "确认提交"}
              </button>
            </div>
          </form>
        </FinanceModal>
      )}
    </div>
  );
}
export { default as MembersPanel } from "./members-panel";
