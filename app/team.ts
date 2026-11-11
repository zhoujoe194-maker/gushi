import { GUIDES } from "./workflow";
import type { Project } from "./model";
import { workflowOf, DepartmentId, departmentDesk } from "./workflow";
// D1-RECTIFY: DESK_IDS is the legacy persisted authorization/capability
// vocabulary (old rows are never rewritten in place). It is NOT a workbench
// list and NOT a user-selectable scope. Sales, management and finance are the
// only workbenches; operations/aftersales survive only as specialist
// capabilities inside the management workbench.
export const DESK_IDS = [
  "aftersales",
  "sales",
  "management",
  "finance",
  "operations",
] as const;
export type Desk = (typeof DESK_IDS)[number];
// The only three workbench entrances.
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
// Legacy desk values that collaborate inside the management workbench. This
// is only used to validate persisted capability grants; it is never rendered
// as a scope selector and never grants manager authority by itself.
export const MANAGEMENT_CAPABILITY_DESKS: Desk[] = [
  "management",
  "operations",
  "aftersales",
];
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
    description: "公司经营、员工结果、项目管理、任务分配与暂停复查；运营、售后按真实岗位在此协作",
    scopes: "管理工作台",
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
    portal: "管理工作台 · 售后岗",
    description: "客户问题、售后处理、验收回访与结果反馈",
    department: "aftersales",
  },
  {
    id: "sales",
    name: "销售",
    portal: "销售工作台",
    description: "我的项目、客户跟进、合同提交与销售任务",
    department: "sales",
  },
  {
    id: "management",
    name: "管理",
    portal: "管理工作台 · 管理岗",
    description: "公司经营、统一派发任务、督办进度、员工结果与暂停复查",
    department: "general",
  },
  {
    id: "finance",
    name: "财务",
    portal: "财务工作台",
    description: "合同审核、应收回款、开票、工资费用与现金流",
    department: "finance",
  },
  {
    id: "operations",
    name: "运营",
    portal: "管理工作台 · 运营岗",
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
  // Persisted legacy capability grants (never a user-selectable v2 scope).
  assignedDesks?: Desk[];
  // Persisted legacy default_desk, read-adapted to one of the three portals.
  defaultDesk?: Portal;
  // Real professional identity; never changed by entering a workbench.
  accountRole?: Role;
  profileCompleted?: boolean;
  // D1-RECTIFY runtime context (set by access.inPortal; never persisted):
  portal?: Portal;
  // Business capability inside the management workbench, derived from the
  // real role. Never grants manager authority by itself.
  capability?: Desk;
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
// The real professional identity. Entering a workbench never changes it.
export const realRole = (m: Pick<Member, "role" | "accountRole">): Role =>
  m.accountRole || m.role;
// Persisted capability grants. Legacy rows without a desks column are read
// exactly as before (owner = all five, everyone else = their role desk), so the
// original authorization stays equivalent without rewriting member data.
export const grantedDesks = (
  m: Pick<Member, "role" | "assignedDesks" | "accountRole">,
): Desk[] => {
  if (m.assignedDesks)
    return [...new Set(m.assignedDesks.filter((d) => DESK_IDS.includes(d)))];
  const real = m.accountRole || m.role;
  return real === "owner" ? [...DESK_IDS] : [deskOf(real)];
};
export const hasGrant = (
  m: Pick<Member, "role" | "assignedDesks" | "accountRole">,
  desk: Desk,
) => grantedDesks(m).includes(desk);
// Capabilities below never include the manager-only "management" desk for a
// non-manager. Holding an operations/aftersales grant therefore cannot leak
// company project, staff, payroll or cash authority.
const nonManagementGrants = (m: Member): Desk[] =>
  grantedDesks(m).filter((d) => d !== "management") as Desk[];
export const isCompanyManager = (m: Member) =>
  ["owner", "general", "director", "management", "branch_manager"].includes(
    realRole(m),
  );
export const isManager = (m: Member) =>
  isCompanyManager(m) || isScopedManager(m);
// Real finance write authority exists only inside the finance workbench. The
// owner keeps read-only finance visibility in the management workbench, and an
// owner/finance account without runtime portal context is conservative.
export const canFinance = (m: Member) => {
  const real = realRole(m);
  const financeCapability =
    real === "owner" ||
    deskOf(real) === "finance" ||
    grantedDesks(m).includes("finance");
  if (!financeCapability) return false;
  // Finance writes require entering the finance workbench. The owner keeps
  // read-only finance visibility in the management workbench.
  return m.portal ? m.portal === "finance" : deskOf(real) === "finance";
};
export const canViewFinance = (m: Member) =>
  canFinance(m) || isManager(m);
// Business capability shown inside the management workbench. Manager authority
// still comes from isManager(realRole); a mapped collaborator only receives
// their own professional capability.
export const managementCapability = (m: Member): Desk =>
  isManager(m)
    ? "management"
    : deskOf(realRole(m)) === "aftersales"
      ? "aftersales"
      : "operations";
export const ownsProject = (p: Project, m: Member) => p.ownerMemberId === m.id;
export const taskVisible = (dept: string, m: Member) => {
  if (isManager(m)) return true;
  const capability = departmentDesk(dept);
  return (
    capability !== "management" && nonManagementGrants(m).includes(capability)
  );
};
export const matchesDepartment = (m: Member, dept: string) => {
  if (isManager(m)) return true;
  const capability = departmentDesk(dept);
  return (
    capability !== "management" && nonManagementGrants(m).includes(capability)
  );
};
export function canReadProject(p: Project, m: Member) {
  if (m.status !== "active") return false;
  const real = realRole(m);
  if (isCompanyManager(m) || deskOf(real) === "finance") return true;
  if (isScopedManager(m))
    return (
      m.region !== "全部分部" &&
      m.region !== "待分配" &&
      workflowOf(p).region === m.region
    );
  return real === "sales" && ownsProject(p, m);
}
export const salesCommercial = (c: Project['commercial']): Project['commercial'] => c ? ({
  ...c, costUnitPrice: null, profitNotes: '',
  quotes: c.quotes.map(q => ({...q, costUnitPrice: null})),
  competitors: c.competitors.map(q => ({...q, costUnitPrice: null})),
}) : undefined;
export const visibleProject = (p: Project, m: Member): Project => ({
  ...p,
  commercial: canViewFinance(m) ? p.commercial : realRole(m) === "sales" && ownsProject(p,m) ? salesCommercial(p.commercial) : undefined,
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
  (isManager(m) || (realRole(m) === "sales" && ownsProject(p, m)));
export const canCreateProject = (m: Member) =>
  isManager(m) || realRole(m) === "sales";
export const canCheckDepartment = (m: Member, dept: DepartmentId) => {
  if (isManager(m)) return true;
  const capability = departmentDesk(dept);
  return (
    capability !== "management" && nonManagementGrants(m).includes(capability)
  );
};
export const mayViewBook = (p: Project, m: Member) =>
  canReadProject(p, m) && (canViewFinance(m) || (realRole(m) === "sales" && ownsProject(p,m)));
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
export const canEditFact = (m: Member, key: string): boolean => {
  if (key.startsWith("check:"))
    return !!GUIDES.flatMap((g) => g.checks).find(
      (c) => c.id === key.slice(6) && canCheckDepartment(m, c.department),
    );
  if (key.startsWith("stage:")) {
    const capability = key.slice(key.lastIndexOf(":") + 1) as Desk;
    return isManager(m) || nonManagementGrants(m).includes(capability);
  }
  if (isManager(m)) return true;
  if (realRole(m) === "sales") return key !== "payment-record";
  return nonManagementGrants(m).some((d) =>
    FACT_ACCESS[d]?.includes(key),
  );
};
export const canEditMilestone = (m: Member, dept: string) => {
  if (isManager(m)) return true;
  if (realRole(m) === "sales") return dept !== "finance";
  const capability = departmentDesk(dept);
  return (
    capability !== "management" && nonManagementGrants(m).includes(capability)
  );
};
