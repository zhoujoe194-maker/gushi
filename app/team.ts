import { GUIDES } from "./workflow";
import type { Project } from "./model";
import { workflowOf, DepartmentId, departmentDesk } from "./workflow";
// D1: DESK_IDS remains the granular authorization scope used by projects,
// tasks, meetings, messages and department assignments. It is NOT the entry
// list any more. The three user-facing workbenches are PORTAL_IDS below.
export const DESK_IDS = [
  "aftersales",
  "sales",
  "management",
  "finance",
  "operations",
] as const;
export type Desk = (typeof DESK_IDS)[number];
// D1 workbench entrances. Sales and finance stay their own workbench;
// management, operations and aftersales collaborate inside the management
// workbench while keeping their own desk identity and permissions.
export const PORTAL_IDS = ["sales", "management", "finance"] as const;
export type Portal = (typeof PORTAL_IDS)[number];
export const PORTAL_OF_DESK: Record<Desk, Portal> = {
  sales: "sales",
  finance: "finance",
  management: "management",
  operations: "management",
  aftersales: "management",
};
export const portalOfDesk = (d: Desk): Portal => PORTAL_OF_DESK[d];
export const portalOfRole = (r: Role): Portal => PORTAL_OF_DESK[deskOf(r)];
// Display order inside the management workbench: manager scope first.
export const SCOPES_IN_PORTAL: Record<Portal, Desk[]> = {
  sales: ["sales"],
  finance: ["finance"],
  management: ["management", "operations", "aftersales"],
};
export const PORTALS: {
  id: Portal;
  name: string;
  short: string;
  description: string;
  scopes: string;
}[] = [
  {
    id: "sales",
    name: "销售工作台",
    short: "销售",
    description: "项目创建、快速跟进、商务报价、客户回款与个人结果",
    scopes: "销售",
  },
  {
    id: "management",
    name: "管理工作台",
    short: "管理",
    description: "公司经营、员工结果、项目管理、任务分配与暂停复查；运营、售后在此协作",
    scopes: "管理 · 运营 · 售后",
  },
  {
    id: "finance",
    name: "财务工作台",
    short: "财务",
    description: "合同审核、项目收支、应收应付、工资费用、现金流与银行核销",
    scopes: "财务",
  },
];
export const portalInfo = (p: Portal) => PORTALS.find((x) => x.id === p)!;
// Legacy identities retain their original scope; all enter one of the three workbenches.
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
  // D1 runtime context (set by access.inPortal; never persisted):
  portal?: Portal;
  scope?: Desk;
  scopes?: Desk[];
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
// Legacy region/role values remain readable; V2 has a single company scope.
export const isScopedManager = (_m: Member) => false;
export const isCompanyManager = (m: Member) =>
  ["owner", "general", "director", "management", "branch_manager"].includes(m.role);
export const isManager = (m: Member) =>
  isCompanyManager(m) || isScopedManager(m);
export const canFinance = (m: Member) =>
  m.role === "owner" || m.role === "finance";
export const canViewFinance = (m: Member) =>
  canFinance(m) || isManager(m);
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
  return m.role === "sales" && ownsProject(p, m);
}
export const salesCommercial = (c: Project['commercial']): Project['commercial'] => c ? ({
  ...c, costUnitPrice: null, profitNotes: '',
  quotes: c.quotes.map(q => ({...q, costUnitPrice: null})),
  competitors: c.competitors.map(q => ({...q, costUnitPrice: null})),
}) : undefined;
export const visibleProject = (p: Project, m: Member): Project => ({
  ...p,
  commercial: canViewFinance(m) ? p.commercial : m.role === "sales" && ownsProject(p,m) ? salesCommercial(p.commercial) : undefined,
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
  canReadProject(p, m) && (canViewFinance(m) || (m.role === "sales" && ownsProject(p,m)));
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
