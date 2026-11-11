# GushiOS V2 阶段 D1：三工作台入口与操作体验整合

> **历史文档（已被取代）**：2026-11-12 用户批准 **D1-RECTIFY**，取消 D1 中“五个粒度授权作为管理台内部岗位范围切换、保留五类 scope”的设计。现行方案只有 sales/management/finance 三个工作台，operations/aftersales 仅作为专业岗位能力保留，无默认台与 scope 切换；旧 `members.desks`/`default_desk` 原值保留并由读取适配映射。本文保留为历史记录，与现行实现冲突处以 `docs/ai/DECISIONS.md` 第 9 条和 `docs/ai/D1_REVIEW.md` 的 D1-RECTIFY 处理结果为准。

## 范围与基线

- 基线：`codex/gushios-v2` 的 `0d4bf7b6dc46fef506a78de964f99ee581e36e3e`（阶段 D0）。开始工作时工作区干净，只在本分支直接实施并提交一个独立 D1 commit。
- 未进入 D2（新任务闭环）、未做 D3 上线部署、未接入 AI Agent、未合并 main、未推送、未部署生产。
- 不使用真实业务数据。接口/浏览器测试全部使用一次性临时 SQLite 或既有**模拟数据**导出的只读副本：
  - 接口测试：`/private/tmp/gushi-*`、系统临时目录内自动创建的一次性数据库。
  - 浏览器与旧账号兼容验证：把 `outputs/gushios-v2-phase3c/trial-before.sqlite`（阶段 C 模拟库）只读复制到 `/private/tmp/gushi-d1-browser/company.sqlite`，在副本上迁移并写入测试专用密码；源库从未被写入。
  - 未打开、未修改真实公司库，未改任何既有账号密码。
- 环境说明（非产品改动）：本机自带的 Node 24 运行库带硬化签名，无法加载 npm 安装的 sharp 原生模块；验收时使用同一 Node 的 ad-hoc 签名副本 `/private/tmp/node-d1`。测试说明中已固定该前置条件。

## 新三工作台结构与角色权限映射

D1 只改「主入口和导航」，不改岗位与权限的实际含义：

- **Portal（3 个主入口）**：`sales` 销售工作台、`management` 管理工作台、`finance` 财务工作台。用户只能进入被授权的工作台。
- **Desk（5 个粒度授权，保留）**：`sales / management / operations / aftersales / finance`。`DESK_IDS`、`members.desks`、`desk_tasks.desk`、消息工作台键、会议行动项、流程部门仍按 5 个粒度保存和判定。**没有通过删除 `DESK_IDS` 值来实现合并。**
- **Role（15 个岗位身份，保留）**：`owner/management/general/director/branch_manager/sales/finance/operations/aftersales/technical/marketing/project/logistics/assistant/hr` 身份不变；技术、市场、项目、物流、助理、人事仍映射到运营岗范围。

工作台入口与粒度范围的映射：

| 主工作台 | 包含的粒度范围 | 典型岗位 | 首页与主要导航 | 数据与操作边界 |
|---|---|---|---|---|
| 销售工作台 `sales` | 销售 `sales` | sales；owner 等兼岗时按销售范围 | 销售工作台首页（今日跟进/逾期/待补合同/协作任务）+ 项目协同、任务下发与跟进、合同与票款、我的项目结果、厂家报备、阶段看板、销售考核、消息中心 | 仅本人负责项目；本人项目合同/报价/回款提交；不返回成本、供应商、财务内部备注；不能进入管理或财务工作台 |
| 管理工作台 `management` | 管理 `management`、运营 `operations`、售后 `aftersales` | 管理岗：management/owner/general/director/branch_manager；运营岗：operations/technical/marketing/project/logistics/assistant/hr；售后岗：aftersales | 管理岗：经营总览（公司经营概览、员工结果与复查、派单与督办、暂停复查、运营/售后协作负载、人员管理、周会与任务、合同与票款只读、现金流只读）；运营/售后岗：运营/售后首页、本台任务、消息中心、项目报销、跟进指南、品牌与产品 | 管理岗按公司范围管理；运营/售后仍只处理本岗任务与协作，**不因入口合并获得管理、财务或项目数据权限** |
| 财务工作台 `finance` | 财务 `finance` | finance；owner 等兼岗时按财务范围 | 财务总览（合同审核队列、应收应付、现金流预测）+ 合同与票款、项目收支与现金流、工资和固定费用、项目报销、项目协同（只读）、本台任务 | 合同审核、实际收付、银行核销、工资费用、现金流预测与项目垫资分析；管理岗在管理工作台内对财务只读 |

粒度范围由账号原有的 `members.desks` 授权派生：`portalOfDesk()` 把管理/运营/售后归入管理工作台，销售归销售工作台，财务归财务工作台。管理工作台内如果账号同时拥有多个粒度范围（例如运营+售后），页面显示“岗位范围”切换，并通过 `?scope=` 与服务端 `X-Workspace-Scope` 双重校验；未授权范围一律 403。

