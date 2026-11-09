import { GUIDES } from "./workflow";
import type { Project } from "./model";
import { workflowOf, DepartmentId, departmentDesk } from "./workflow";
export const DESK_IDS = [
  "aftersales",
  "sales",
  "management",
  "finance",
  "operations",
] as const;
export type Desk = (typeof DESK_IDS)[number];
// Legacy identities retain their original scope; all enter one of the five desks.
export const ROLE_IDS = [
  "owner",
  "management",
  "aftersales",
  "operations",
  "general",
  "director",
  "branch_manager",
  "sales",
  "finance",
  "technical",
  "marketing",
  "project",
  "logistics",
  "assistant",
  "hr",
] as const;
export type Role = (typeof ROLE_IDS)[number];
export const deskOf = (r: Role): Desk =>
  ["owner", "management", "general", "director", "branch_manager"].includes(r)
    ? "management"
    : r === "sales"
      ? "sales"
      : r === "finance"
        ? "finance"
        : r === "aftersales"
          ? "aftersales"
          : "operations";
export const ROLES: {
  id: Role;
  name: string;
  portal: string;
  description: string;
  department: DepartmentId;
}[] = [
  {
    id: "aftersales",
    name: "售后",
    portal: "售后台",
    description: "客户问题、售后处理、验收回访与结果反馈",
    department: "aftersales",
  },
  {
    id: "sales",
    name: "销售",
    portal: "销售台",
    description: "我的项目、客户跟进、合同提交与销售任务",
    department: "sales",
  },
  {
    id: "management",
    name: "管理",
    portal: "管理台",
    description: "统一派发任务、规定期限、督办进度与验收结果",
    department: "general",
  },
  {
    id: "finance",
    name: "财务",
    portal: "财务台",
    description: "合同审核、应收回款、开票与财务任务",
    department: "finance",
  },
  {
    id: "operations",
    name: "运营",
    portal: "运营台",
    description: "技术与市场支持、厂家报备、采购物流和运营协作",
    department: "operations",
  },
];
export const roleInfo = (r: Role) => {
  const info = ROLES.find((x) => x.id === deskOf(r))!;
  return {
    ...info,
    id: r,
    department: ([
      "technical",
      "marketing",
      "project",
      "logistics",
      "assistant",
      "hr",
      "director",
      "general",
    ].includes(r)
      ? r
      : info.department) as DepartmentId,
  };
};
export type Member = {
  assignedDesks?: Desk[];
  defaultDesk?: Desk;
  accountRole?: Role;
  profileCompleted?: boolean;
  id: string;
  name: string;
  email: string;
  phone?: string;
  mustChangePassword?: boolean;
  role: Role;
  region: string;
  status: "active" | "disabled";
  bound: boolean;
  version: number;
  taskProjectIds?: string[];
};
export type Session = { member: Member; isOwner: boolean };
export type Notification = {
  id: string;
  projectId: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
export const isScopedManager = (m: Member) =>
  m.role === "branch_manager" ||
  (m.role === "management" && m.region !== "全部分部");
export const isCompanyManager = (m: Member) =>
  ["owner", "general", "director"].includes(m.role) ||
  (m.role === "management" && !isScopedManager(m));
export const isManager = (m: Member) =>
  isCompanyManager(m) || isScopedManager(m);
export const canFinance = (m: Member) =>
  m.role === "owner" || m.role === "finance";
export const canViewFinance = (m: Member) =>
  canFinance(m) || isManager(m) || m.role === "sales";
export const ownsProject = (p: Project, m: Member) => p.ownerMemberId === m.id;
export const taskVisible = (dept: string, m: Member) =>
  isManager(m) || departmentDesk(dept) === deskOf(m.role);
export const matchesDepartment = (m: Member, dept: string) =>
  isManager(m) || deskOf(m.role) === departmentDesk(dept);
export function canReadProject(p: Project, m: Member) {
  if (m.status !== "active") return false;
  if (isCompanyManager(m) || m.role === "finance") return true;
  if (isScopedManager(m))
    return (
      m.region !== "全部分部" &&
      m.region !== "待分配" &&
      workflowOf(p).region === m.region
    );
  if (m.taskProjectIds?.includes(p.id)) return true;
  if (m.role === "sales" && ownsProject(p, m)) return true;
  const w = workflowOf(p);
  return (
    Object.entries(w.assignmentMembers || {}).some(
      ([dept, id]) => id === m.id && matchesDepartment(m, dept),
    ) ||
    w.tasks.some(
      (t) => t.assigneeMemberId === m.id && taskVisible(t.department, m),
    )
  );
}
export const visibleProject = (p: Project, m: Member): Project => ({
  ...p,
  commercial: canViewFinance(m) ? p.commercial : undefined,
  workflow: {
    ...workflowOf(p),
    facts: Object.fromEntries(
      Object.entries(workflowOf(p).facts).filter(([key]) =>
        canViewFact(m, key),
      ),
    ),
    tasks: workflowOf(p).tasks.filter((t) => taskVisible(t.department, m)),
  },
});
export const canEditProject = (p: Project, m: Member) =>
  canReadProject(p, m) &&
  (isManager(m) || (m.role === "sales" && ownsProject(p, m)));
export const canCreateProject = (m: Member) =>
  isManager(m) || m.role === "sales";
export const canCheckDepartment = (m: Member, dept: DepartmentId) =>
  matchesDepartment(m, dept);
export const mayViewBook = (p: Project, m: Member) =>
  canReadProject(p, m) && canViewFinance(m);
export const FINANCE_FACTS = new Set(["payment-record"]);
export const canViewFact = (m: Member, key: string) =>
  (!FINANCE_FACTS.has(key) &&
    !key.startsWith("check:deal-terms") &&
    !key.startsWith("check:delivery-payment") &&
    !key.startsWith("check:review-cash") &&
    !key.endsWith(":finance")) ||
  canViewFinance(m);
export const FACT_ACCESS: Record<string, string[]> = {
  operations: [
    "technical-needs",
    "drawing-record",
    "tender-record",
    "background",
    "opportunity",
    "review",
    "commercial",
    "delivery-plan",
  ],
  aftersales: ["service-issue", "aftercare", "review"],
  finance: ["payment-record", "contract-terms", "buyer-background"],
};
export const canEditFact = (m: Member, key: string): boolean =>
  key.startsWith("check:")
    ? !!GUIDES.flatMap((g) => g.checks).find(
        (c) => c.id === key.slice(6) && canCheckDepartment(m, c.department),
      )
    : key.startsWith("stage:")
      ? isManager(m) || key.endsWith(":" + deskOf(m.role))
      : isManager(m) ||
        (m.role === "sales"
          ? key !== "payment-record"
          : !!FACT_ACCESS[deskOf(m.role)]?.includes(key));
export const canEditMilestone = (m: Member, dept: string) =>
  isManager(m) ||
  (m.role === "sales" ? dept !== "finance" : matchesDepartment(m, dept));
