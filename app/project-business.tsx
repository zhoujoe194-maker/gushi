"use client";
import { useState } from "react";
import { type Project, today } from "./model";
import { type Member, canEditProject, canViewFinance } from "./team";
import {
  emptyCommercial,
  emptyExecution,
  blankQuote,
  commercialSchema,
  executionSchema,
  type Quote,
} from "./business-model";
import { useUnsavedChanges } from "../hooks/use-unsaved-changes";
import { UnsavedNotice } from "./sales/unsaved-notice";
export function ProjectBusiness({
  project,
  member,
  busy,
  onSave,
}: {
  project: Project;
  member: Member;
  busy: boolean;
  onSave: (p: Project) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(project),
    [error, setError] = useState("");
  const c = draft.commercial || emptyCommercial(),
    x = draft.execution || emptyExecution(),
    show = canViewFinance(member) || (member.role === "sales" && canEditProject(project,member)),
    sensitive = canViewFinance(member),
    canEdit = canEditProject(project, member);
  const current = editing ? draft : project,
    cc = current.commercial || emptyCommercial(),
    xx = current.execution || emptyExecution();
  const guard = useUnsavedChanges(
    JSON.stringify(editing ? draft : project),
    () => setEditing(false),
    busy,
  );
  const changeC = (key: string, value: unknown) =>
      setDraft({ ...draft, commercial: { ...c, [key]: value } }),
    changeX = (key: string, value: unknown) =>
      setDraft({ ...draft, execution: { ...x, [key]: value } });
  const num = (v: string) => (v === "" ? null : Number(v));
  const field = (label: string, key: string, area = false) =>
    editing ? (
      <label className="field" key={key}>
        {label}
        {area ? (
          <textarea
            rows={3}
            maxLength={4000}
            value={String(x[key as keyof typeof x] ?? "")}
            onChange={(e) => changeX(key, e.target.value)}
          />
        ) : (
          <input
            value={String(x[key as keyof typeof x] ?? "")}
            onChange={(e) => changeX(key, e.target.value)}
          />
        )}
      </label>
    ) : (
      <div key={key}>
        <dt>{label}</dt>
        <dd className="business-prewrap">
          {String(xx[key as keyof typeof xx] || "待补充")}
        </dd>
      </div>
    );
  const quotes = (items: Quote[], key: "quotes" | "competitors") => (
    <section className="finance-block">
      <div className="section-heading">
        <h4>{key === "quotes" ? "我方报价记录" : "竞争对手公司与报价"}</h4>
        {editing && (
          <button
            type="button"
            className="button small-button"
            onClick={() => changeC(key, [...items, blankQuote()])}
          >
            增加{key === "quotes" ? "报价" : "对手"}
          </button>
        )}
      </div>
      {items.map((q, i) => (
        <div className="business-card" key={q.id}>
          {editing ? (
            <>
              <div className="business-grid">
                {[
                  ["公司名称", "company"],
                  ["产品 / 规格", "product"],
                  ["计价单位", "unit"],
                  ["报价状态 / 公司情况", "status"],
                ].map(([label, k]) => (
                  <label className="field" key={k}>
                    {label}
                    <input
                      required={k === "company"}
                      maxLength={200}
                      value={String(q[k as keyof Quote] ?? "")}
                      onChange={(e) =>
                        changeC(
                          key,
                          items.map((v, j) =>
                            i === j ? { ...v, [k]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <label className="field">
                  报价日期
                  <input
                    type="date"
                    value={q.date}
                    onChange={(e) =>
                      changeC(
                        key,
                        items.map((v, j) =>
                          i === j ? { ...v, date: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                {[
                  ["数量", "quantity"],
                  ["单价（元）", "unitPrice"],
                  ["报价总额（元）", "total"],
                  ...(key === "quotes"
                    ? (sensitive ? [["成本单价（元）", "costUnitPrice"]] : [])
                    : []),
                ].map(([label, k]) => (
                  <label className="field" key={k}>
                    {label}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={q[k as keyof Quote] ?? ""}
                      onChange={(e) =>
                        changeC(
                          key,
                          items.map((v, j) =>
                            i === j ? { ...v, [k]: num(e.target.value) } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              {[
                ["报价条款 / 税运口径 / 有效期", "terms"],
                ["公司背景、信息来源与核实情况", "source"],
              ].map(([label, k]) => (
                <label className="field" key={k}>
                  {label}
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={String(q[k as keyof Quote] ?? "")}
                    onChange={(e) =>
                      changeC(
                        key,
                        items.map((v, j) =>
                          i === j ? { ...v, [k]: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  changeC(
                    key,
                    items.filter((_, j) => i !== j),
                  )
                }
              >
                移除此行
              </button>
            </>
          ) : (
            <>
              <h5>
                {q.company} · {q.product || "产品待补充"}
              </h5>
              <p>
                {q.date || "日期待补充"} · {q.status}
              </p>
              <p>
                数量 {q.quantity ?? "—"} · 单价 {q.unitPrice ?? "—"} {q.unit} ·
                总价 ¥{q.total ?? "—"}
                {key === "quotes" && q.costUnitPrice !== null
                  ? ` · 成本单价 ¥${q.costUnitPrice}`
                  : ""}
              </p>
              <p className="business-prewrap">{q.terms || "条款待补充"}</p>
              <p className="business-prewrap">
                公司情况 / 来源：{q.source || "待核实"}
              </p>
            </>
          )}
        </div>
      ))}
      {!items.length && (
        <p className="small-empty">暂无记录，编辑后可逐次登记。</p>
      )}
    </section>
  );
  return (
    <form
      className="project-business"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const ep = executionSchema.safeParse(x),
          cp = show ? commercialSchema.safeParse(c) : null;
        if (!ep.success || (cp && !cp.success)) {
          setError(
            !ep.success
              ? ep.error.issues[0].message
              : cp && !cp.success
                ? cp.error.issues[0].message
                : "填写有误",
          );
          return;
        }
        try {
          if (
            await onSave({
              ...draft,
              execution: ep.data,
              ...(cp?.success ? { commercial: cp.data } : {}),
            })
          )
            setEditing(false);
        } catch (e) {
          setError(e instanceof Error ? e.message : "保存失败");
        }
      }}
    >
      <div className="section-heading">
        <div>
          <h3>商务与交付档案</h3>
          <p>报价、条款和交付按项目留档；实际收付款在“合同与票款”登记。</p>
        </div>
        {!editing && canEdit && (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setDraft(structuredClone(project));
              setError("");
              setEditing(true);
            }}
          >
            编辑商务与交付
          </button>
        )}
      </div>
      {show && (
        <section className="finance-block">
          <h4>{sensitive ? "合同面积、单价与利润空间" : "合同面积与销售报价"}</h4>
          {editing ? (
            <div className="business-grid">
              {[
                ["合同面积", "area"],
                ["销售单价（元）", "unitPrice"],
                ...(sensitive ? [["成本单价（元）", "costUnitPrice"]] : []),
              ].map(([label, key]) => (
                <label className="field" key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={c[key as "area"] ?? ""}
                    onChange={(e) => changeC(key, num(e.target.value))}
                  />
                </label>
              ))}
              {[
                ["面积单位", "areaUnit"],
                ["单价口径", "priceUnit"],
              ].map(([label, key]) => (
                <label className="field" key={key}>
                  {label}
                  <input
                    maxLength={200}
                    value={c[key as "areaUnit"]}
                    onChange={(e) => changeC(key, e.target.value)}
                  />
                </label>
              ))}
              {sensitive && <label className="field">
                利润空间说明
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={c.profitNotes}
                  onChange={(e) => changeC("profitNotes", e.target.value)}
                  placeholder="税费、运输、安装、返点及可让利空间"
                />
              </label>}
            </div>
          ) : (
            <>
              <p>
                合同面积：{cc.area ?? "待补充"} {cc.areaUnit} · 销售单价：
                {cc.unitPrice ?? "待补充"} {cc.priceUnit}
                {sensitive && <> · 成本单价：{cc.costUnitPrice ?? "待补充"} {cc.priceUnit}</>}
              </p>
              {sensitive && <p className="business-prewrap">{cc.profitNotes || "利润口径待补充"}</p>}
            </>
          )}
          {cc.unitPrice !== null && cc.costUnitPrice !== null && (
            <p>
              单价差额：{(cc.unitPrice - cc.costUnitPrice).toFixed(2)} 元
              {cc.unitPrice > 0
                ? `；参考毛利率 ${(((cc.unitPrice - cc.costUnitPrice) / cc.unitPrice) * 100).toFixed(2)}%`
                : ""}
              （仅在成本与售价同单位、同税运口径时有意义）
            </p>
          )}
        </section>
      )}
      {show && (
        <>
          {quotes(cc.quotes, "quotes")}
          {quotes(cc.competitors, "competitors")}
        </>
      )}
      <section className="finance-block">
        <h4>合同、结算与技术要求</h4>
        <div className={editing ? "business-grid" : "info-list"}>
          {[
            ["合同条款 / 违约与质保", "contractTerms"],
            ["结算方式", "settlement"],
            ["付款方式", "paymentMethod"],
            ["付款要求与触发条件", "paymentRequirements"],
            ["品牌与技术要求", "technicalRequirements"],
            ["厂家货期 / 排产承诺", "leadTime"],
          ].map(([l, k]) => field(l, k, true))}
        </div>
      </section>
      <section className="finance-block">
        <div className="section-heading">
          <h4>分批发货与付款条件</h4>
          {editing && (
            <button
              type="button"
              className="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  execution: {
                    ...x,
                    batchCount: Math.max(x.batchCount, x.batches.length + 1),
                    batches: [
                      ...x.batches,
                      {
                        id: crypto.randomUUID(),
                        name: "第" + (x.batches.length + 1) + "批",
                        goods: "",
                        quantity: null,
                        unit: "㎡",
                        shipDate: "",
                        arrivalDate: "",
                        paymentTrigger: "待确认",
                        paymentDueDate: "",
                        paymentTerms: "",
                        status: "计划中",
                        note: "",
                      },
                    ],
                  },
                })
              }
            >
              增加批次
            </button>
          )}
        </div>
        {editing ? (
          <label className="field">
            约定总批次
            <input
              type="number"
              required
              min={x.batches.length}
              max={100}
              value={x.batchCount}
              onChange={(e) => changeX("batchCount", Number(e.target.value))}
            />
          </label>
        ) : (
          <p>
            约定共 {xx.batchCount || "待确认"} 批，已登记 {xx.batches.length} 批
          </p>
        )}
        {xx.batches.map((b, i) => (
          <div key={b.id} className="business-card">
            {editing ? (
              <div className="business-grid">
                {[
                  ["批次名称", "name"],
                  ["货物 / 规格", "goods"],
                  ["数量单位", "unit"],
                  ["付款约定 / 账期天数", "paymentTerms"],
                  ["现场安排 / 备注", "note"],
                ].map(([l, k]) => (
                  <label className="field" key={k}>
                    {l}
                    <textarea
                      rows={2}
                      required={k === "name"}
                      maxLength={k === "name" || k === "unit" ? 200 : 4000}
                      value={String(b[k as keyof typeof b] ?? "")}
                      onChange={(e) =>
                        changeX(
                          "batches",
                          x.batches.map((v, j) =>
                            i === j ? { ...v, [k]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <label className="field">
                  数量
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={b.quantity ?? ""}
                    onChange={(e) =>
                      changeX(
                        "batches",
                        x.batches.map((v, j) =>
                          i === j ? { ...v, quantity: num(e.target.value) } : v,
                        ),
                      )
                    }
                  />
                </label>
                {[
                  ["计划发货日期", "shipDate"],
                  ["计划到货日期", "arrivalDate"],
                  ["约定付款日期", "paymentDueDate"],
                ].map(([l, k]) => (
                  <label className="field" key={k}>
                    {l}
                    <input
                      type="date"
                      value={String(b[k as keyof typeof b])}
                      onChange={(e) =>
                        changeX(
                          "batches",
                          x.batches.map((v, j) =>
                            i === j ? { ...v, [k]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <label className="field">
                  付款触发条件
                  <select
                    value={b.paymentTrigger}
                    onChange={(e) =>
                      changeX(
                        "batches",
                        x.batches.map((v, j) =>
                          i === j
                            ? { ...v, paymentTrigger: e.target.value }
                            : v,
                        ),
                      )
                    }
                  >
                    {[
                      "待确认",
                      "发货前付款",
                      "发货时付款",
                      "到货即付",
                      "到货后账期",
                      "验收后付款",
                      "其他",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  交付状态
                  <select
                    value={b.status}
                    onChange={(e) =>
                      changeX(
                        "batches",
                        x.batches.map((v, j) =>
                          i === j ? { ...v, status: e.target.value } : v,
                        ),
                      )
                    }
                  >
                    {["计划中", "已发货", "已到货", "已验收"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    changeX(
                      "batches",
                      x.batches.filter((_, j) => i !== j),
                    )
                  }
                >
                  移除批次
                </button>
              </div>
            ) : (
              <>
                <h5>
                  {b.name} · {b.status}
                </h5>
                <p>
                  {b.goods} · {b.quantity ?? "待确认"} {b.unit}
                </p>
                <p>
                  发货：{b.shipDate || "待确认"} → 到货：
                  {b.arrivalDate || "待确认"}
                </p>
                <p>
                  {b.paymentTrigger} · 付款日期 {b.paymentDueDate || "待确认"}
                </p>
                <p className="business-prewrap">
                  {b.paymentTerms} {b.note}
                </p>
              </>
            )}
          </div>
        ))}
        {!xx.batches.length && (
          <p className="small-empty">尚未登记交付批次。</p>
        )}
      </section>
      {show && (
        <section className="finance-block">
          <h4>总包 / 采购单位资金与履约风险</h4>
          <p className="helper-text">
            填写事实、资料来源与核实日期；未知情况保留“待核实”。
          </p>
          {editing ? (
            <>
              <div className="business-grid">
                {[
                  ["总包单位名称", "contractorName"],
                  ["资金情况 / 付款能力", "funding"],
                  ["大额欠债 / 拖欠记录", "debt"],
                  ["诉讼 / 执行情况", "litigation"],
                  ["不良合同 / 历史违约", "badContracts"],
                  ["信息来源 / 文件链接", "source"],
                  ["风险应对 / 担保与限额", "riskResponse"],
                ].map(([l, k]) => (
                  <label className="field" key={k}>
                    {l}
                    <textarea
                      rows={3}
                      maxLength={k === "contractorName" ? 200 : 4000}
                      value={String(c[k as keyof typeof c] ?? "")}
                      onChange={(e) => changeC(k, e.target.value)}
                    />
                  </label>
                ))}
                <label className="field">
                  核实日期
                  <input
                    type="date"
                    max={today()}
                    value={c.checkedDate}
                    onChange={(e) => changeC("checkedDate", e.target.value)}
                  />
                </label>
                <label className="field">
                  核实状态
                  <select
                    value={c.verification}
                    onChange={(e) => changeC("verification", e.target.value)}
                  >
                    {["待核实", "部分核实", "已核实"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  风险等级
                  <select
                    value={c.riskLevel}
                    onChange={(e) => changeC("riskLevel", e.target.value)}
                  >
                    {["待核实", "低", "中", "高"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <dl className="info-list">
              {[
                ["总包单位", cc.contractorName || project.contractor],
                ["资金情况", cc.funding],
                ["债务情况", cc.debt],
                ["诉讼与执行", cc.litigation],
                ["不良合同", cc.badContracts],
                ["信息来源", cc.source],
                ["风险应对", cc.riskResponse],
                [
                  "核实状态",
                  cc.verification + " · " + (cc.checkedDate || "日期待补充"),
                ],
                ["风险等级", cc.riskLevel],
              ].map(([l, v]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd className="business-prewrap">{v || "待核实"}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
      {editing && (
        <>
          <UnsavedNotice guard={guard} />
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={guard.requestClose}
            >
              取消编辑
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "保存中…" : "保存商务与交付"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