### 权限关键实现

- `deskOf(role)` 仍返回岗位对应的**粒度范围**（技术/市场/项目/物流等仍为运营），不改为工作台。
- `grantedDesks()` 仍是唯一授权来源（兼容旧 `desks` 列、旧账号无该列时按岗位回退、owner 全范围）。
- 新增 `grantedPortals()`、`hasPortal()`、`scopesInPortal()`、`preferredScope()`、`defaultPortal()`、`inPortal()`；`inDesk()` 保留为 `inPortal(m, portalOfDesk(desk), desk)`，旧调用保持原有权限含义。
- `getContext()` 统一解析工作台：优先 `X-Workspace-Portal`，其次兼容旧 `X-Workspace-Desk`（旧粒度值映射到工作台并**钉住同一粒度范围**，旧页签/旧自动化权限不变），可选 `X-Workspace-Scope`。非法工作台、非法岗位范围、未授权范围全部 403；不在任何接口中回退到默认工作台。
- **只有明确授予 management 粒度范围**的账号，才在管理工作台内获得管理岗权限；仅有 operations/aftersales 的账号 `role` 仍为运营/售后，`isManager()` 为 false，`canReadProject()`/`canViewFinance()`/`canFinance()` 保持原边界。财务工作台只有具备 finance 粒度授权的账号才能执行实际收付。
- 任务、会议、消息、流程协作仍按粒度岗位判定，管理岗入口不扩大任何人的项目、工资费用、采购成本或公司现金可见范围。

## 新旧工作台访问权限对照

| 场景 | D0（之前） | D1（现在） |
|---|---|---|
| 用户主入口 | 五个工作台：销售、管理、财务、运营、售后 | 三个工作台：销售、管理、财务 |
| 运营/售后员工 | 进入 `/work/operations`、`/work/aftersales` | 进入 `/work/management`，在管理工作台内以运营/售后岗位范围工作 |
| 单工作台账号登录 | 直接进入对应台 | 直接进入对应工作台 |
| 多工作台账号登录 | `/workspaces` 五张卡 | `/workspaces` 三张卡（仅显示已授权工作台，含岗位范围与默认工作台标记） |
| 旧链接 `/work/operations`、`/work/aftersales` | 各自工作台 | 308 跳转 `/work/management?scope=operations|aftersales` |
| 旧链接 `/work/<旧岗位>` | 重定向到岗位对应台 | 重定向到对应工作台（保留岗位范围） |
| 旧页面/自动化请求头 | `X-Workspace-Desk: <5 粒度>` | 新界面使用 `X-Workspace-Portal` + `X-Workspace-Scope`；旧请求头继续可用并保持原权限 |
| 工作台选择页/登录页 | 五台文案 | 三工作台文案；明确运营、售后在管理工作台内协作 |
| 账号与数据 | 既有账号、`desks` 授权、项目/任务/合同/回款/报销 | 无需重新注册；授权与历史数据沿用，无数据库结构变更 |
| 管理岗财务权限 | 管理台可读合同/现金流，不能实际收付 | 不变：管理工作台内财务只读；实际收付在财务工作台 |
| 运营/售后可见项目 | 项目主档不可读（V2 边界），可处理独立任务 | 不变：不因入口合并且读到项目；独立任务流程可正常办理 |
| 旧分部提示 | 登录页页脚、管理首页“授权分部”等 | 清理/修正为三个工作台与公司范围表述；旧 `region` 字段仅作历史数据显示，不再用于权限 |

## 页面与代码修改清单

权限核心：

- `app/team.ts`：新增 `PORTAL_IDS/Portal/PORTALS/portalInfo/PORTAL_OF_DESK/portalOfDesk/portalOfRole/SCOPES_IN_PORTAL`；`Member` 增加运行时 `portal/scope/scopes`；保留 5 个 `DESK_IDS` 与 15 个岗位。
- `app/access.ts`：工作台派生、岗位范围选择、入口地址、旧账号兼容、`inPortal()`；新增 `roleForScopes()` 供人员授权保存时保留技术/物流等专业岗位身份。
- `app/server/auth.ts`：`getContext` 三工作台 + 岗位范围解析、严格头校验、旧 `X-Workspace-Desk` 兼容；`Context.portal`；管理权限提示文案。
- `app/server/page-context.ts`：页面上下文接受工作台与岗位范围。
- `app/api/team/route.ts`：保存成员授权时保留既有专业岗位身份（仅在岗位范围不再覆盖时才回退），不再把默认工作台直接写成岗位；管理台文案更新。

入口、导航与页面：

