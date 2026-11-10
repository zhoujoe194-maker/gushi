"use client";
import { ProjectOutcomes, ProjectResults, PauseReviewReminder } from './outcome-panels';
import { statusOf, BUSINESS_STATUSES } from './outcome-model';
import { ProjectBusiness } from "./project-business";
import MeetingCenter from "./meeting-center";
import { FinanceOperationsPanel } from "./finance-operations-panel";
import { applyFinanceOperation, financeOperations } from "./finance-operations";
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useId,
} from "react";
import Link from "next/link";
import { useModalFocus } from "./use-modal-focus";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  SquareCheckBig,
  Columns3,
  Package,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Clock3,
  TriangleAlert,
  Check,
  CheckCheck,
  X,
  Building2,
  MapPin,
  CalendarDays,
  ClipboardCheck,
  Users,
  FileText,
  Download,
  RefreshCw,
  SlidersHorizontal,
  Activity,
  Target,
  History,
  PanelLeftClose,
  Menu,
  ShieldCheck,
  ExternalLink,
  Pencil,
  Trash2,
  Wallet,
  Bell,
  LogOut,
  MessagesSquare,
  Layers3,
} from "lucide-react";
import {
  WorkflowOverview,
  StageWorkspace,
  CollaborationEditor,
  DepartmentCenter,
  FilingCenter,
  TrainingGuide,
  OrganizationMatrix,
} from "./workflow-panels";
import {
  Workflow,
  Collaboration,
  workflowOf,
  demoWorkflow,
  DEPARTMENTS,
  guideFor,
  departmentName,
  filingAlerts,
  workflowChanges,
} from "./workflow";
import {
  STAGES,
  ACTIVE,
  CATALOG,
  DEFAULT_CONFIG,
  Project,
  Product,
  Opportunity,
  Event,
  Config,
  blankProject,
  demoData,
  today,
  risk,
  isActive,
  daysSince,
} from "./model";
const ALL_NAV = [
  { id: "overview", label: "经营总览", icon: LayoutDashboard },
  { id: "projects", label: "项目协同", icon: BriefcaseBusiness },
  { id: "tasks", label: "本台任务", icon: SquareCheckBig },
  { id: "messages", label: "消息中心", icon: MessagesSquare, Layers3 },
  { id: "filings", label: "厂家报备", icon: FileText },
  { id: "pipeline", label: "阶段看板", icon: Columns3 },
  { id: "meetings", label: "周会与任务", icon: CalendarDays },
  { id: "finance", label: "合同与票款", icon: Wallet },
  { id: "members", label: "人员管理", icon: Users },
  { id: "sales", label: "销售考核", icon: ClipboardCheck },
  { id: "results", label: "我的项目结果", icon: History },
  { id: "guide", label: "跟进指南", icon: History },
  { id: "products", label: "品牌与产品", icon: Package },
  { id: "settings", label: "组织与设置", icon: Settings },
];
import { grantedDesks, hasDesk, inDesk, defaultDesk } from "./access";
import { FilingEditor } from "./filing-editor";
import {
  RoleHome,
  FinanceCenter,
  ProjectFinance,
  MembersPanel,
} from "./role-panels";
import {
  Member,
  Role,
  ROLES,
  Notification,
  roleInfo,
  isManager,
  canEditProject,
  canCreateProject,
  canViewFinance,
  mayViewBook,
  deskOf,
  visibleProject,
  isScopedManager,
  Desk,
} from "./team";
import { FinanceBook, emptyBook, totals } from "./finance-model";
import { roleDemo, demoMembers } from "./demo-team";
import TaskCenter, { TaskEditor } from "./task-center";
import { readTaskImage, type TaskImage } from "./task-images";
import SalesCenter from "./sales/center";
import MessageCenter from "./message-center";
import RoleDashboard from "./role-dashboard";
import { Linkage, linkageSummary } from "./dashboard-model";
import {
  DeskTask,
  demoDeskTasks,
  inTaskScope,
  canDispatchTask,
} from "./task-model";
const SOURCES = [
  "老客户",
  "设计院",
  "同行",
  "RCC",
  "开发区管委会 / 招商办",
  "重点项目信息",
  "工程咨询公司",
  "其他",
];
const TYPES = [
  "工业厂房",
  "物流仓库",
  "工业园区",
  "商业地产",
  "公共建筑",
  "学校场馆",
  "能源电力",
  "其他",
];
const fmt = (n: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(n);
const shortDate = (s: string) => (s ? s.slice(5).replace("-", "/") : "未安排");
const stamp = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Avatar({ name }: { name: string }) {
  return (
    <span className={"avatar " + (name.includes("协作") ? "violet" : "")}>
      {name.slice(0, 1)}
    </span>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div>
        <BriefcaseBusiness size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    titleId = useId(),
    descriptionId = useId();
  useModalFocus(ref, close);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId} tabIndex={-1} data-modal-initial-focus>
              {title}
            </h2>
            {subtitle && <p id={descriptionId}>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            aria-label={"关闭" + title}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function Workspace({
  portalRole = "owner",
  initialMember,
  demoEnabled = false,
  demoAccount = false,
}: {
  portalRole?: Role;
  initialMember?: Member;
  demoEnabled?: boolean;
  demoAccount?: boolean;
}) {
  const [member, setMember] = useState<Member>(
      initialMember || demoMembers.find((m) => m.role === portalRole)!,
    ),
    [members, setMembers] = useState<Member[]>(demoEnabled ? demoMembers : []),
    [finances, setFinances] = useState<Record<string, FinanceBook>>({}),
    [notifications, setNotifications] = useState<Notification[]>([]),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [filingProject, setFilingProject] = useState<Project | null>(null);
  const viewMember = member;
  const [creatingTask, setCreatingTask] = useState(false),
    [taskCreateBusy, setTaskCreateBusy] = useState(false),
    [taskCreateError, setTaskCreateError] = useState("");
  const [deskTasks, setDeskTasks] = useState<DeskTask[]>([]),
    [linkages, setLinkages] = useState<Linkage[]>([]),
    [taskFocus, setTaskFocus] = useState(""),
    [taskDesk, setTaskDesk] = useState("全部");
  const visibleTasks = deskTasks.filter((t) => inTaskScope(t, viewMember));
  const allowed = (() => {
    if (isManager(viewMember))
      return [
        "overview",
        "projects",
        "tasks",
        "filings",
        "pipeline",
        "finance",
        "members",
        "meetings",
        "guide",
        "products",
        ...(member.role === "owner" ? ["settings"] : []),
      ];
    if (viewMember.role === "sales")
      return [
        "overview",
        "projects",
        "tasks",
        "filings",
        "pipeline",
        "finance",
        "guide",
        "products",
      ];
    if (viewMember.role === "finance")
      return ["overview", "finance", "projects", "tasks", "guide"];
    if (viewMember.role === "hr") return ["overview", "tasks", "guide"];
    return ["overview", "projects", "tasks", "filings", "guide", "products"];
  })();
  allowed.push("messages");
  if (isManager(viewMember) || viewMember.role === "sales")
    allowed.push("sales", "results");
  const NAV = ALL_NAV.filter((n) => allowed.includes(n.id)).map((n) =>
    n.id === "results" && isManager(viewMember) ? {...n,label:"员工结果与复查"} :
    n.id === "overview"
      ? { ...n, label: roleInfo(viewMember.role).portal }
      : n.id === "tasks"
        ? {
            ...n,
            label: isManager(viewMember)
              ? "派单与督办"
              : viewMember.role === "sales"
                ? "任务下发与跟进"
                : "本台任务",
          }
        : n,
  );

  const [tab, setTab] = useState("overview"),
    [demo, setDemo] = useState(demoEnabled),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [mobileNav, setMobileNav] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null),
    drawerRef = useRef<HTMLElement>(null),
    pageTitleRef = useRef<HTMLHeadingElement>(null),
    notificationRef = useRef<HTMLDivElement>(null),
    notificationToggleRef = useRef<HTMLButtonElement>(null);
  const [compactNav, setCompactNav] = useState(false);
  const hasNavigated = useRef(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => {
      setCompactNav(query.matches);
      if (!query.matches) setMobileNav(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useModalFocus(sidebarRef, () => setMobileNav(false), mobileNav && compactNav);
  useEffect(() => {
    if (!hasNavigated.current) return;
    const frame = requestAnimationFrame(() =>
      pageTitleRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  useEffect(() => {
    if (!notificationsOpen) return;
    notificationRef.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNotificationsOpen(false);
        notificationToggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [notificationsOpen]);
  const [projects, setProjects] = useState<Project[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [config, setConfig] = useState<Config>(DEFAULT_CONFIG),
    [configDraft, setConfigDraft] = useState<Config>(DEFAULT_CONFIG);
  const [messageUnread, setMessageUnread] = useState(0);
  const [groupRequest, setGroupRequest] = useState<{
    projectId: string;
    nonce: number;
  }>();
  const [region, setRegion] = useState("全部分部"),
    [department, setDepartment] = useState("全部部门"),
    [taskModal, setTaskModal] = useState<{
      projectId: string;
      version: number;
      task?: Collaboration;
    } | null>(null);
  const [search, setSearch] = useState(""),
    [owner, setOwner] = useState("全部负责人"),
    [stage, setStage] = useState("全部阶段"),
    [filter, setFilter] = useState("全部项目"),
    [detail, setDetail] = useState<string | null>(null),
    [detailTab, setDetailTab] = useState("阶段推进"),
    [form, setForm] = useState<"create" | "edit" | "followup" | null>(null),
    [draft, setDraft] = useState<Project>(blankProject("销售负责人")),
    [note, setNote] = useState(""),
    [productEdit, setProductEdit] = useState<Product | null>(null),
    [brand, setBrand] = useState("全部品牌");
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("view");
    if (
      target &&
      ["messages", "members"].includes(target) &&
      allowed.includes(target)
    )
      setTab(target);
    if (demoEnabled) {
      const state = roleDemo(portalRole, demoAccount);
      setMember(state.member);
      setMembers(state.members);
      setProjects(state.projects);
      setEvents(state.events);
      setFinances(state.finances);
      setDeskTasks(demoDeskTasks());
      setLinkages(
        linkageSummary(state.projects, state.finances, demoDeskTasks()),
      );
      setReady(true);
    } else loadLive();
  }, []);
  useEffect(() => {
    if (demoEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") loadLive(true);
    };
    const timer = setInterval(refresh, 45000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const id = setInterval(() => setReady((x) => !x), 60000);
    return () => clearInterval(id);
  }, []);
  const workspaceFetch = useCallback(
    (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("X-Workspace-Desk", deskOf(portalRole));
      return fetch(url, { ...init, headers });
    },
    [portalRole],
  );
  async function loadLive(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await workspaceFetch("/api/workspace", { cache: "no-store" });
      const data = (await res.json()) as {
        error?: string;
        projects: Project[];
        events: Event[];
        config: Config | null;
        member: Member;
        members: Member[];
        finances: Record<string, FinanceBook>;
        notifications: Notification[];
        linkages: Linkage[];
      };
      if (res.status === 423) {
        window.location.assign("/account/security");
        return;
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setProjects([]);
          setEvents([]);
          setFinances({});
          setDeskTasks([]);
          setNotifications([]);
        }
        throw Error(data.error);
      }
      const taskRes = await workspaceFetch("/api/tasks", { cache: "no-store" });
      const taskData = (await taskRes.json()) as {
        tasks: DeskTask[];
        error?: string;
      };
      if (!taskRes.ok) {
        if (taskRes.status === 401 || taskRes.status === 403) {
          setDeskTasks([]);
          setProjects([]);
          setFinances({});
          setEvents([]);
          setNotifications([]);
        }
        throw Error(taskData.error);
      }
      setDeskTasks(taskData.tasks);
      setProjects(data.projects);
      setEvents(data.events);
      setConfig(data.config || DEFAULT_CONFIG);
      if (!silent) setConfigDraft(data.config || DEFAULT_CONFIG);
      setMember(data.member);
      setMembers(data.members);
      setFinances(data.finances);
      setNotifications(data.notifications);
      setLinkages(data.linkages || []);
      setReady(true);
      if (deskOf(data.member.role) !== deskOf(portalRole))
        window.location.href = "/work/" + deskOf(data.member.role);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  function switchMode() {
    window.location.href = demo
      ? "/work/" + portalRole
      : "/demo?role=" + portalRole + (demoAccount ? "&account=multi" : "");
  }
  async function financeAction(
    project: Project,
    book: FinanceBook,
    action: Record<string, unknown>,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        let b = structuredClone(book);
        const now = new Date().toISOString();
        if (financeOperations.includes(String(action.action)))
          applyFinanceOperation(
            b,
            action,
            viewMember,
            members,
            project.execution?.batches || [],
          );
        else if (action.action === "submit_contract")
          b = {
            ...b,
            contractSnapshot: {
              commercial: project.commercial,
              execution: project.execution,
              projectVersion: project.version,
            },
            contractNo: String(action.contractNo),
            contractAmountCents: Number(action.contractAmountCents),
            paymentTerms: String(action.paymentTerms),
            reviewStatus: "待审核",
          };
        else if (action.action === "review_contract") {
          b.reviewStatus =
            action.decision === "approved" ? "已审核" : "退回修改";
          b.reviewNote = String(action.note || "");
          if (action.decision === "approved") {
            const plans = action.plans as FinanceBook["plans"];
            if (
              plans.reduce((s, p) => s + p.amountCents, 0) !==
              b.contractAmountCents
            )
              throw Error("收款计划合计必须等于合同金额");
            b.plans = plans;
          }
        } else if (action.action === "record_receipt") {
          const p = b.plans.find((p) => p.id === action.planId);
          const value = Number(action.amountCents);
          if (
            !p ||
            value >
              p.amountCents -
                b.receipts
                  .filter((r) => r.planId === p.id && !r.voidAt)
                  .reduce((s, r) => s + r.amountCents, 0)
          )
            throw Error("收款金额超过未收余额");
          b.receipts.push({
            id: crypto.randomUUID(),
            planId: String(action.planId),
            amountCents: value,
            date: String(action.date),
            reference: String(action.reference || ""),
            note: String(action.note || ""),
            recordedBy: member.id,
          });
        } else if (action.action === "void_receipt") {
          const r = b.receipts.find((r) => r.id === action.receiptId);
          if (r) {
            r.voidAt = now;
            r.voidReason = String(action.reason);
          }
        } else if (action.action === "request_invoice") {
          if (
            Number(action.amountCents) >
            b.contractAmountCents -
              b.invoices
                .filter((i) => i.status !== "已退回")
                .reduce((s, i) => s + i.amountCents, 0)
          )
            throw Error("申请金额超过可开票余额");
          b.invoices.push({
            id: crypto.randomUUID(),
            amountCents: Number(action.amountCents),
            title: String(action.title),
            taxNo: String(action.taxNo),
            remark: String(action.remark || ""),
            requestedBy: member.id,
            requestedAt: now,
            status: "待开票",
            number: "",
            issuedDate: "",
            reply: "",
          });
        } else if (action.action === "process_invoice") {
          const i = b.invoices.find((i) => i.id === action.invoiceId);
          if (i) {
            i.status = action.decision === "issued" ? "已开票" : "已退回";
            i.number = String(action.number || "");
            i.issuedDate = String(action.issuedDate || "");
            i.reply = String(action.reply || "");
          }
        } else if (action.action === "finance_memo")
          b.financeMemo = String(action.memo || "");
        b.version += 1;
        b.updatedAt = now;
        setFinances((fs) => ({ ...fs, [project.id]: b }));
        setNotice("演示票款进度已更新");
        return true;
      }
      const r = await workspaceFetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...action,
          projectId: project.id,
          version: book.version,
        }),
      });
      const body = (await r.json()) as {
        error?: string;
        book: FinanceBook;
        event: Event;
      };
      if (!r.ok) throw Error(body.error);
      setFinances((fs) => ({ ...fs, [project.id]: body.book }));
      setEvents((es) => [body.event, ...es]);
      setNotice("票款结果已保存并同步相关岗位");
      await loadLive(true);
      return true;
    } catch (e) {
      throw Error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function saveMember(data: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      if (demo) {
        const desks = data.assignedDesks as Desk[];
        if (!desks?.length) throw Error("至少选择一个工作台");
        if (!data.email && !data.phone) throw Error("邮箱或手机号至少填写一项");
        const previous = members.find((m) => m.id === data.id);
        const updated = {
          ...previous,
          ...data,
          id: previous?.id || crypto.randomUUID(),
          role: data.defaultDesk,
          accountRole: data.defaultDesk,
          profileCompleted: previous?.profileCompleted ?? false,
          bound: true,
          mustChangePassword: !!data.password || previous?.mustChangePassword,
          version: (previous?.version || 0) + 1,
        } as Member;
        setMembers((ms) => [...ms.filter((m) => m.id !== updated.id), updated]);
        setNotice("演示人员权限已更新，刷新后重置");
        return true;
      }
      const res = await workspaceFetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json()) as { error?: string; members: Member[] };
      if (!res.ok) throw Error(body.error);
      setMembers(body.members);
      setNotice("成员岗位已保存");
      return true;
    } catch (e) {
      throw Error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function deskTaskAction(
    action: Record<string, unknown>,
  ): Promise<boolean> {
    if (demo) {
      const now = new Date().toISOString();
      const old = deskTasks.find((t) => t.id === action.id);
      let task: DeskTask;
      if (action.action === "create" || action.action === "edit") {
        const data = action.data as Partial<DeskTask>;
        task = {
          ...(old || {}),
          ...data,
          id: old?.id || crypto.randomUUID(),
          version: (old?.version || 0) + 1,
          createdBy: viewMember.id,
          createdByName: viewMember.name,
          createdAt: old?.createdAt || now,
          updatedAt: now,
          status: old?.status || "待处理",
          result: old?.result || "",
          reviewNote: "",
          assigneeName:
            members.find((m) => m.id === data.assigneeId)?.name || "",
          projectName:
            projects.find((p) => p.id === data.projectId)?.name || "",
          history: old?.history || [],
        } as DeskTask;
      } else {
        if (!old) throw Error("任务不存在");
        if (
          action.action === "feedback" &&
          action.status === "待验收" &&
          !String(action.result || "").trim()
        )
          throw Error("请填写处理结果");
        task = {
          ...old,
          version: old.version + 1,
          updatedAt: now,
          status:
            action.action === "feedback"
              ? (action.status as DeskTask["status"])
              : action.action === "accept"
                ? "已完成"
                : action.action === "return"
                  ? "处理中"
                  : "已取消",
          result:
            action.action === "feedback" ? String(action.result) : old.result,
          reviewNote: String(action.note || ""),
        };
      }
      task.history = [
        // Demo images remain in this page's memory and never reach the server.
        ...task.history,
        {
          at: now,
          actor: viewMember.name,
          note: String(
            action.note ||
              (
                {
                  create: "派发任务",
                  edit: "调整任务",
                  feedback: "提交处理进展",
                  accept: "验收通过",
                  return: "退回补充",
                  cancel: "取消任务",
                } as Record<string, string>
              )[String(action.action)],
          ),
          status: task.status,
        },
      ];
      if (action.action === "feedback") {
        const files = (action.files || []) as File[];
        const retained = action.retainedImageIds as string[] | undefined;
        const images: TaskImage[] = await Promise.all(
          files.map(async (file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            bytes: file.size,
            width: 0,
            height: 0,
            createdAt: now,
            createdBy: viewMember.name,
            previewUrl: await readTaskImage(file),
          })),
        );
        task.images = [
          ...(old?.images || []).filter(
            (image) => !retained || retained.includes(image.id),
          ),
          ...images,
        ];
        task.history[task.history.length - 1].images = task.images;
      }
      setDeskTasks((ts) => [task, ...ts.filter((t) => t.id !== task.id)]);
      setNotice("演示任务已更新");
      return true;
    }
    const { files, ...payload } = action;
    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    for (const file of (files || []) as File[]) form.append("images", file);
    const res = await workspaceFetch("/api/tasks", {
      method: "POST",
      ...(files
        ? { body: form }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
    });
    const body = (await res.json().catch(() => ({
      error: "上传未完成，请检查网络和服务器上传大小设置后重试。",
    }))) as { task: DeskTask; error?: string };
    if (!res.ok) throw Error(body.error);
    setDeskTasks((ts) => [
      body.task,
      ...ts.filter((t) => t.id !== body.task.id),
    ]);
    setNotice("任务已保存，相关工作台同步最新进度");
    await loadLive(true);
    return true;
  }
  async function createStandaloneTask(data: Record<string, unknown>) {
    setTaskCreateBusy(true);
    setTaskCreateError("");
    try {
      const saved = await deskTaskAction({ action: "create", data });
      if (saved) setCreatingTask(false);
      return saved;
    } catch (e) {
      setTaskCreateError(e instanceof Error ? e.message : "下发失败，请重试");
      return false;
    } finally {
      setTaskCreateBusy(false);
    }
  }
  function openFinance(p: Project) {
    setDetail(p.id);
    setDetailTab("合同与票款");
  }
  async function markNotifications() {
    if (!demo)
      await workspaceFetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_notifications" }),
      });
    setNotifications((ns) =>
      ns.map((n) => ({ ...n, readAt: new Date().toISOString() })),
    );
  }
  function navigate(id: string) {
    if (!allowed.includes(id)) return;
    hasNavigated.current = true;
    setTaskFocus("");
    setTaskDesk("全部");
    setTab(id);
    setSearch("");
    setMobileNav(false);
    setFilter("全部项目");
    setStage("全部阶段");
    setOwner("全部负责人");
    setBrand("全部品牌");
  }
  const scopeProjects = projects.filter(
    (p) => region === "全部分部" || workflowOf(p).region === region,
  );
  const homeLinkages = demo
    ? linkageSummary(projects, finances, deskTasks)
    : linkages;
  const active = scopeProjects.filter(isActive),
    overdue = active.filter((p) => p.nextDate && p.nextDate < today()),
    todayTasks = active.filter((p) => p.nextDate === today()),
    stale = active.filter((p) => !!p.lastFollowupAt && daysSince(p.lastFollowupAt) >= config.staleDays),
    missing = active.filter((p) => !p.nextDate),
    attention = active
      .filter((p) => risk(p, config.staleDays).level >= 2)
      .sort(
        (a, b) =>
          risk(b, config.staleDays).level - risk(a, config.staleDays).level,
      );
  const [businessFilter,setBusinessFilter] = useState("全部状态");
  const filtered = scopeProjects.filter(
    (p) =>
      (!search ||
        [
          p.name,
          p.customer,
          p.location,
          p.designer,
          p.contractor,
          p.owner,
          ...p.opportunities.map(
            (o) =>
              config.products.find((x) => x.id === o.productId)?.name || "",
          ),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (owner === "全部负责人" || p.owner === owner) &&
      (businessFilter === "全部状态" || statusOf(p) === businessFilter) &&
      (stage === "全部阶段" || p.stage === stage) &&
      (filter === "全部项目" ||
        (filter === "进行中" && isActive(p)) ||
        (filter === "跟进逾期" && overdue.includes(p)) ||
        (filter === "长期未更新" && stale.includes(p)) ||
        (filter === "缺少计划" && missing.includes(p)) ||
        (filter === "今日待办" && todayTasks.includes(p))),
  );
  const selected = projects.find((p) => p.id === detail),
    title = NAV.find((n) => n.id === tab)?.label || "工作总览";
  useModalFocus(
    drawerRef,
    () => setDetail(null),
    !!selected && !form && !taskModal,
  );
  function openProject(p: Project) {
    setDetail(p.id);
    setDetailTab("协作动态");
  }
  const followupRequestId = useRef("");
  function newProject() {
    setDraft({
      ...blankProject(member.name),
      ownerMemberId: member.id,
      workflow: {
        ...workflowOf(blankProject(config.owners[0])),
        region: "全部分部",
      },
    });
    setNote("");
    setError("");
    setForm("create");
  }
  function openForm(p: Project, mode: "edit" | "followup") {
    setDraft({...structuredClone(p), ...(mode === "followup" ? {nextDate:""} : {})});
    followupRequestId.current = crypto.randomUUID();
    setNote("");
    setError("");
    setForm(mode);
  }
  function goFilter(f: string) {
    hasNavigated.current = true;
    setTab("projects");
    setFilter(f);
    setStage("全部阶段");
    setOwner("全部负责人");
    setSearch("");
  }
  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let result: { project: Project; event: Event };
      const payload = { ...draft };
      if (form === "followup" && !note.trim())
        throw Error("请填写本次跟进结果");
      if (demo) {
        const prev = projects.find((x) => x.id === draft.id);
        const changes = prev
          ? (["stage", "owner", "nextAction", "nextDate"] as const)
              .filter((k) => prev[k] !== draft[k])
              .map(
                (k) =>
                  `${{ stage: "阶段", owner: "负责人", nextAction: "下一步行动", nextDate: "跟进日期" }[k]}：${prev[k]} → ${draft[k]}`,
              )
          : [];
        if (prev && draft.workflow)
          changes.push(...workflowChanges(prev.workflow, draft.workflow));
        if (
          prev &&
          JSON.stringify(prev.opportunities) !==
            JSON.stringify(draft.opportunities)
        )
          changes.push("产品机会 / 厂家报备已更新");
        const p = {
          ...payload,
          id: draft.id || crypto.randomUUID(),
          version: draft.version + 1,
          updatedAt: new Date().toISOString(),
          ...(form === "followup" ? {lastFollowupAt:new Date().toISOString(),latestFollowupContent:note.trim()} : {}),
        };
        result = {
          project: p,
          event: {
            id: crypto.randomUUID(),
            projectId: p.id,
            createdAt: p.updatedAt,
            kind:
              form === "create"
                ? "创建项目"
                : form === "followup"
                  ? "跟进记录"
                  : "更新项目",
            actor: member.name + "（演示）",
            actorMemberId: member.id,
            ...(form === "followup" ? {nextFollowupDate:draft.nextDate || null} : {}),
            note,
            changes,
          },
        };
      } else {
        const r = await workspaceFetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: form === "edit" ? "update" : form,
            id: draft.id,
            version: draft.version,
            data: payload,
            note,
            ...(form === "followup" ? {content:note, nextDate:draft.nextDate, requestId:followupRequestId.current} : {}),
          }),
        });
        const b = (await r.json()) as {
          error?: string;
          project: Project;
          event: Event;
        };
        if (!r.ok) throw Error(b.error);
        result = b;
      }
      setProjects((ps) => [
        result.project,
        ...ps.filter((p) => p.id !== result.project.id),
      ]);
      setEvents((es) => [result.event, ...es.filter(e => e.id !== result.event.id)]);
      setForm(null);
      setDetail(result.project.id);
      setDetailTab("协作动态");
      setNotice(
        demo ? "演示操作已完成，未写入正式数据" : form === "followup" ? "跟进已保存" : "项目资料已保存",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function saveWorkflow(
    project: Project,
    workflow: Workflow,
    message: string,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      let result: { project: Project; event: Event };
      const data = { ...project, workflow };
      if (demo) {
        const updated = {
          ...data,
          version: project.version + 1,
          updatedAt: new Date().toISOString(),
          ...(form === "followup" ? {lastFollowupAt:new Date().toISOString(),latestFollowupContent:note.trim()} : {}),
        };
        result = {
          project: updated,
          event: {
            id: crypto.randomUUID(),
            projectId: project.id,
            createdAt: updated.updatedAt,
            kind: "协作与阶段更新",
            actor: "当前用户（演示）",
            note: message,
            changes: workflowChanges(project.workflow, workflow),
          },
        };
      } else {
        const response = await workspaceFetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "workflow",
            id: project.id,
            version: project.version,
            data,
            note: message,
          }),
        });
        const body = (await response.json()) as {
          error?: string;
          project: Project;
          event: Event;
        };
        if (!response.ok) throw Error(body.error);
        result = body;
      }
      setProjects((ps) =>
        ps.map((p) => (p.id === project.id ? result.project : p)),
      );
      setEvents((es) => [result.event, ...es.filter(e => e.id !== result.event.id)]);
      setNotice(demo ? "演示协作记录已更新" : "项目协作记录已保存");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openTask(project: Project, task?: Collaboration) {
    setTaskModal({ projectId: project.id, version: project.version, task });
    setError("");
  }
  async function saveTask(task: Collaboration) {
    const project = projects.find((p) => p.id === taskModal?.projectId);
    if (!project) return;
    if (project.version !== taskModal?.version) {
      setError("项目已被更新，请关闭表单后重新打开，避免覆盖其他人的结果");
      return;
    }
    if (task.status === "已完成" && !task.result.trim()) {
      setError("完成协作事项必须填写处理结果与反馈");
      return;
    }
    const w = workflowOf(project);
    const exists = w.tasks.some((t) => t.id === task.id);
    const next = {
      ...w,
      tasks: exists
        ? w.tasks.map((t) => (t.id === task.id ? task : t))
        : [task, ...w.tasks],
    };
    if (
      await saveWorkflow(
        project,
        next,
        `${exists ? "更新" : "新建"}协作：${task.title}；承办：${departmentName(task.department)} / ${task.assignee}；状态：${task.status}${task.result ? "；反馈：" + task.result : ""}`,
      )
    )
      setTaskModal(null);
  }
  async function saveConfig(next: Config) {
    setBusy(true);
    setError("");
    try {
      if (
        !next.company.trim() ||
        !next.owners.length ||
        next.staleDays < 1 ||
        next.staleDays > 90
      )
        throw Error("请填写工作区名称、至少一名负责人，以及 1–90 天的提醒阈值");
      if (!demo) {
        const r = await workspaceFetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "config", data: next }),
        });
        const b = (await r.json()) as {
          error?: string;
          project: Project;
          event: Event;
        };
        if (!r.ok) throw Error(b.error);
      }
      setConfig(next);
      setConfigDraft(next);
      setProductEdit(null);
      setNotice(demo ? "演示配置已更新，退出后不保留" : "配置已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  function exportCSV() {
    const rows = [
      [
        "项目名称",
        "所属分部",
        "区域",
        "类型",
        "来源",
        "负责人",
        "业务状态",
        "详细工程阶段",
        "预计金额（万元）",
        "业主",
        "设计院",
        "采购单位",
        "下一步行动",
        "跟进日期",
        "最近更新",
        "产品机会",
      ],
      ...filtered.map((p) => [
        p.name,
        workflowOf(p).region,
        p.location,
        p.type,
        p.source,
        p.owner,
        statusOf(p),
        p.stage,
        p.amount,
        p.customer,
        p.designer,
        p.contractor,
        p.nextAction,
        p.nextDate,
        p.updatedAt,
        p.opportunities
          .map((o) => config.products.find((x) => x.id === o.productId)?.name)
          .join("；"),
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((r) =>
          r
            .map((x) => {
              let s = String(x);
              if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
              return '"' + s.replaceAll('"', '""') + '"';
            })
            .join(","),
        )
        .join("\r\n");
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.href = url;
    a.download = (demo ? "演示项目台账-" : "项目台账-") + today() + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("已导出当前筛选结果");
  }
  const table = (items: Project[], compact = false) => (
    <div className="table-scroll quick-project-list">
      <table className="project-table quick-project-table">
        <thead>
          <tr>
            <th>项目名称 / 产品机会</th>
            <th>业务状态 / 工程阶段</th>
            <th>主跟 / 协作</th>
            <th>下次跟进</th>
            {!compact && <th>预计金额</th>}
            <th>跟进状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const r = risk(p, config.staleDays);
            return (
              <tr key={p.id}>
                <td>
                  <button
                    className="project-link"
                    onClick={() => openProject(p)}
                  >
                    {p.name}
                  </button>
                  <div className="cell-sub">最近跟进：{p.lastFollowupAt ? stamp(p.lastFollowupAt) : "暂无记录"}</div>
                  <div className="cell-sub ellipsis">{p.latestFollowupContent || "等待首次跟进"}</div>
                  <div className="cell-sub">
                    {p.location || "地区待填写"}
                    <span>·</span>
                    {p.opportunities.length} 项产品机会
                  </div>
                </td>
                <td>
                  <span className={"stage-dot s" + STAGES.indexOf(p.stage)} />
                  {statusOf(p)}
                  <div className="cell-sub">{p.stage}</div>
                </td>
                <td>
                  <span className="owner-cell">
                    <Avatar name={p.owner} />
                    {p.owner}
                  </span>
                  <div className="cell-sub">
                    {workflowOf(p).region} ·{" "}
                    {guideFor(p.stage)
                      .support.slice(0, 2)
                      .map((d) => departmentName(d))
                      .join(" / ")}
                  </div>
                </td>
                <td className={r.tone === "red" ? "text-red" : ""}>
                  {p.nextDate ? shortDate(p.nextDate) : "待安排跟进"}
                  <div className="cell-sub ellipsis">
                    {p.nextAction || "尚未安排下一步"}
                  </div>
                </td>
                {!compact && (
                  <td className="amount">
                    ¥ {fmt(p.amount)}
                    <small> 万</small>
                  </td>
                )}
                <td>
                  <Badge tone={r.tone}>{r.text}</Badge>
                </td>
                <td>
                  {canEditProject(p,viewMember) && <button className="button small-button" onClick={()=>openForm(p,"followup")}>记录跟进</button>}
                  <button
                    className="icon-button"
                    onClick={() => openProject(p)}
                    aria-label={"查看" + p.name}
                  >
                    <ChevronRight size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!items.length && (
        <Empty
          title="这里暂时没有项目"
          description="新建一个项目，或调整上方筛选条件。"
          action={
            canCreateProject(viewMember) ? (
              <button className="button primary" onClick={newProject}>
                <Plus size={16} />
                新建项目
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(e) => {
          e.preventDefault();
          pageTitleRef.current?.focus();
          pageTitleRef.current?.scrollIntoView({ block: "start" });
        }}
      >
        跳至主要内容
      </a>
      {mobileNav && (
        <button
          className="mobile-curtain"
          tabIndex={-1}
          aria-hidden="true"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id="workspace-navigation"
        tabIndex={-1}
        className={"sidebar " + (mobileNav ? "mobile-open" : "")}
        inert={compactNav && !mobileNav}
        role={compactNav && mobileNav ? "dialog" : undefined}
        aria-modal={compactNav && mobileNav ? true : undefined}
        aria-label="工作台导航"
      >
        <button
          className="mobile-nav-close icon-button"
          aria-label="收起导航"
          onClick={() => setMobileNav(false)}
        >
          <X size={18} />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-icon">
            <Building2 size={23} />
          </span>
          <span>
            固实能源<span className="brand-sub">PROJECT WORKSPACE</span>
          </span>
        </a>
        <div className="workspace-label">
          岗位协作台 <span>V4.0</span>
        </div>
        <nav aria-label="主要导航">
          {NAV.map((n, i) => (
            <React.Fragment key={n.id}>
              {i === 5 && <div className="nav-divider" />}
              <button
                className={"nav-item " + (tab === n.id ? "active" : "")}
                aria-current={tab === n.id ? "page" : undefined}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} />
                <span>{n.label}</span>
                {n.id === "messages" && messageUnread > 0 && (
                  <b>{messageUnread > 99 ? "99+" : messageUnread}</b>
                )}
                {n.id === "tasks" &&
                  visibleTasks.filter(
                    (t) => !["已完成", "已取消"].includes(t.status),
                  ).length > 0 && (
                    <b>
                      {
                        visibleTasks.filter(
                          (t) => !["已完成", "已取消"].includes(t.status),
                        ).length
                      }
                    </b>
                  )}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="side-note">
            <span className="status-dot" />
            厂家代理 · 经销业务<p>从项目机会，到每一步落实。</p>
          </div>
          <div className="profile">
            <span className="profile-avatar">{member.name.slice(0, 1)}</span>
            <div>
              <strong>{member.name}</strong>
              <small>
                {roleInfo(viewMember.role).name} · {member.region}
              </small>
            </div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label={mobileNav ? "收起导航" : "打开导航"}
              aria-expanded={mobileNav}
              aria-controls="workspace-navigation"
            >
              <Menu size={20} />
            </button>
            <span>{config.company}</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button notification-toggle"
              aria-label="员工消息"
              onClick={() => navigate("messages")}
            >
              <MessagesSquare size={18} />
              {messageUnread > 0 && (
                <b>{messageUnread > 99 ? "99+" : messageUnread}</b>
              )}
            </button>
            <button
              ref={notificationToggleRef}
              className="icon-button notification-toggle"
              aria-expanded={notificationsOpen}
              aria-controls="workspace-notifications"
              aria-label="岗位消息"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
            >
              <Bell size={18} />
              {notifications.some((n) => !n.readAt) && (
                <b>{notifications.filter((n) => !n.readAt).length}</b>
              )}
            </button>
            <label className="desk-switcher">
              <Layers3 size={14} />
              <select
                aria-label="切换工作台"
                value={deskOf(viewMember.role)}
                onChange={(e) =>
                  window.location.assign(
                    demo
                      ? "/demo?role=" +
                          e.target.value +
                          (demoAccount ? "&account=multi" : "")
                      : "/work/" + e.target.value,
                  )
                }
              >
                {grantedDesks(viewMember).map((d) => (
                  <option key={d} value={d}>
                    {roleInfo(d).name}台
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              aria-label="同步最新数据"
              onClick={() =>
                demo ? setNotice("演示数据仅在本次浏览中修改") : loadLive()
              }
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="退出登录"
              onClick={async (e) => {
                e.preventDefault();
                await workspaceFetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "logout" }),
                });
                location.assign("/");
              }}
            >
              <LogOut size={15} />
            </button>
            <a
              className="text-button account-security-link"
              href="/account/security"
            >
              修改密码
            </a>
            <span className="top-divider" />
            <span className="date-label">
              {today().replaceAll("-", ".")}{" "}
              <span>
                星期
                {
                  "日一二三四五六"[
                    new Date(today() + "T12:00:00+08:00").getUTCDay()
                  ]
                }
              </span>
            </span>
            <span className="profile-avatar small">
              {member.name.slice(0, 1)}
            </span>
          </div>
        </header>
        <main
          id="workspace-main"
          aria-labelledby="workspace-page-title"
          aria-busy={loading}
        >
          <div className={"mode-banner " + (!demo ? "live" : "")}>
            <span>
              <span className="status-dot" />
              {demo ? (
                <>
                  <b>演示工作区</b>
                  <span className="banner-detail">
                    {" "}
                    当前为虚构数据；演示消息在本浏览器保留，其他修改刷新后重置。
                  </span>
                </>
              ) : (
                <>
                  <b>{roleInfo(viewMember.role).portal}</b>
                  <span className="banner-detail">
                    {" "}
                    {
                      "以本人账号处理当前台的项目、任务和消息；可在顶部切换已授权工作台。"
                    }
                  </span>
                </>
              )}
            </span>
            <button onClick={switchMode}>
              {demo ? "使用本人账号登录" : "查看演示数据"}
              <ArrowRight size={14} />
            </button>
          </div>
          {error && !form && !productEdit && !taskModal && !selected && (
            <div className="error-box" role="alert">
              {error}
              {!demo && <Link href="/">登录工作区</Link>}
              <button
                onClick={() => {
                  setError("");
                  if (!demo) loadLive();
                }}
              >
                重试
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "overview"
                  ? "GUSHI · PROJECT COLLABORATION"
                  : "PROJECT SALES WORKSPACE"}
              </div>
              <h1 id="workspace-page-title" ref={pageTitleRef} tabIndex={-1}>
                {tab === "overview" ? roleInfo(viewMember.role).portal : title}
              </h1>
              <p>
                {
                  (
                    {
                      sales:
                        "工作记录、销售周报、销售月报与月度绩效，提交与审核有据可查。",
                      overview: "本台任务、到期提醒与项目交接，一眼掌握。",
                      projects:
                        "围绕销售流程，明确每一阶段的主责、协作、交接与下一步。",
                      tasks:
                        "销售或管理下发，承办台处理并反馈，管理验收；无需先创建项目。",
                      filings:
                        "按产品跟踪厂家判定与报备更新，避免遗漏关键保护环节。",
                      guide: "把公司培训中的工作要点，放在每个项目阶段旁。",
                      pipeline: "从线索到履约，一眼看清项目所处阶段。",
                      products: "按品牌、专业与使用区域，找到适合项目的产品。",
                      settings:
                        "按公司组织分工协同，项目对接人和工作规则可持续调整。",
                      meetings: "每周一会议纪要、周总任务与行动项落实。",
                      finance:
                        "合同审核、应收、收款与开票记录共享，敏感操作按岗位授权。",
                      messages:
                        "个人私聊、工作台沟通与项目群聊，交接说明和反馈集中查看。",
                      members:
                        "添加成员、分配工作台权限，跟踪首次姓名确认与账号激活。",
                    } as Record<string, string>
                  )[tab]
                }
              </p>
            </div>
            <div className="heading-actions">
              {tab === "overview" &&
                (isManager(viewMember) || viewMember.role === "sales") && (
                  <button className="button" onClick={() => navigate("sales")}>
                    <ClipboardCheck size={18} />
                    销售考核
                  </button>
                )}
              {canDispatchTask(viewMember) &&
                ["overview", "projects", "pipeline"].includes(tab) && (
                  <button
                    className="button"
                    onClick={() => {
                      setTaskCreateError("");
                      setCreatingTask(true);
                    }}
                  >
                    <SquareCheckBig size={18} />
                    下发任务
                  </button>
                )}
              {tab === "projects" && (
                <button className="button" onClick={exportCSV}>
                  <Download size={16} />
                  导出台账
                </button>
              )}
              {canCreateProject(viewMember) &&
                ![
                  "tasks",
                  "sales",
                  "settings",
                  "products",
                  "guide",
                  "filings",
                  "finance",
                  "members",
                  "meetings",
                  "messages",
                ].includes(tab) && (
                  <button className="button primary" onClick={newProject}>
                    <Plus size={18} />
                    新建项目
                  </button>
                )}
              {tab === "products" && member.role === "owner" && (
                <button
                  className="button primary"
                  onClick={() =>
                    setProductEdit({
                      id: "",
                      brand: "",
                      category: "建筑",
                      area: "",
                      name: "",
                    })
                  }
                >
                  <Plus size={18} />
                  新增产品
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <div className="loading" role="status">
              <RefreshCw className="spin" />
              正在加载工作区…
            </div>
          ) : (
            <>
              {!["overview", "messages", "members", "sales", "results"].includes(tab) && (
                <div className="workspace-scope">
                  <span>
                    <Users size={15} />
                    项目范围
                  </span>
                  <select
                    aria-label="按所属分部筛选"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {["全部分部", "广州总部", "湖南分部", "待分配"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <p>管理派单 · 售后 / 销售 / 财务 / 运营各司其职</p>
                  {member.role === "owner" && (
                    <button
                      className="text-button"
                      onClick={() => navigate("settings")}
                    >
                      查看组织分工
                      <ArrowUpRight size={13} />
                    </button>
                  )}
                </div>
              )}
              {demo && (
                <div className="demo-role-selector">
                  <span>体验岗位页面</span>
                  <select
                    aria-label="选择演示岗位"
                    value={deskOf(portalRole)}
                    onChange={(e) =>
                      (window.location.href = "/demo?role=" + e.target.value)
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <small>演示账号与真实成员完全分开。</small>
                </div>
              )}
              {tab === "overview" && isManager(viewMember) && !demo && <PauseReviewReminder request={workspaceFetch} projects={projects} open={()=>navigate("results")} />}
              {tab === "results" && <ProjectResults member={viewMember} request={workspaceFetch} projects={projects} demo={demo} onOpen={p=>{setDetail(p.id);setDetailTab("状态与原因");}} />}
              {tab === "overview" && (
                <RoleDashboard
                  member={viewMember}
                  projects={scopeProjects}
                  tasks={visibleTasks}
                  books={finances}
                  config={config}
                  linkages={homeLinkages.filter((l) =>
                    scopeProjects.some((p) => p.id === l.projectId),
                  )}
                  onOpen={openProject}
                  onFollowup={(p) => openForm(p, "followup")}
                  onTask={(t) => {
                    navigate("tasks");
                    setTaskFocus(t.id);
                  }}
                  onTasks={(d) => {
                    navigate("tasks");
                    if (d) setTaskDesk(d);
                  }}
                  onTab={navigate}
                  onFinance={openFinance}
                  onProjectFilter={goFilter}
                />
              )}
              {tab === "overview" && (
                <details className="business-overview">
                  <summary>
                    {viewMember.role === "finance"
                      ? "合同与票款业务"
                      : "项目与经营概览"}
                  </summary>
                  <RoleHome
                    member={viewMember}
                    projects={scopeProjects}
                    books={finances}
                    config={config}
                    onOpen={openProject}
                    onFinance={openFinance}
                    onTab={(t, d) => {
                      navigate(t);
                      if (d) setDepartment(d);
                    }}
                    onTask={openProject}
                    onFollowup={(p) => openForm(p, "followup")}
                  />
                </details>
              )}
              <div hidden={tab !== "messages"}>
                <MessageCenter
                  member={demo ? viewMember : member}
                  demo={demo}
                  active={tab === "messages"}
                  projects={projects}
                  onOpen={openProject}
                  onUnread={setMessageUnread}
                  groupRequest={groupRequest}
                />
              </div>
              {tab === "finance" && (canViewFinance(viewMember) || viewMember.role === "sales") && (
                <FinanceCenter
                  member={viewMember}
                  projects={scopeProjects}
                  books={finances}
                  onOpen={openFinance}
                />
              )}
              <div hidden={tab !== "meetings"}>
                {isManager(viewMember) && (
                  <MeetingCenter
                    active={tab === "meetings"}
                    demoTasks={deskTasks}
                    member={viewMember}
                    members={members}
                    demo={demo}
                    request={workspaceFetch}
                    onTasksChanged={() => {
                      if (!demo) void loadLive(true);
                    }}
                    onTaskCenter={() => navigate("tasks")}
                    onDemoDispatch={async (data) => {
                      const now = new Date().toISOString();
                      const task: DeskTask = {
                        ...(data as unknown as DeskTask),
                        id: crypto.randomUUID(),
                        version: 1,
                        projectName: "",
                        assigneeName:
                          members.find((m) => m.id === data.assigneeId)?.name ||
                          "",
                        status: "待处理",
                        result: "",
                        reviewNote: "",
                        createdBy: viewMember.id,
                        createdByName: viewMember.name,
                        createdAt: now,
                        updatedAt: now,
                        history: [
                          {
                            at: now,
                            actor: viewMember.name,
                            note: "由会议派发",
                            status: "待处理",
                          },
                        ],
                      };
                      setDeskTasks((ts) => [task, ...ts]);
                      return task;
                    }}
                  />
                )}
              </div>
              {tab === "members" && isManager(viewMember) && (
                <MembersPanel
                  member={viewMember}
                  members={members}
                  busy={busy}
                  onSave={saveMember}
                />
              )}
              {tab === "projects" && (
                <section className="panel">
                  <div
                    className="list-tabs"
                    role="group"
                    aria-label="项目状态筛选"
                  >
                    {[
                      "全部项目",
                      "进行中",
                      "跟进逾期",
                      "长期未更新",
                      "缺少计划",
                    ].map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        aria-pressed={filter === f}
                        className={filter === f ? "active" : ""}
                      >
                        {f}
                        {f === "全部项目" && (
                          <span>{scopeProjects.length}</span>
                        )}
                        {f === "跟进逾期" && overdue.length > 0 && (
                          <span className="red-count">{overdue.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="filterbar">
                    <label className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="搜索项目"
                        placeholder="搜索项目、客户或产品…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="按负责人筛选"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                    >
                      {[
                        "全部负责人",
                        ...new Set([
                          ...config.owners,
                          ...projects.map((p) => p.owner),
                        ]),
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      aria-label="按阶段筛选"
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                    >
                      {["全部阶段", ...STAGES.filter(s=>!["已暂停","已丢单","已结项"].includes(s))].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <select aria-label="业务状态筛选" value={businessFilter} onChange={e=>setBusinessFilter(e.target.value)}><option>全部状态</option>{BUSINESS_STATUSES.map(s=><option key={s}>{s}</option>)}</select>
                    <span className="result-count" role="status">
                      共 {filtered.length} 个项目
                    </span>
                  </div>
                  {table(filtered)}
                </section>
              )}
              {tab === "tasks" && (
                <>
                  <TaskCenter
                    key={taskFocus + ":" + taskDesk}
                    member={viewMember}
                    members={members}
                    projects={scopeProjects}
                    tasks={visibleTasks}
                    onAction={deskTaskAction}
                    onOpen={openProject}
                    focusTaskId={taskFocus}
                    filterDesk={taskDesk}
                  />
                  <details className="legacy-task-section">
                    <summary>历史项目协作记录</summary>
                    <DepartmentCenter
                      projects={scopeProjects}
                      department={department}
                      onDepartment={setDepartment}
                      onOpen={openProject}
                      onEditTask={openTask}
                      onFollowup={(p) => openForm(p, "followup")}
                    />
                  </details>
                </>
              )}
              {tab === "filings" && (
                <FilingCenter
                  projects={scopeProjects}
                  config={config}
                  onOpen={openProject}
                  canEdit={(p) =>
                    canEditProject(p, viewMember) ||
                    ["project", "operations"].includes(viewMember.role)
                  }
                  onEdit={(p) =>
                    canEditProject(p, viewMember)
                      ? openForm(p, "edit")
                      : setFilingProject(p)
                  }
                />
              )}
              {tab === "sales" && (
                <SalesCenter
                  member={viewMember}
                  projects={projects}
                  demo={demo}
                />
              )}
              {tab === "guide" && <TrainingGuide />}
              {tab === "pipeline" && (
                <>
                  <div className="pipeline-legend">
                    <span>
                      <i className="status-dot" />
                      点击卡片查看项目全貌
                    </span>
                    <span>阶段变更通过“编辑项目”完成并保留记录</span>
                  </div>
                  <div className="kanban">
                    {ACTIVE.map((s, i) => {
                      const ps = scopeProjects.filter((p) => p.stage === s);
                      return (
                        <section className="kanban-col" key={s}>
                          <div className="kanban-title">
                            <span>
                              <i className={"stage-dot s" + i} />
                              {s}
                              <b>{ps.length}</b>
                            </span>
                            <small>
                              ¥ {fmt(ps.reduce((a, p) => a + p.amount, 0))} 万
                            </small>
                          </div>
                          {ps.map((p) => (
                            <button
                              className="kanban-card"
                              key={p.id}
                              onClick={() => openProject(p)}
                            >
                              <span className="kanban-type">{p.type}</span>
                              <h3>{p.name}</h3>
                              <div className="cell-sub">
                                <MapPin size={12} />
                                {p.location || "区域待填写"}
                              </div>
                              <div className="kanban-money">
                                ¥ {fmt(p.amount)} <small>万</small>
                              </div>
                              <div className="mini-products">
                                {p.opportunities.slice(0, 2).map((o) => (
                                  <span key={o.id}>
                                    {
                                      config.products.find(
                                        (x) => x.id === o.productId,
                                      )?.name
                                    }
                                  </span>
                                ))}
                              </div>
                              <div className="kanban-bottom">
                                <Avatar name={p.owner} />
                                <Badge tone={risk(p, config.staleDays).tone}>
                                  {risk(p, config.staleDays).text}
                                </Badge>
                              </div>
                            </button>
                          ))}
                          {!ps.length && (
                            <div className="kanban-empty">暂无项目</div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                  <div className="closed-summary">
                    已成交{" "}
                    {scopeProjects.filter((p) => statusOf(p) === "已成交").length}{" "}
                    个 · 已丢单{" "}
                    {scopeProjects.filter((p) => statusOf(p) === "已丢单").length}{" "}
                    个 · 已暂停{" "}
                    {scopeProjects.filter((p) => statusOf(p) === "已暂停").length}{" "}
                    个
                    <button
                      className="text-button"
                      onClick={() => {
                        navigate("projects");
                        setFilter("全部项目");
                      }}
                    >
                      在项目台账查看
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {tab === "products" && (
                <>
                  <div className="catalog-summary">
                    <span className="catalog-icon">
                      <Package size={26} />
                    </span>
                    <div>
                      <h3>
                        {new Set(config.products.map((p) => p.brand)).size}{" "}
                        个品牌系列 · {config.products.length} 项产品应用
                      </h3>
                      <p>依据你提供的产品表整理，可编辑名称及分类。</p>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="filterbar">
                      <label className="search-field">
                        <Search size={17} />
                        <input
                          aria-label="搜索产品"
                          placeholder="搜索品牌、产品、使用区域…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="按品牌筛选"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                      >
                        {[
                          "全部品牌",
                          ...new Set(config.products.map((p) => p.brand)),
                        ].map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div className="table-scroll">
                      <table className="catalog-table">
                        <thead>
                          <tr>
                            <th>品牌系列</th>
                            <th>产品名称</th>
                            <th>专业分类</th>
                            <th>产品使用区域</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {config.products
                            .filter(
                              (p) =>
                                (brand === "全部品牌" || p.brand === brand) &&
                                [p.name, p.area, p.brand, p.category]
                                  .join(" ")
                                  .includes(search),
                            )
                            .map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <span className="brand-cell">
                                    <i />
                                    {p.brand}
                                  </span>
                                </td>
                                <td>
                                  <strong>{p.name}</strong>
                                </td>
                                <td>
                                  <Badge>{p.category}</Badge>
                                </td>
                                <td>{p.area}</td>
                                <td>
                                  {member.role === "owner" && (
                                    <button
                                      className="icon-button"
                                      aria-label={"编辑" + p.name}
                                      onClick={() => setProductEdit({ ...p })}
                                    >
                                      <Pencil size={15} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <p className="helper-text">
                    同一材料可对应不同应用场景；五金配件先按产品组管理，后续可补充具体型号。
                  </p>
                </>
              )}
              {tab === "settings" && (
                <>
                  <OrganizationMatrix />
                  <div className="settings-grid">
                    <section className="panel settings-panel">
                      <div className="section-heading">
                        <div>
                          <h2>基础设置</h2>
                          <p>把规则调整到适合你们团队的节奏。</p>
                        </div>
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveConfig({
                            ...configDraft,
                            owners: [
                              ...new Set(
                                configDraft.owners
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              ),
                            ],
                          });
                        }}
                      >
                        <label className="field">
                          工作区名称
                          <input
                            required
                            maxLength={50}
                            value={configDraft.company}
                            onChange={(e) =>
                              setConfigDraft({
                                ...configDraft,
                                company: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          负责人名单
                          <textarea
                            rows={4}
                            value={configDraft.owners.join("\n")}
                            onChange={(e) =>
                              setConfigDraft({
                                ...configDraft,
                                owners: e.target.value.split("\n"),
                              })
                            }
                          />
                          <small>
                            每行一名；用于项目分工标签。修改名单不会改写已有项目。
                          </small>
                        </label>
                        <label className="field">
                          长期未更新提醒
                          <input
                            type="number"
                            min={1}
                            max={90}
                            required
                            value={configDraft.staleDays}
                            onChange={(e) =>
                              setConfigDraft({
                                ...configDraft,
                                staleDays: Number(e.target.value),
                              })
                            }
                          />
                          <small>
                            项目连续多少天没有更新，进入关注范围。默认 7 天。
                          </small>
                        </label>
                        <button
                          className="button primary"
                          disabled={busy}
                          type="submit"
                        >
                          <Check size={16} />
                          {busy ? "正在保存…" : "保存设置"}
                        </button>
                      </form>
                    </section>
                    <div>
                      <section className="panel setup-note">
                        <ShieldCheck size={24} />
                        <h3>账号与岗位协作</h3>
                        <p>
                          请在“人员管理”登记姓名、本人登录邮箱和岗位，并设置初始密码。
                        </p>
                        <p>
                          成员用邮箱或手机号登录后自动进入对应首页；销售项目、财务票款与部门协作共享同一份记录。
                        </p>
                      </section>
                      <section className="panel setup-note">
                        <Activity size={24} />
                        <h3>跟进规则</h3>
                        <ul>
                          <li>
                            进行中的项目必须有负责人、下一步行动和跟进日期。
                          </li>
                          <li>跟进逾期自动标红；长期无更新自动提示。</li>
                          <li>项目暂停、丢单或结项后，不再计入待办。</li>
                          <li>项目修改与跟进结果进入过程时间线。</li>
                        </ul>
                      </section>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {selected && !form && !taskModal && (
        <div
          className="drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <aside
            ref={drawerRef}
            tabIndex={-1}
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-detail-title"
          >
            <div className="drawer-top">
              <span>
                <BriefcaseBusiness size={16} />
                项目详情
              </span>
              <button
                className="icon-button"
                onClick={() => setDetail(null)}
                aria-label="关闭项目详情"
              >
                <X size={20} />
              </button>
            </div>
            <div className="detail-title">
              <div>
                <Badge tone="green">{statusOf(selected)}</Badge>
                {demo && <Badge>演示项目</Badge>}
              </div>
              <h2
                id="project-detail-title"
                tabIndex={-1}
                data-modal-initial-focus
              >
                {selected.name}
              </h2>
              <p>
                <MapPin size={14} />
                {selected.location || "地区未填写"}
                <span>·</span>
                {selected.type}
              </p>
              <div className="detail-actions">
                {canCreateProject(viewMember) && (
                  <button
                    className="button"
                    onClick={() => {
                      setGroupRequest({
                        projectId: selected.id,
                        nonce: Date.now(),
                      });
                      setDetail(null);
                      navigate("messages");
                    }}
                  >
                    <MessagesSquare size={16} />
                    创建项目群
                  </button>
                )}
                {canEditProject(selected, viewMember) && (
                  <>
                    <button
                      className="button primary"
                      onClick={() => openForm(selected, "followup")}
                    >
                      <Plus size={16} />
                      记录跟进
                    </button>
                    <button
                      className="button"
                      onClick={() => openForm(selected, "edit")}
                    >
                      <Pencil size={15} />
                      编辑项目
                    </button>
                    <button className="button" onClick={()=>setDetailTab("状态与原因")}>修改状态</button>
                  </>
                )}
              </div>
            </div>
            <div className="detail-metrics">
              <div>
                <span>项目负责人</span>
                <strong>
                  {selected.owner}
                </strong>
              </div>
              <div>
                <span>预计机会金额</span>
                <strong>¥ {fmt(selected.amount)} 万</strong>
              </div>
              <div>
                <span>跟进状态</span>
                <Badge tone={risk(selected, config.staleDays).tone}>
                  {risk(selected, config.staleDays).text}
                </Badge>
              </div>
            </div>
            {isActive(selected) && (
              <div className="next-action-box">
                <div>
                  <CalendarDays size={17} />
                  <strong>下次联系</strong>
                  <b>{selected.nextDate || "待安排跟进"}</b>
                </div>
                <p>{selected.nextAction || "记录一次跟进，留下最新进展"}</p>
              </div>
            )}
            <section className="followup-summary" aria-label="最近真实跟进">
              <strong>最近跟进：{selected.lastFollowupAt ? stamp(selected.lastFollowupAt) : "暂无跟进记录"}</strong>
              <p>{selected.latestFollowupContent || "项目资料编辑不会计为跟进。联系客户后，用几句话记录进展。"}</p>
            </section>
            <div className="detail-tabs" role="group" aria-label="项目详情内容">
              {[
                "协作动态",
                "状态与原因",
                "阶段推进",
                "产品机会",
                ...(mayViewBook(selected,viewMember) ? ["合同与票款"] : []),
                "商务与交付",
                "项目信息",
              ].map((t) => (
                <button
                  key={t}
                  aria-pressed={detailTab === t}
                  className={detailTab === t ? "active" : ""}
                  onClick={() => setDetailTab(t)}
                >
                  {t}
                  {t === "产品机会" && (
                    <span>{selected.opportunities.length}</span>
                  )}
                </button>
              ))}
            </div>
            {error && (
              <div className="drawer-error error-box" role="alert">
                {error}
              </div>
            )}
            <div
              className={
                "detail-content " +
                (detailTab === "阶段推进" ? "workflow-detail-content" : "")
              }
            >
              {detailTab === "状态与原因" && <ProjectOutcomes project={selected} member={viewMember} request={workspaceFetch} demo={demo} onChanged={(p,e)=>{setProjects(ps=>ps.map(x=>x.id===p.id?p:x));setEvents(es=>[e,...es]);setNotice("状态与原因已保存");}} />}
              {detailTab === "阶段推进" && (
                <StageWorkspace
                  key={selected.id}
                  project={selected}
                  config={config}
                  busy={busy}
                  member={viewMember}
                  members={members}
                  onSave={(w, message, expectedVersion) =>
                    saveWorkflow(
                      expectedVersion === undefined
                        ? selected
                        : { ...selected, version: expectedVersion },
                      w,
                      message,
                    )
                  }
                  onTask={(task) => openTask(selected, task)}
                />
              )}
              {detailTab === "商务与交付" && (
                <ProjectBusiness
                  key={selected.id}
                  project={selected}
                  member={viewMember}
                  busy={busy}
                  onSave={(p) =>
                    saveWorkflow(
                      p,
                      workflowOf(p),
                      "更新商务报价、合同条款与交付档案",
                    )
                  }
                />
              )}
              {detailTab === "合同与票款" && mayViewBook(selected,viewMember) && (
                <>
                  <ProjectFinance
                    member={viewMember}
                    project={selected}
                    book={finances[selected.id] || emptyBook(selected.id)}
                    busy={busy}
                    onAction={financeAction}
                  />
                  <FinanceOperationsPanel
                    member={viewMember}
                    members={members}
                    project={selected}
                    book={finances[selected.id] || emptyBook(selected.id)}
                    busy={busy}
                    onAction={financeAction}
                  />
                </>
              )}{" "}
              {detailTab === "协作动态" && (
                <div className="timeline">
                  {events
                    .filter((e) => e.projectId === selected.id)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((e) => (
                      <div className="timeline-item" key={e.id}>
                        <span className="timeline-dot">
                          {e.kind === "跟进记录" ? (
                            <FileText size={13} />
                          ) : (
                            <Activity size={13} />
                          )}
                        </span>
                        <div className="timeline-heading">
                          <strong>{e.kind}</strong>
                          <time>{stamp(e.createdAt)}</time>
                        </div>
                        <div className="timeline-actor">{e.actor}</div>
                        {e.note && <p>{e.note}</p>}
                        {e.kind === "跟进记录" && e.nextFollowupDate !== undefined && <p className="muted">当次安排：{e.nextFollowupDate || "未设置下次跟进日期"}</p>}
                        {e.changes.length > 0 && (
                          <ul>
                            {e.changes.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                </div>
              )}
              {detailTab === "产品机会" && (
                <>
                  <p className="helper-text">
                    上图、上标书与厂家报备分别跟踪，避免进展混淆。
                  </p>
                  {selected.opportunities.map((o) => {
                    const p = config.products.find((x) => x.id === o.productId);
                    return (
                      <div className="opportunity-card" key={o.id}>
                        <small>{p?.brand || "产品信息待补充"}</small>
                        <h3>{p?.name || "未命名产品"}</h3>
                        <p>{p?.area}</p>
                        <div className="opportunity-status">
                          <span>
                            设计上图
                            <Badge
                              tone={o.drawing === "已完成" ? "green" : "gray"}
                            >
                              {o.drawing}
                            </Badge>
                          </span>
                          <span>
                            品牌上标书
                            <Badge
                              tone={o.tender === "已完成" ? "green" : "gray"}
                            >
                              {o.tender}
                            </Badge>
                          </span>
                          <span>
                            厂家报备
                            <Badge
                              tone={
                                o.filing === "已确认"
                                  ? "green"
                                  : o.filing === "未通过"
                                    ? "red"
                                    : "gray"
                              }
                            >
                              {o.filing}
                            </Badge>
                          </span>
                        </div>
                        <div className="filing-metadata">
                          <span>最近报备：{o.filingDate || "待补录"}</span>
                          <span>厂家对接：{o.filingContact || "待补充"}</span>
                          <span>报备依据：{o.filingReference || "待补充"}</span>
                        </div>
                        {o.note && <p className="op-note">{o.note}</p>}
                      </div>
                    );
                  })}
                  {!selected.opportunities.length && (
                    <Empty
                      title="还没有关联产品"
                      description="编辑项目，选择本项目适合的产品。"
                    />
                  )}
                  {canEditProject(selected, viewMember) && (
                    <button
                      className="button"
                      onClick={() => openForm(selected, "edit")}
                    >
                      <Pencil size={15} />
                      编辑产品机会
                    </button>
                  )}
                </>
              )}
              {detailTab === "项目信息" && (
                <>
                  <dl className="info-list">
                    {[
                      ["项目来源", selected.source],
                      ["业主单位", selected.customer],
                      ["设计院", selected.designer],
                      ["中标 / 采购单位", selected.contractor],
                      ["联系人", selected.contact],
                      ["联系电话", selected.phone],
                      ["项目备注", selected.notes],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v || "待补充"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="info-note">
                    部门分工、阶段检查与交接在“阶段推进”中维护。文件可先在记录中填写受控存放位置或链接；当前未提供附件上传。
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      {creatingTask && (
        <TaskEditor
          member={viewMember}
          members={members}
          projects={scopeProjects}
          error={taskCreateError}
          busy={taskCreateBusy}
          close={() => !taskCreateBusy && setCreatingTask(false)}
          save={createStandaloneTask}
        />
      )}
      {form && (
        <Modal
          title={
            form === "create"
              ? "新建项目"
              : form === "followup"
                ? "记录本次跟进"
                : "编辑项目"
          }
          subtitle={
            demo
              ? "演示模式：操作不会写入正式工作区"
              : form === "followup"
                ? draft.name
                : "只填写项目名称即可保存，其他资料以后再补充。"
          }
          close={() => {
            if (!busy) {
              setForm(null);
              setError("");
            }
          }}
          wide={form === "edit"}
        >
          <form onSubmit={saveProject} className="project-form">
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            {form === "followup" ? (
              <>
                <label className="field">本次跟进内容 <em>*</em>
                  <textarea autoFocus required maxLength={4000} rows={5} placeholder="记下这次联系的进展，简单几句话就可以。" value={note} onChange={e=>setNote(e.target.value)} />
                </label>
                <label className="field">下次跟进日期（选填）
                  <input type="date" value={draft.nextDate} onChange={e=>setDraft({...draft,nextDate:e.target.value})} aria-describedby="followup-date-help" />
                </label>
                <p id="followup-date-help" className="muted">暂不确定可以留空，保存后标记为“待安排跟进”，此前记录仍保留。</p>
              </>
            ) : (
              <>
<label className="field span2">
                    项目名称 <em>*</em>
                    <input
                      autoFocus required
                      maxLength={100}
                      placeholder="例如：苏州某智能制造基地二期"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                <p className="muted">负责人：{draft.owner || member.name}。先保存项目，资料可以随时补充。</p>
                <details className="project-supplement">
                  <summary>补充资料（选填）</summary>
                  <div className="form-grid">

                  <label className="field">
                    区域 / 地址
                    <input
                      placeholder="城市 · 区域"
                      value={draft.location}
                      onChange={(e) =>
                        setDraft({ ...draft, location: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    项目类型
                    <select
                      value={draft.type}
                      onChange={(e) =>
                        setDraft({ ...draft, type: e.target.value })
                      }
                    >
                      <option value="">暂不填写</option>
                      {TYPES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    线索来源
                    <select
                      value={draft.source}
                      onChange={(e) =>
                        setDraft({ ...draft, source: e.target.value })
                      }
                    >
                      <option value="">暂不填写</option>
                      {SOURCES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    预计机会金额（万元）
                    <input
                      type="number"
                      min="0"
                      max="10000000"
                      step="0.01"
                      value={draft.amount}
                      onChange={(e) =>
                        setDraft({ ...draft, amount: Number(e.target.value) })
                      }
                    />
                  </label>
{isManager(viewMember) && (                  <label className="field">
                    项目负责人 <em>*</em>
                    <select
                      required
                      disabled={!isManager(viewMember)}
                      value={draft.ownerMemberId || ""}
                      onChange={(e) => {
                        const m = members.find((m) => m.id === e.target.value);
                        setDraft({
                          ...draft,
                          ownerMemberId: m?.id,
                          owner: m?.name || draft.owner,
                        });
                      }}
                    >
                      {!draft.ownerMemberId && (
                        <option value="">{draft.owner}（待绑定账号）</option>
                      )}
                      {members
                        .filter(
                          (m) =>
                            m.status === "active" &&
                            (hasDesk(m, "sales") || hasDesk(m, "management")),
                        )
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} · {roleInfo(m.role).name}
                          </option>
                        ))}
                    </select>
                  </label>)}
                  <label className="field">
                    业主单位
                    <input
                      value={draft.customer}
                      onChange={(e) =>
                        setDraft({ ...draft, customer: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    设计院
                    <input
                      value={draft.designer}
                      onChange={(e) =>
                        setDraft({ ...draft, designer: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    中标 / 采购单位
                    <input
                      value={draft.contractor}
                      onChange={(e) =>
                        setDraft({ ...draft, contractor: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    联系人
                    <input
                      value={draft.contact}
                      onChange={(e) =>
                        setDraft({ ...draft, contact: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    联系电话
                    <input
                      type="tel"
                      value={draft.phone}
                      onChange={(e) =>
                        setDraft({ ...draft, phone: e.target.value })
                      }
                    />
                  </label>
                </div>
                <h3 className="form-section-title">
                  产品机会 <span>可关联多项产品</span>
                </h3>
                <div className="product-selector">
                  {config.products.map((p) => (
                    <label key={p.id}>
                      <input
                        type="checkbox"
                        checked={draft.opportunities.some(
                          (o) => o.productId === p.id,
                        )}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            opportunities: e.target.checked
                              ? [
                                  ...draft.opportunities,
                                  {
                                    id: crypto.randomUUID(),
                                    productId: p.id,
                                    drawing: "未开始",
                                    tender: "未开始",
                                    filing: "未报备",
                                    note: "",
                                  },
                                ]
                              : draft.opportunities.filter(
                                  (o) => o.productId !== p.id,
                                ),
                          })
                        }
                      />
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.brand} · {p.area}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                {draft.opportunities.map((o, i) => (
                  <div className="opportunity-editor" key={o.id}>
                    <strong>
                      {config.products.find((p) => p.id === o.productId)?.name}
                    </strong>
                    <div className="form-grid three">
                      {(["drawing", "tender", "filing"] as const).map(
                        (k, j) => (
                          <label className="field" key={k}>
                            {["设计上图", "品牌上标书", "厂家报备"][j]}
                            <select
                              value={o[k]}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  opportunities: draft.opportunities.map(
                                    (x, idx) =>
                                      idx === i
                                        ? { ...x, [k]: e.target.value }
                                        : x,
                                  ),
                                })
                              }
                            >
                              {(k === "filing"
                                ? ["未报备", "已提交", "已确认", "未通过"]
                                : ["未开始", "推进中", "已完成"]
                              ).map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </label>
                        ),
                      )}
                    </div>
                    <div className="form-grid three filing-editor">
                      <label className="field">
                        最近报备 / 更新日期
                        <input
                          type="date"
                          max={today()}
                          value={o.filingDate || ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              opportunities: draft.opportunities.map(
                                (x, idx) =>
                                  idx === i
                                    ? { ...x, filingDate: e.target.value }
                                    : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        厂家对接人
                        <input
                          maxLength={2000}
                          value={o.filingContact || ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              opportunities: draft.opportunities.map(
                                (x, idx) =>
                                  idx === i
                                    ? { ...x, filingContact: e.target.value }
                                    : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        报备编号 / 反馈依据
                        <input
                          maxLength={2000}
                          value={o.filingReference || ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              opportunities: draft.opportunities.map(
                                (x, idx) =>
                                  idx === i
                                    ? { ...x, filingReference: e.target.value }
                                    : x,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <input
                      aria-label="产品机会说明"
                      placeholder="填写厂家反馈、图纸或标书版本、产品机会说明"
                      value={o.note}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          opportunities: draft.opportunities.map((x, idx) =>
                            idx === i ? { ...x, note: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                ))}            <div className="form-grid">
              <label className="field">
                详细工程阶段（选填）
                <select
                  value={draft.stage}
                  onChange={(e) =>
                    setDraft({ ...draft, stage: e.target.value })
                  }
                >
                  {STAGES.filter(s=>!["已暂停","已丢单","已结项"].includes(s)||s===draft.stage).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                下次跟进日期（选填）
                <input
                  type="date"

                  value={draft.nextDate}
                  onChange={(e) =>
                    setDraft({ ...draft, nextDate: e.target.value })
                  }
                />
              </label>
              <label className="field span2">
                下一步行动（选填）
                <input

                  maxLength={2000}
                  placeholder="明确要做什么，例如：周五与设计师确认保温参数"
                  value={draft.nextAction}
                  onChange={(e) =>
                    setDraft({ ...draft, nextAction: e.target.value })
                  }
                />
              </label>
              {(
                <label className="field span2">
                  项目备注
                  <textarea
                    maxLength={2000}
                    rows={3}
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft({ ...draft, notes: e.target.value })
                    }
                  />
                </label>
              )}
            </div>

                </details>
              </>
            )}
            <div className="form-actions">
              <span>
                {demo
                  ? "演示修改仅在本次浏览中生效"
                  : "保存后同步更新项目时间线"}
              </span>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setForm(null);
                  setError("");
                }}
              >
                取消
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                {busy
                  ? "正在保存…"
                  : form === "followup"
                    ? "保存跟进结果"
                    : "保存项目"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {productEdit && (
        <Modal
          title={productEdit.id ? "编辑产品" : "新增产品"}
          subtitle="维护品牌、专业分类和应用场景。"
          close={() => {
            if (!busy) {
              setProductEdit(null);
              setError("");
            }
          }}
        >
          <form
            className="project-form"
            onSubmit={(e) => {
              e.preventDefault();
              const p = {
                ...productEdit,
                id: productEdit.id || crypto.randomUUID(),
              };
              saveConfig({
                ...config,
                products: productEdit.id
                  ? config.products.map((x) => (x.id === p.id ? p : x))
                  : [...config.products, p],
              });
            }}
          >
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            {(["brand", "name", "category", "area"] as const).map((k, i) => (
              <label className="field" key={k}>
                {["品牌系列", "产品名称", "专业分类", "产品使用区域"][i]}
                <input
                  required
                  maxLength={500}
                  value={productEdit[k]}
                  onChange={(e) =>
                    setProductEdit({ ...productEdit, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            <div className="form-actions">
              <button
                type="button"
                className="button"
                onClick={() => setProductEdit(null)}
              >
                取消
              </button>
              <button className="button primary" disabled={busy}>
                保存产品
              </button>
            </div>
          </form>
        </Modal>
      )}
      {taskModal && projects.find((p) => p.id === taskModal.projectId) && (
        <Modal
          title={taskModal.task ? "处理协作与反馈" : "新增部门协作"}
          subtitle="登记承办人、期限与交接结果，项目主跟持续跟踪。"
          close={() => {
            if (!busy) {
              setTaskModal(null);
              setError("");
            }
          }}
        >
          <CollaborationEditor
            member={viewMember}
            members={members}
            project={projects.find((p) => p.id === taskModal.projectId)!}
            task={taskModal.task}
            onSubmit={saveTask}
            onCancel={() => {
              setTaskModal(null);
              setError("");
            }}
            busy={busy}
            error={error}
          />
        </Modal>
      )}
      {filingProject && (
        <FilingEditor
          project={filingProject}
          config={config}
          busy={busy}
          close={() => setFilingProject(null)}
          onSave={async (opportunities) => {
            if (demo) {
              setProjects((ps) =>
                ps.map((p) =>
                  p.id === filingProject.id ? { ...p, opportunities } : p,
                ),
              );
              setNotice("演示报备已更新");
              return true;
            }
            setBusy(true);
            try {
              const r = await workspaceFetch("/api/workspace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "filing",
                  id: filingProject.id,
                  version: filingProject.version,
                  data: { ...filingProject, opportunities },
                  note: "项目管理更新厂家报备日期与判定反馈",
                }),
              });
              const b = (await r.json()) as {
                error?: string;
                project: Project;
                event: Event;
              };
              if (!r.ok) throw Error(b.error);
              setProjects((ps) =>
                ps.map((p) => (p.id === b.project.id ? b.project : p)),
              );
              setEvents((es) => [b.event, ...es]);
              setNotice("厂家报备已更新");
              return true;
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {notificationsOpen && (
        <div
          ref={notificationRef}
          id="workspace-notifications"
          className="notification-panel"
          role="region"
          aria-labelledby="notifications-title"
        >
          <div>
            <h3 id="notifications-title">岗位消息</h3>
            <button
              className="icon-button"
              aria-label="关闭岗位消息"
              onClick={() => {
                setNotificationsOpen(false);
                notificationToggleRef.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          </div>
          {notifications.length ? (
            notifications.map((n) => (
              <button
                key={n.id}
                className={n.readAt ? "read" : ""}
                onClick={() => {
                  const p = projects.find((p) => p.id === n.projectId);
                  if (p) openProject(p);
                  setNotificationsOpen(false);
                }}
              >
                <Bell size={14} />
                <span>
                  {n.message}
                  <small>{stamp(n.createdAt)}</small>
                </span>
              </button>
            ))
          ) : (
            <p>暂无消息。协作分配和票款处理结果会显示在这里。</p>
          )}
          <button className="text-button" onClick={markNotifications}>
            全部标为已读
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}
