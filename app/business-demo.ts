import { emptyCommercial, emptyExecution } from "./business-model";
import { shiftDate } from "./model";
export function demoBusiness(index: number) {
  const area = 1200 + index * 150,
    unitPrice = 96 + index * 2,
    cost = unitPrice - 22;
  const commercial = {
    ...emptyCommercial(),
    area,
    unitPrice,
    costUnitPrice: cost,
    profitNotes:
      "虚构示例：销售与采购同为含税含运单价，另预留安装协调与售后费用。",
    quotes: [
      {
        id: "quote-" + index,
        date: shiftDate(-5),
        company: "固实能源（虚构报价）",
        product: "保温材料供货",
        unit: "元/㎡",
        quantity: area,
        unitPrice,
        total: area * unitPrice,
        costUnitPrice: cost,
        terms: "含税含运；有效期15天；不含安装。",
        status: "客户比价中",
        source: "演示报价单，非真实业务",
      },
    ],
    competitors: [
      {
        id: "competitor-" + index,
        date: shiftDate(-4),
        company: "示例竞争公司 " + (index + 1),
        product: "同类保温材料",
        unit: "元/㎡",
        quantity: area,
        unitPrice: unitPrice - 3,
        total: area * (unitPrice - 3),
        costUnitPrice: null,
        terms: "运费另计，性能指标待核对。",
        status: "区域经销商，供货能力待核实",
        source: "虚构客户反馈，未取得正式报价单",
      },
    ],
    contractorName: "示例总包公司 " + (index + 1),
    funding: "虚构示例：按工程进度结算，需核实本批预算与审批。",
    debt:
      index % 2
        ? "客户反馈有历史拖款，尚未取得书面依据。"
        : "未取得完整债务资料，不代表不存在债务。",
    litigation: "演示数据：待核对公开记录与对方说明。",
    badContracts: "历史合同付款周期偏长，需复核原始记录。",
    riskLevel: "中" as const,
    verification: "部分核实" as const,
    source: "虚构会议沟通记录；仅用于演示",
    checkedDate: shiftDate(-2),
    riskResponse: "首批预付款到帐后发货；后续批次按回款情况确认。",
  };
  const execution = {
    ...emptyExecution(),
    contractTerms:
      "虚构条款：按确认规格供货；到货清点数量，质量验收按书面技术协议；违约与质保另见正式合同。",
    settlement: "按现场验收实际面积结算，每批签字确认。",
    paymentMethod: "对公银行转账；承兑需另行审批。",
    paymentRequirements:
      "首批发货前付清本批款；第二批到货即付；尾批验收后30天。",
    technicalRequirements:
      "规格、厚度、密度、导热系数与燃烧性能以确认版技术文件为准。",
    leadTime: "订单及预付款确认后15天排产，分三批交付。",
    batchCount: 3,
    batches: [0, 1, 2].map((n) => ({
      id: "batch-" + index + "-" + n,
      name: "第" + (n + 1) + "批",
      goods: "保温材料 / 规格见确认单",
      quantity: area / 3,
      unit: "㎡",
      shipDate: shiftDate(n * 10 + 3),
      arrivalDate: shiftDate(n * 10 + 5),
      paymentTrigger: (["发货前付款", "到货即付", "验收后付款"] as const)[n],
      paymentDueDate: shiftDate(n === 2 ? 55 : n === 1 ? 15 : 3),
      paymentTerms:
        n === 2 ? "到货验收后30天" : "本批付款确认后执行对应交付节点",
      status: "计划中" as const,
      note: "虚构批次，交付前复核现场条件",
    })),
  };
  return { commercial, execution };
}