- `app/work/[role]/page.tsx`：只渲染三个工作台；旧粒度/旧岗位路径 308 重定向并保留 `?scope=`；未授权页面回工作台选择页。
- `app/workspaces/page.tsx`、`app/workspaces/selector.tsx`：单工作台直达 / 多工作台三卡选择；展示岗位范围、默认工作台；三工作台说明。
- `app/entry.tsx`、`app/login/[role]/page.tsx`、`app/page.tsx`：登录首页三工作台文案与首次使用说明；旧登录链接兼容；旧分部页脚移除。
- `app/demo/page.tsx`、`app/demo-team.ts`：演示入口改为 `/demo?role=<工作台>&scope=<岗位范围>`，五个岗位身份仍可在三个工作台内演示。
- `app/workspace.tsx`：三工作台导航矩阵、三套首页、工作台/岗位范围切换、`X-Workspace-Portal/X-Workspace-Scope` 请求头；移除重复的岗位首页折叠块与旧分部筛选；管理岗首页保留公司经营概览/员工结果/暂停复查/运营售后协作入口；财务首页保留合同审核、项目收支、现金流、工资费用等既有 V2 功能；运营/售后首页不出现项目、财务、人员管理入口。
- `app/role-dashboard.tsx`、`app/role-panels.tsx`：按岗位范围的首页与公司经营概览；清理“五个台/授权分部”等失效提示；运营/售后不显示项目联动等无权模块。
- `app/task-center.tsx`、`app/sales/center.tsx`、`app/message-center.tsx`：请求头适配三工作台；承办台文案改为岗位/工作台表述。
- `app/members-panel.tsx`、`app/account/security/security.tsx`：人员授权按“销售/管理/财务”三个工作台分组保存 5 个粒度范围，管理工作台下可选择管理/运营/售后岗位范围；默认工作台按三工作台选择；已确认姓名页面展示开通的工作台。专业岗位（技术、物流等）在编辑授权后保留。
- `app/workflow-panels.tsx`：组织分工说明改为三个工作台 + 管理岗/运营岗/售后岗。
- `app/globals.css`：首页快捷入口在 701–1000px 换行、手机端恢复紧凑高度，修复 768px 横向溢出。

文档：

- `README.md`、`部署说明.md`、`deploy/上线验收与更新.md`：五个工作台/五台选择入口的过时说明改为三个工作台，并注明运营/售后在管理工作台内协作、旧区域字段仅历史数据。

数据库：

- **无 schema 迁移**。D1 不新增/修改表结构；旧 `members.desks`、`default_desk`、项目/任务/合同/财务数据原样继续使用。迁移检查在旧模拟库副本上执行，验证历史数据不变且重复迁移幂等。

## 自动化测试数量与结果

| 检查 | 命令（均使用 `/private/tmp/node-d1`，隔离数据库） | 结果 |
|---|---|---|
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | 通过，0 错误 |
| 生产构建 | `node scripts/selfhost-build.mjs` | 通过（`.next-production`，含 `/work/[role]`、`/workspaces`） |
| 部署/迁移/备份恢复 | `RUN_LOCAL_TESTS=1 QA_DEPLOY_PORT=5491 node tests/deployment-smoke.mjs` | 51 项通过，14 个迁移，在线备份恢复校验通过 |
| 旧库迁移审计 | `python3 scripts/v2-migration-audit.py <模拟库副本> <新临时副本>` | 24 张历史表、979 行历史数据逐行摘要不变；完整性 ok；二次迁移幂等 |
| V2 原业务回归 | `RUN_LOCAL_TESTS=1 node tests/v2-foundation.mjs / v2-lightweight.mjs / v2-outcomes.mjs / v2-cashflow.mjs / cash-forecast-unit.mjs` | 27 + 60 + 114 + 99 + 26 = 326 项通过 |
| D1 工作台权限接口套件（新增） | `RUN_LOCAL_TESTS=1 QA_D1_PORT=5220 node tests/d1-portals.mjs` | 97 项通过 |
| 全量 release 矩阵 | `RUN_LOCAL_TESTS=1 QA_BASE_PORT=5210 node tests/release-checks.mjs` | 695 项通过：access 60、auth 53、business 112、task-images 46、commercial 40、messages 45、groups 54、sales 91、setup 40、deployment 51、d1-portals 97、sales-migration 6 |
| 浏览器自动化（新增） | `node tests/d1-browser-setup.mjs`；`QA_PORT=5406 node tests/d1-portals-browser.mjs` | 83 项通过，0 失败，0 页面运行时错误 |
| 代码格式 | `git diff --check` | 通过 |

浏览器自动化覆盖：

