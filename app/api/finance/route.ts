import {mutateCash} from '../../server/cash';
import {
  applyFinanceOperation,
  financeOperations,
  canViewSupplier,
} from "../../finance-operations";
import { hasDesk } from "../../access";
import { z } from "zod";
import {
  getContext,
  checkOrigin,
  handleError,
  response,
  HttpError,
  directory,
} from "../../server/auth";
import { loadProject } from "../../server/projects";
import { canFinance, canEditProject, roleInfo, mayViewBook, canViewFinance } from "../../team";
import {
  FinanceBook,
  salesBook,
  emptyBook,
  totals,
  money,
  PaymentPlan,
} from "../../finance-model";
import { calendarDate } from "../../server/validation";
import { today } from "../../model";
export const dynamic = "force-dynamic";
const amount = z.number().int().positive().max(1000000000000),
  text = z.string().trim().max(4000),
  plan = z.object({
    id: z.string().min(1).max(100),
    label: z.string().trim().min(1).max(100),
    amountCents: amount,
    dueDate: calendarDate,
  });
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await getContext(req),
      raw = await req.text();
    if (raw.length > 200000) throw new HttpError(413, "提交内容过大");
    const body = JSON.parse(raw) as Record<string, unknown>;
    const projectId = z.string().min(1).max(100).parse(body.projectId),
      version = z.number().int().min(0).parse(body.version),
      action = z.string().parse(body.action);
    const project = await loadProject(ctx, projectId);
    if (!mayViewBook(project, ctx.member))
      throw new HttpError(403, "当前岗位无权访问财务台账");
    const row = await ctx.db
      .prepare(
        "SELECT data,version,updated_at FROM finance_books WHERE project_id=? AND workspace_id=?",
      )
      .bind(projectId, ctx.workspaceId)
      .first<{ data: string; version: number; updated_at: string }>();
    const b: FinanceBook = row
      ? {
          ...JSON.parse(row.data),
          projectId,
          version: row.version,
          updatedAt: row.updated_at,
        }
      : emptyBook(projectId);
    if (b.version !== version)
      throw new HttpError(409, "票款数据已被其他人更新，请刷新后重试");
    // Both old and new screens settle into the same project book and bank allocation.
    if (action === 'record_receipt' || action === 'record_supplier_payment') {
      if (!canFinance(ctx.member)) throw new HttpError(403,'实际收付款只能由财务确认');
      await mutateCash(ctx,{action:'settle',requestId:typeof body.requestId==='string'?body.requestId:crypto.randomUUID(),reference:body.reference,date:body.date,direction:action==='record_receipt'?'in':'out',amountCents:body.amountCents,note:body.note||'',allocations:[{projectId,kind:action==='record_receipt'?'customer':'supplier',targetId:action==='record_receipt'?body.planId:body.id,amountCents:body.amountCents}]});
      const fresh=await ctx.db.prepare('SELECT data,version,updated_at FROM finance_books WHERE project_id=? AND workspace_id=?').bind(projectId,ctx.workspaceId).first<{data:string;version:number;updated_at:string}>();
      return response({book:{...JSON.parse(fresh!.data),version:fresh!.version,updatedAt:fresh!.updated_at},event:{id:crypto.randomUUID(),projectId,createdAt:new Date().toISOString(),kind:'票款核销',actor:ctx.member.name,note:'财务已核对银行流水',changes:[]}});
    }
    if (action === 'void_receipt' || action === 'void_supplier_payment') {
      const linked=action==='void_receipt'?b.receipts.find(r=>r.id===body.receiptId):b.suppliers?.find(p=>p.id===body.id)?.payments.find(r=>r.id===body.paymentId);
      if(linked?.bankId) throw new HttpError(400,'该笔属于统一银行流水，请在现金流页面整体冲销，避免分摊不一致');
    }
    const now = new Date().toISOString();
    let note = "",
      kind = "票款进度更新";
    const recipients = new Set<string>();
    const financeOnly = () => {
      if (!canFinance(ctx.member))
        throw new HttpError(403, "此操作仅财务或系统管理员可以执行");
    };
    if(action==='add_supplier') throw new HttpError(400,'请在项目收支中登记采购订单、交付批次和付款计划；旧计划仍可查看和核销');
    if (financeOperations.includes(action)) {
      financeOnly();
      try {
        note = applyFinanceOperation(
          b,
          body,
          ctx.member,
          await directory(ctx),
          project.execution?.batches || [],
        );
      } catch (e) {
        if (e instanceof z.ZodError) throw e;
        throw new HttpError(400, e instanceof Error ? e.message : "操作失败");
      }
      if (action.includes("supplier")) kind = "厂家付款记录";
    } else if (action === "submit_contract") {
      if (!canEditProject(project, ctx.member))
        throw new HttpError(403, "仅项目主跟或管理人员可以提交合同");
      if (b.reviewStatus === "已审核")
        throw new HttpError(
          400,
          "已审核合同不允许销售直接改写，请提交协作给财务核实变更",
        );
      b.contractNo = z.string().trim().min(1).max(100).parse(body.contractNo);
      b.contractAmountCents = amount.parse(body.contractAmountCents);
      b.contractSnapshot = {
        commercial: project.commercial,
        execution: project.execution,
        projectVersion: project.version,
      };
      b.paymentTerms = z
        .string()
        .trim()
        .min(1)
        .max(4000)
        .parse(body.paymentTerms);
      b.reviewStatus = "待审核";
      b.reviewNote = "";
      b.submittedBy = ctx.member.id;
      b.submittedAt = now;
      b.reviewedBy = "";
      b.reviewedAt = "";
      note = `提交合同 ${b.contractNo}，金额 ¥${money(b.contractAmountCents)}，等待财务审核`;
      for (const m of await directory(ctx))
        if (m.status === "active" && hasDesk(m, "finance"))
          recipients.add(m.id);
    } else if (action === "review_contract") {
      financeOnly();
      if (b.reviewStatus !== "待审核")
        throw new HttpError(400, "此合同不在待审核状态");
      const decision = z.enum(["approved", "returned"]).parse(body.decision);
      b.reviewNote = text.parse(body.note || "");
      b.reviewedBy = ctx.member.id;
      b.reviewedAt = now;
      if (decision === "approved") {
        const plans = z.array(plan).min(1).max(100).parse(body.plans);
        if (new Set(plans.map((p) => p.id)).size !== plans.length)
          throw new HttpError(400, "收款节点编号重复");
        if (
          plans.reduce((s, p) => s + p.amountCents, 0) !== b.contractAmountCents
        )
          throw new HttpError(400, "收款计划合计必须等于合同金额");
        if (b.plans.some(old=>!plans.some(p=>p.id===old.id))) throw new HttpError(400,'已有收款计划必须沿用原编号，不能重复建立或覆盖');
        if(plans.some(p=>p.amountCents<b.receipts.filter(r=>!r.voidAt&&r.planId===p.id).reduce((n,r)=>n+r.amountCents,0))) throw new HttpError(400,'计划金额不能小于已收金额');
        b.plans = plans.map(p=>({...b.plans.find(old=>old.id===p.id),...p,cashStatus:'confirmed'}));
        b.reviewStatus = "已审核";
        note = `合同 ${b.contractNo} 已审核，收款计划 ${plans.length} 个节点`;
      } else {
        if (!b.reviewNote) throw new HttpError(400, "请说明退回修改原因");
        b.reviewStatus = "退回修改";
        note = `合同 ${b.contractNo} 已退回：${b.reviewNote}`;
      }
      if (project.ownerMemberId) recipients.add(project.ownerMemberId);
    } else if (action === "record_receipt") {
      financeOnly();
      if (b.reviewStatus !== "已审核")
        throw new HttpError(400, "请先完成合同及收款计划审核");
      const planId = z.string().parse(body.planId),
        p = b.plans.find((p) => p.id === planId);
      if (!p) throw new HttpError(400, "收款节点不存在");
      const value = amount.parse(body.amountCents),
        received = b.receipts
          .filter((r) => !r.voidAt && r.planId === p.id)
          .reduce((s, r) => s + r.amountCents, 0);
      if (value > p.amountCents - received)
        throw new HttpError(400, "本次收款超过该节点未收金额");
      const date = calendarDate.parse(body.date);
      if (date > today()) throw new HttpError(400, "实际收款日期不能晚于今天");
      b.receipts.push({
        id: crypto.randomUUID(),
        planId,
        amountCents: value,
        date,
        reference: z
          .string()
          .trim()
          .max(200)
          .parse(body.reference || ""),
        note: text.parse(body.note || ""),
        recordedBy: ctx.member.id,
      });
      note = `财务确认收款 ¥${money(value)}，节点：${p.label}`;
      if (project.ownerMemberId) recipients.add(project.ownerMemberId);
    } else if (action === "void_receipt") {
      financeOnly();
      const receipt = b.receipts.find((r) => r.id === body.receiptId);
      if (!receipt || receipt.voidAt)
        throw new HttpError(400, "此收款不存在或已冲销");
      const reason = z.string().trim().min(1).max(1000).parse(body.reason);
      receipt.voidAt = now;
      receipt.voidReason = reason;
      note = `财务冲销收款记录 ¥${money(receipt.amountCents)}，原因：${reason}`;
      if (project.ownerMemberId) recipients.add(project.ownerMemberId);
    } else if (action === "request_invoice") {
      if (!(canEditProject(project, ctx.member) || canFinance(ctx.member)))
        throw new HttpError(403, "仅项目主跟、管理或财务可以申请开票");
      if (b.reviewStatus !== "已审核")
        throw new HttpError(400, "请先完成合同审核再申请开票");
      const value = amount.parse(body.amountCents),
        reserved = b.invoices
          .filter((i) => i.status !== "已退回")
          .reduce((s, i) => s + i.amountCents, 0);
      if (value > b.contractAmountCents - reserved)
        throw new HttpError(400, "申请金额超过合同可开票余额");
      b.invoices.push({
        id: crypto.randomUUID(),
        amountCents: value,
        title: z.string().trim().min(1).max(200).parse(body.title),
        taxNo: z.string().trim().min(1).max(100).parse(body.taxNo),
        remark: text.parse(body.remark || ""),
        requestedBy: ctx.member.id,
        requestedAt: now,
        status: "待开票",
        number: "",
        issuedDate: "",
        reply: "",
      });
      note = `提交开票申请 ¥${money(value)}，等待财务处理`;
      for (const m of await directory(ctx))
        if (m.status === "active" && hasDesk(m, "finance"))
          recipients.add(m.id);
    } else if (action === "process_invoice") {
      financeOnly();
      const invoice = b.invoices.find((i) => i.id === body.invoiceId);
      if (!invoice || invoice.status !== "待开票")
        throw new HttpError(400, "此申请已处理或不存在");
      const decision = z.enum(["issued", "returned"]).parse(body.decision);
      invoice.reply = text.parse(body.reply || "");
      if (decision === "issued") {
        invoice.number = z.string().trim().min(1).max(100).parse(body.number);
        invoice.issuedDate = calendarDate.parse(body.issuedDate);
        if (invoice.issuedDate > today())
          throw new HttpError(400, "已开票日期不能晚于今天");
        invoice.status = "已开票";
        note = `财务已登记开票 ¥${money(invoice.amountCents)}，发票号 ${invoice.number}`;
      } else {
        if (!invoice.reply) throw new HttpError(400, "请填写退回原因");
        invoice.status = "已退回";
        note = `开票申请已退回：${invoice.reply}`;
      }
      recipients.add(invoice.requestedBy);
      if (project.ownerMemberId) recipients.add(project.ownerMemberId);
    } else if (action === "finance_memo") {
      financeOnly();
      b.financeMemo = text.parse(body.memo || "");
      note = "财务内部核验备注已更新";
      kind = "财务内部备注";
    } else throw new HttpError(400, "不支持的财务操作");
    b.version = version + 1;
    b.updatedAt = now;
    const {
      projectId: ignored,
      version: ignoredV,
      updatedAt: ignoredDate,
      ...data
    } = b;
    const eventId = crypto.randomUUID(),
      event = {
        kind,
        actor: `${ctx.member.name}（${roleInfo(ctx.member.role).name}）`,
        note,
        changes: [],
      };
    const first = row
      ? ctx.db
          .prepare(
            "UPDATE finance_books SET data=?,version=?,updated_at=? WHERE project_id=? AND workspace_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
          )
          .bind(
            JSON.stringify(data),
            b.version,
            now,
            projectId,
            ctx.workspaceId,
            version,
            ctx.member.id,
            ctx.member.version,
          )
      : ctx.db
          .prepare(
            "INSERT INTO finance_books(project_id,workspace_id,data,version,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?) ON CONFLICT(project_id) DO NOTHING",
          )
          .bind(
            projectId,
            ctx.workspaceId,
            JSON.stringify(data),
            b.version,
            now,
            ctx.member.id,
            ctx.member.version,
          );
    const batch: D1PreparedStatement[] = [
      first,
      ctx.db
        .prepare(
          "INSERT INTO events(id,project_id,user_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
        )
        .bind(eventId, projectId, ctx.workspaceId, JSON.stringify(event), now),
    ];
    for (const recipient of recipients)
      if (recipient !== ctx.member.id)
        batch.push(
          ctx.db
            .prepare(
              "INSERT INTO notifications(id,workspace_id,recipient_id,project_id,message,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=?)",
            )
            .bind(
              crypto.randomUUID(),
              ctx.workspaceId,
              recipient,
              projectId,
              `${project.name}：${note}`,
              now,
              eventId,
            ),
        );
    const result = await ctx.db.batch(batch);
    if (result[0].meta.changes !== 1)
      throw new HttpError(409, "票款数据或账号权限已变化，请刷新后重试");
    if (!canFinance(ctx.member)) delete b.financeMemo;
    if (!canViewSupplier(ctx.member)) delete b.suppliers;
    return response({
      book: canViewFinance(ctx.member) ? b : salesBook(b),
      event: { ...event, id: eventId, projectId, createdAt: now },
    });
  } catch (e) {
    return handleError(e);
  }
}
