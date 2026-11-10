import { z } from "zod";
import { type FinanceBook } from "./finance-model";
import { type Member, isManager, canFinance } from "./team";
import { hasDesk } from "./access";
import { today } from "./model";
const text = z.string().trim().min(1).max(4000),
  id = z.string().min(1).max(100),
  amount = z.number().int().positive().max(1e12);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "日期无效");
export type CollectionTask = {
  id: string;
  planId: string;
  assigneeId: string;
  assigneeName: string;
  nextDate: string;
  promiseDate: string;
  status: "跟进中" | "已结束";
  history: { at: string; actor: string; note: string }[];
};
export type SupplierPayable = {
  cashTerms?:import("./cash-model").CashTerms;certainty?:import("./cash-model").Certainty;history?:import("./cash-model").Audit[];
  id: string;
  supplier: string;
  batchId: string;
  batchName: string;
  amountCents: number;
  dueDate: string;
  terms: string;
  note: string;
  createdBy: string;
  voidAt?: string;
  voidReason?: string;
  payments: {
    bankId?:string;
    id: string;
    date: string;
    amountCents: number;
    reference: string;
    recordedBy: string;
    voidAt?: string;
    voidReason?: string;
  }[];
};
export const canViewSupplier = (m: Member) => canFinance(m) || isManager(m);
export const outstanding = (b: FinanceBook, planId: string) =>
  Math.max(
    0,
    (b.plans.find((p) => p.id === planId)?.amountCents || 0) -
      b.receipts
        .filter((r) => !r.voidAt && r.planId === planId)
        .reduce((s, r) => s + r.amountCents, 0),
  );
export const supplierBalance = (p: SupplierPayable) =>
  p.voidAt
    ? 0
    : p.amountCents -
      p.payments
        .filter((r) => !r.voidAt)
        .reduce((s, r) => s + r.amountCents, 0);
export const financeOperations = [
  "create_collection",
  "update_collection",
  "add_supplier",
  "record_supplier_payment",
  "void_supplier_payment",
  "void_supplier",
];
export function applyFinanceOperation(
  b: FinanceBook,
  body: Record<string, unknown>,
  member: Member,
  members: Member[],
  batches: { id: string; name: string }[] = [],
) {
  if (!canFinance(member))
    throw Error("仅财务或系统管理员可以维护催款与厂家付款");
  b.collections ||= [];
  b.suppliers ||= [];
  const now = new Date().toISOString(),
    action = body.action;
  if (action === "create_collection") {
    if (b.reviewStatus !== "已审核") throw Error("请先完成合同审核");
    const planId = id.parse(body.planId);
    if (!b.plans.some((p) => p.id === planId) || outstanding(b, planId) <= 0)
      throw Error("该收款节点不存在或已经收清");
    if (b.collections.some((t) => t.planId === planId && t.status === "跟进中"))
      throw Error("该节点已有催款任务，请继续记录进展");
    const assignee = members.find(
      (m) =>
        m.id === body.assigneeId &&
        m.status === "active" &&
        hasDesk(m, "finance"),
    );
    if (!assignee) throw Error("请选择有效的财务负责人");
    b.collections.push({
      id: crypto.randomUUID(),
      planId,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      nextDate: date.parse(body.nextDate),
      promiseDate: "",
      status: "跟进中",
      history: [{ at: now, actor: member.name, note: text.parse(body.note) }],
    });
    return "已建立催款任务并指定财务负责人";
  }
  if (action === "update_collection") {
    const t = b.collections.find((t) => t.id === body.id);
    if (!t) throw Error("催款任务不存在");
    const note = text.parse(body.note),
      status = z.enum(["跟进中", "已结束"]).parse(body.status);
    t.nextDate = date.parse(body.nextDate);
    t.promiseDate = body.promiseDate ? date.parse(body.promiseDate) : "";
    t.status = status;
    t.history.push({ at: now, actor: member.name, note });
    return "催款进展已更新（实际收款以收款流水为准）";
  }
  if (action === "add_supplier") {
    const batchId = body.batchId ? id.parse(body.batchId) : "",
      batch = batches.find((b) => b.id === batchId);
    if (batchId && !batch) throw Error("交付批次不存在，请刷新后重试");
    b.suppliers.push({
      id: crypto.randomUUID(),
      supplier: z.string().trim().min(1).max(200).parse(body.supplier),
      batchId,
      batchName: batch?.name || "",
      amountCents: amount.parse(body.amountCents),
      dueDate: date.parse(body.dueDate),
      terms: text.parse(body.terms),
      note: z
        .string()
        .trim()
        .max(4000)
        .parse(body.note || ""),
      createdBy: member.name,
      payments: [],
    });
    return "厂家应付计划已登记";
  }
  const p = b.suppliers.find((p) => p.id === body.id);
  if (!p || p.voidAt) throw Error("厂家应付计划不存在或已作废");
  if (action === "record_supplier_payment") {
    const value = amount.parse(body.amountCents);
    if (value > supplierBalance(p)) throw Error("付款金额超过厂家未付余额");
    const paidDate = date.parse(body.date);
    if (paidDate > today()) throw Error("实际付款日期不能晚于今天");
    p.payments.push({
      id: crypto.randomUUID(),
      date: paidDate,
      amountCents: value,
      reference: z.string().trim().min(1).max(200).parse(body.reference),
      recordedBy: member.name,
    });
    return "厂家实际付款已登记";
  }
  if (action === "void_supplier_payment") {
    const r = p.payments.find((r) => r.id === body.paymentId);
    if (!r || r.voidAt) throw Error("付款流水不存在或已冲销");
    r.voidAt = now;
    r.voidReason = text.parse(body.reason);
    return "厂家付款已冲销，原流水保留";
  }
  if (action === "void_supplier") {
    if (p.payments.some((r) => !r.voidAt))
      throw Error("请先冲销有效付款流水再作废计划");
    p.voidAt = now;
    p.voidReason = text.parse(body.reason);
    return "厂家应付计划已作废并保留记录";
  }
  throw Error("不支持的财务操作");
}