- 三个主入口：`/work/sales`、`/work/management`、`/work/finance` 均可进入；多工作台账号在 `/workspaces` 看到三张卡并可直达。
- 旧入口：`/work/operations`、`/work/aftersales` 308 → `/work/management`。
- 销售：新建项目→保存→记录跟进“跟进已保存”；销售工作台无管理/财务专属入口。
- 运营/售后：登录落在管理工作台，导航只有首页/本台任务/消息中心/项目报销/跟进指南/品牌与产品；从本台任务完成“保存进展→处理中”和“提交验收→待验收”；页面不出现项目协同、合同票款、现金流、工资费用、人员管理。
- 管理：首页可见公司经营概览、员工结果、暂停复查、运营/售后协作负载；人员管理可打开。
- 财务：合同审核队列、项目收支、应收应付、现金流可进入；工资和固定费用可打开。
- 响应式：销售/管理/财务 × 360×740、390×844、768×1024、1440×1000 共 12 组，`scrollWidth == innerWidth` 全部通过，导航可切换且无横向溢出（修复前 768px 存在 903px 溢出，已修 CSS 后复测归零）。
- 浏览器零页面异常、零控制台运行时异常。

测试套件维护说明（均为**D1 之前**就存在的旧断言，不是 D1 回归）：

- `business/commercial/access/auth/messages/groups/sales/task-images/setup/deployment` 等套件里有 2026-10 旧规则，如“协作/分配即可读项目”“按分部隔离/派单”“承办台任意成员可办理未指派任务”。这些行为已在 `efbba60`（V2 项目访问边界）、`56ee50c`（轻量创建）及 C1/D0 财务改造中被有意收紧；本次按现行 V2 边界改为 404/空列表/公司范围断言，正例改用销售/管理/财务账号，未削弱任何安全断言。
- 未在 D1 修复的既有不一致：`canHandleTask` 允许认领未指派任务，但 `inTaskScope` 先要求 `assigneeId === 本人`，导致“未指派任务由同台成员认领”不可达（需 404）。这属于既有产品逻辑问题，已记录为后续任务，D1 不改变任务闭环行为。

证据目录：固始工作区 `outputs/gushios-v2-d1/`：`build.txt`、`deployment-smoke.txt`、`migration-audit.txt`、`release-checks-lead.txt`、`lead/`（V2 套件）、`browser-test-lead.txt`、`browser/`（22 张桌面/手机截图：三工作台各 4 个视口、销售建项目/跟进、运营/售后任务、管理首页/人员管理、财务首页/工资费用、工作台选择、旧入口跳转）。

## 尚未完成的功能与风险

- D1 只做入口、导航、权限适配和必要操作流程；**未开始 D2 任务闭环、D3 上线部署、AI Agent 集成**，也未合并 main 或部署。
- 运营/售后的“项目关联协作”仍遵守 V2 阶段一确定的边界：没有项目主档阅读权限时，项目关联任务与项目详情不展示；可以正常办理独立任务（本阶段已验证）。若后续要在项目详情内给运营/售后开放受限协作视图，需要 D2 重新设计任务/协作授权，不能靠入口合并放开项目权限。
- 厂家报备仍需要项目阅读权限，因此运营/售后在 D1 导航中不显示该入口（原先该入口对其为空列表，属死链接清理）；如要恢复，需要先定义独立的报备授权来源。
- 销售/管理导航不再单列“项目报销”，该功能仍可从项目详情“项目收支”完成，财务/运营/售后导航保留项目报销；如实际使用中销售需要固定入口，可在后续小版本恢复。
- 未指派任务认领的既有逻辑不一致（见上）未修复；建议列入 D2。
- 旧 `region`（分部）字段保留为历史数据并仍在部分页面显示，但不用于权限过滤；`branch_manager` 等历史岗位仍按公司范围管理。未做数据清理，避免改动历史记录。
- 浏览器自动化使用本机 Chrome（桌面/移动视口），不等同真实手机与员工现场验收；Playwright 安装在仓库外的 `/private/tmp/gushi-d1-pw`，未进入项目依赖，复跑需按测试说明安装。临时数据库脚本只写 `/private/tmp/gushi-d1-browser/`，有硬校验。
- 本机 Node 签名/ sharp 环境问题属验收环境限制，不是代码问题；部署环境按原 Dockerfile/自托管流程即可。
- 无数据库迁移，回滚 D1 = 回退本次 commit；旧账号、旧授权、旧数据继续有效。

## 最新 commit SHA

- 独立 D1 提交（实现 + 测试 + 本文件同批交付）：`0f764847698f921f4e99c52c4d3d5484445b8bda`。复核：`git show --stat 0f76484`；D0 基线为 `0d4bf7b6dc46fef506a78de964f99ee581e36e3e`。
- Git 提交无法在自身内容中硬编码自身 SHA，因此该值由紧随的「文档 SHA 补记」提交写入。补记提交只改本行，不含任何代码或测试变更；`git log --oneline -2` 可同时看到 D1 实现提交与补记提交。
