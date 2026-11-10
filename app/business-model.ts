import { z } from "zod";
const text = z.string().trim().max(4000),
  short = z.string().trim().max(200);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "日期无效")
  .or(z.literal(""));
const value = z.number().finite().min(0).max(1e12).nullable();
export const quoteSchema = z.object({
  id: short.min(1),
  date,
  company: short.min(1),
  product: short,
  unit: short,
  quantity: value,
  unitPrice: value,
  total: value,
  costUnitPrice: value,
  terms: text,
  status: short,
  source: text,
});
export const commercialSchema = z
  .object({
    area: value,
    areaUnit: short,
    priceUnit: short,
    unitPrice: value,
    costUnitPrice: value,
    profitNotes: text,
    quotes: z.array(quoteSchema).max(100),
    competitors: z.array(quoteSchema).max(100),
    contractorName: short,
    funding: text,
    debt: text,
    litigation: text,
    badContracts: text,
    riskLevel: z.enum(["待核实", "低", "中", "高"]),
    verification: z.enum(["待核实", "部分核实", "已核实"]),
    source: text,
    checkedDate: date,
    riskResponse: text,
  })
  .refine(
    (v) => v.verification !== "已核实" || !!(v.source.trim() && v.checkedDate),
    "标记已核实需填写信息来源与核实日期",
  );
export const batchSchema = z
  .object({
    actualShipDate:date.optional(),actualArrivalDate:date.optional(),acceptedDate:date.optional(),expectedAcceptanceDate:date.optional(),
    id: short.min(1),
    name: short.min(1),
    goods: text,
    quantity: value,
    unit: short,
    shipDate: date,
    arrivalDate: date,
    paymentTrigger: z.enum([
      "待确认",
      "发货前付款",
      "发货时付款",
      "到货即付",
      "到货后账期",
      "验收后付款",
      "其他",
    ]),
    paymentDueDate: date,
    paymentTerms: text,
    status: z.enum(["计划中", "已发货", "已到货", "已验收"]),
    note: text,
  })
  .refine(
    (b) => !b.shipDate || !b.arrivalDate || b.arrivalDate >= b.shipDate,
    "到货日期不能早于发货日期",
  );
export const executionSchema = z
  .object({
    contractTerms: text,
    settlement: text,
    paymentMethod: text,
    paymentRequirements: text,
    technicalRequirements: text,
    leadTime: text,
    batchCount: z.number().int().min(0).max(100),
    batches: z.array(batchSchema).max(100),
  })
  .refine(
    (v) => v.batches.length <= v.batchCount,
    "实际登记批次数不能超过约定总批次",
  );
export type Commercial = z.infer<typeof commercialSchema>;
export type Execution = z.infer<typeof executionSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export const emptyCommercial = (): Commercial => ({
  area: null,
  areaUnit: "㎡",
  priceUnit: "元/㎡",
  unitPrice: null,
  costUnitPrice: null,
  profitNotes: "",
  quotes: [],
  competitors: [],
  contractorName: "",
  funding: "",
  debt: "",
  litigation: "",
  badContracts: "",
  riskLevel: "待核实",
  verification: "待核实",
  source: "",
  checkedDate: "",
  riskResponse: "",
});
export const emptyExecution = (): Execution => ({
  contractTerms: "",
  settlement: "",
  paymentMethod: "",
  paymentRequirements: "",
  technicalRequirements: "",
  leadTime: "",
  batchCount: 0,
  batches: [],
});
export const blankQuote = (): Quote => ({
  id: crypto.randomUUID(),
  date: "",
  company: "",
  product: "",
  unit: "元/㎡",
  quantity: null,
  unitPrice: null,
  total: null,
  costUnitPrice: null,
  terms: "",
  status: "待反馈",
  source: "",
});
