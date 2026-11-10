"use client";
import { useState } from "react";
import { type Project, today, shiftDate } from "./model";
import { type Member, canFinance } from "./team";
import { hasDesk } from "./access";
import { type FinanceBook, money, toCents, emptyBook } from "./finance-model";
import {
  canViewSupplier,
  outstanding,
  supplierBalance,
} from "./finance-operations";
import { FinanceModal, type FinanceAction } from "./role-panels";
export function FinanceOperationsQueue({
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
  const [view, setView] = useState("催款待办");
  const rows = projects.flatMap((p) => {
    const b = books[p.id] || emptyBook(p.id);
    return view === "催款待办"
      ? b.reviewStatus === "已审核"
        ? b.plans
            .filter(
              (n) =>
                outstanding(b, n.id) > 0 &&
                (n.dueDate <= shiftDate(7) ||
                  b.collections?.some(
                    (t) => t.planId === n.id && t.status === "跟进中",
                  )),
            )
            .map((n) => {
              const t = b.collections?.find(
                (t) => t.planId === n.id && t.status === "跟进中",
              );
              return {
                id: n.id,
                p,
                label: n.label,
                date: t?.nextDate || n.dueDate,
                amount: outstanding(b, n.id),
                note: t ? "负责人：" + t.assigneeName : "尚未建立催款任务",
              };
            })
        : []
      : (b.suppliers || [])
          .filter((s) => supplierBalance(s) > 0)
          .map((s) => ({
            id: s.id,
            p,
            label: s.supplier,
            date: s.dueDate,
            amount: supplierBalance(s),
            note: s.batchName || "未关联批次",
          }));
  });
  return (
    <section className="panel finance-queue">
      <div className="section-heading">
        <div>
          <h3>催款与厂家付款</h3>
          <p>
            催款列出未来 7
            天到期、逾期和跟进中的收款节点；厂家付款显示全部未付计划。
          </p>
        </div>
      </div>
      <div className="list-tabs">
        {["催款待办", ...(canViewSupplier(member) ? ["厂家应付"] : [])].map(
          (t) => (
            <button
              key={t}
              className={view === t ? "active" : ""}
              onClick={() => setView(t)}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {rows.map((r) => (
        <div key={r.p.id + r.id} className="payment-plan-row">
          <div>
            <button className="project-link" onClick={() => onOpen(r.p)}>
              {r.p.name} · {r.label}
            </button>
            <p>{r.note}</p>
          </div>
          <div>
            <strong>¥ {money(r.amount)}</strong>
            <p>
              {r.date < today() ? "已逾期 · " : ""}
              {r.date}
            </p>
          </div>
          <button className="button" onClick={() => onOpen(r.p)}>
            进入处理
          </button>
        </div>
      ))}
      {!rows.length && <p className="small-empty">暂无待处理事项。</p>}
    </section>
  );
}
export function FinanceOperationsPanel({
  member,
  members,
  project,
  book,
  busy,
  onAction,
  onPurchase,
}: {
  member: Member;
  members: Member[];
  project: Project;
  book: FinanceBook;
  busy: boolean;
  onAction: FinanceAction;
  onPurchase?:()=>void;
}) {
  const [mode, setMode] = useState(""),
    [form, setForm] = useState<Record<string, string>>({}),
    [version, setVersion] = useState(book.version),
    [error, setError] = useState("");
  const finance = canFinance(member);
  function open(action: string, values: Record<string, string> = {}) {
    setMode(action);
    setVersion(book.version);
    setForm({
      nextDate: today(),
      date: today(),
      dueDate: today(),
      assigneeId: member.id,
      status: "跟进中",
      ...values,
    });
    setError("");
  }
  function input(label: string, key: string, type = "text", required = true) {
    return (
      <label className="field" key={key}>
        {label}
        <input
          type={type}
          required={required}
          maxLength={200}
          step={type === "number" ? "0.01" : undefined}
          min={type === "number" ? "0.01" : undefined}
          max={key === "date" ? today() : undefined}
          value={form[key] || ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </label>
    );
  }
  function area(label: string, key: string, required = true) {
    return (
      <label className="field">
        {label}
        <textarea
          required={required}
          rows={3}
          maxLength={4000}
          value={form[key] || ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </label>
    );
  }
  return (
    <>
      <section className="finance-block">
        <h4>催款任务与跟进记录</h4>
        <p className="helper-text">
          催款结束不会计入回款；实际到账仍由财务登记“确认收款”。
        </p>
        {book.reviewStatus === "已审核" &&
          book.plans
            .filter((p) => outstanding(book, p.id) > 0)
            .map((p) => {
              const task = book.collections?.find(
                (t) => t.planId === p.id && t.status === "跟进中",
              );
              return (
                <div className="payment-plan-row" key={p.id}>
                  <div>
                    <strong>
                      {p.label} · 未收 ¥{money(outstanding(book, p.id))}
                    </strong>
                    <p>
                      合同到期 {p.dueDate} ·{" "}
                      {task
                        ? "财务负责人 " + task.assigneeName
                        : "尚未建立催款任务"}
                    </p>
                  </div>
                  {finance && !task && (
                    <button
                      className="button"
                      onClick={() =>
                        open("create_collection", { planId: p.id })
                      }
                    >
                      建立催款任务
                    </button>
                  )}
                </div>
              );
            })}
        {(book.collections || []).map((t) => (
          <div className="business-card" key={t.id}>
            <div className="section-heading">
              <div>
                <h5>
                  {book.plans.find((p) => p.id === t.planId)?.label} ·{" "}
                  {t.status}
                </h5>
                <p>
                  {t.assigneeName} · 下次催款 {t.nextDate} · 客户承诺{" "}
                  {t.promiseDate || "未确认"}
                </p>
              </div>
              {finance && (
                <button
                  className="button"
                  onClick={() =>
                    open("update_collection", {
                      id: t.id,
                      nextDate: t.nextDate,
                      promiseDate: t.promiseDate,
                      status: t.status,
                    })
                  }
                >
                  记录催款进展
                </button>
              )}
            </div>
            {t.history.map((h, i) => (
              <p key={i} className="business-prewrap">
                {h.at.slice(0, 10)} · {h.actor}：{h.note}
              </p>
            ))}
          </div>
        ))}
        {!book.collections?.length && (
          <p className="small-empty">暂无催款记录。</p>
        )}
      </section>
      {canViewSupplier(member) && (
        <section className="finance-block">
          <div className="section-heading">
            <div>
              <h4>厂家应付计划与实际付款</h4>
              <p>
                按厂家、批次和付款条件登记；此处记录付款，不会发起银行转账。
              </p>
            </div>
            {finance && (
              <button className="button" onClick={() => onPurchase ? onPurchase() : open("add_supplier")}>
                新增厂家应付
              </button>
            )}
          </div>
          {(book.suppliers || []).map((p) => (
            <div key={p.id} className="business-card">
              <h5>
                {p.supplier} · {p.batchName || "未关联批次"}{" "}
                {p.voidAt ? "（已作废）" : ""}
              </h5>
              <p>
                约定日期 {p.dueDate} · 应付 ¥{money(p.amountCents)} · 未付 ¥
                {money(supplierBalance(p))}
              </p>
              <p className="business-prewrap">付款条件：{p.terms}</p>
              <p className="business-prewrap">{p.voidReason || p.note}</p>
              {finance && !p.voidAt && (
                <div className="business-actions">
                  {supplierBalance(p) > 0 && (
                    <button
                      className="button"
                      onClick={() =>
                        open("record_supplier_payment", { id: p.id })
                      }
                    >
                      登记实际付款
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => open("void_supplier", { id: p.id })}
                  >
                    作废计划
                  </button>
                </div>
              )}
              {p.payments.map((r) => (
                <div className="payment-plan-row" key={r.id}>
                  <div>
                    <strong>
                      {r.date} · ¥{money(r.amountCents)}{" "}
                      {r.voidAt ? "已冲销" : ""}
                    </strong>
                    <p>
                      凭据 {r.reference} · 登记人 {r.recordedBy}
                    </p>
                    {r.voidAt && <p>冲销原因：{r.voidReason}</p>}
                  </div>
                  {finance && !r.voidAt && !p.voidAt && (
                    <button
                      className="text-button"
                      onClick={() =>
                        open("void_supplier_payment", {
                          id: p.id,
                          paymentId: r.id,
                        })
                      }
                    >
                      冲销付款
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
          {!book.suppliers?.length && (
            <p className="small-empty">暂无厂家应付计划。</p>
          )}
        </section>
      )}
      {mode && (
        <FinanceModal
          title={
            {
              create_collection: "建立催款任务",
              update_collection: "记录催款进展",
              add_supplier: "新增厂家应付",
              record_supplier_payment: "登记厂家实际付款",
              void_supplier: "作废应付计划",
              void_supplier_payment: "冲销厂家付款",
            }[mode] || ""
          }
          close={() => !busy && setMode("")}
        >
          <form
            className="project-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                const data: Record<string, unknown> = { ...form, action: mode };
                if (form.amount) data.amountCents = toCents(form.amount);
                if (await onAction(project, { ...book, version }, data))
                  setMode("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "提交失败");
              }
            }}
          >
            {mode === "create_collection" && (
              <label className="field">
                财务负责人
                <select
                  required
                  value={form.assigneeId || ""}
                  onChange={(e) =>
                    setForm({ ...form, assigneeId: e.target.value })
                  }
                >
                  <option value="">请选择</option>
                  {members
                    .filter(
                      (m) => m.status === "active" && hasDesk(m, "finance"),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {["create_collection", "update_collection"].includes(mode) && (
              <>
                {input("下次催款日期", "nextDate", "date")}
                {mode === "update_collection" && (
                  <>
                    {input("客户承诺付款日期", "promiseDate", "date", false)}
                    <label className="field">
                      催款状态
                      <select
                        value={form.status}
                        onChange={(e) =>
                          setForm({ ...form, status: e.target.value })
                        }
                      >
                        <option>跟进中</option>
                        <option>已结束</option>
                      </select>
                    </label>
                  </>
                )}
                {area("催款安排 / 沟通结果 / 结束原因", "note")}
              </>
            )}
            {mode === "add_supplier" && (
              <>
                {input("厂家名称", "supplier")}
                <label className="field">
                  关联交付批次
                  <select
                    value={form.batchId || ""}
                    onChange={(e) =>
                      setForm({ ...form, batchId: e.target.value })
                    }
                  >
                    <option value="">不关联批次</option>
                    {project.execution?.batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                {input("应付金额（元）", "amount", "number")}
                {input("约定付款日期", "dueDate", "date")}
                {area("付款触发条件 / 账期 / 付款方式", "terms")}
                {area("备注", "note", false)}
              </>
            )}
            {mode === "record_supplier_payment" && (
              <>
                {input("本次付款金额（元）", "amount", "number")}
                {input("实际付款日期", "date", "date")}
                {input("付款凭据 / 银行流水号", "reference")}
              </>
            )}
            {mode.startsWith("void_") && area("原因（原记录将保留）", "reason")}
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setMode("")}
              >
                取消
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "保存中…" : "确认保存"}
              </button>
            </div>
          </form>
        </FinanceModal>
      )}
    </>
  );
}
