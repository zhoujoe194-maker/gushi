# 实际架构导航

核验基线见 DEVELOPMENT_STATUS.md。按任务阅读，不要求每次全库扫描。

| 层 | 文件与职责 |
|---|---|
| 入口与页面 | app/work/[role]/page.tsx、app/workspaces/、app/login/；workspace.tsx 组织项目详情和导航；role-dashboard.tsx、role-panels.tsx 首页 |
| 项目 | model.ts、server/projects.ts、server/validation.ts；server/followups.ts、server/outcomes.ts；api/workspace、api/outcomes |
| 权限 | team.ts 定义角色/五类范围/三入口；access.ts 派生授权；server/auth.ts 校验会话及请求范围；server/page-context.ts 页面上下文 |
| 财务 | finance-model.ts、finance-operations.ts；cash-model.ts 投影与金额；cash-forecast.ts 预测；server/cash*.ts 修改与存储；api/finance、api/cashflow |
| 协作 | task-center.tsx、message-center.tsx、sales/center.tsx；api/tasks、messages、meetings、sales；server/message-access.ts、resource-access.ts |
| 组件 | cash-panels.tsx 项目收支；company-expenses.tsx 公司费用；cash-dashboard.tsx 现金预测；globals.css 响应式 |

## 数据及运行时
自托管由 scripts/selfhost-*.mjs、runtime/sqlite.mjs 及 Node 环境适配支撑，DATABASE_PATH 指定 SQLite 文件。db/index.ts 保留 Cloudflare D1/Drizzle 入口，不能误认为自托管直接连接云数据库。db/schema.ts 声明结构，drizzle/ SQL 为迁移依据；当前交付报告记载14个迁移，D0/D1无新 schema。
成员稳定 ID 连接项目负责人及历史操作人；项目跟进、结果和转交历史保留。任务及群聊关联项目时执行项目访问检查。finance_books 以项目 ID 存合同、计划、实际收付等 JSON 及 version；finance_company 保存公司计划，finance_mutations 保存请求摘要及前后审计；finance_project_grants 提供报销窄授权。银行核销连接多项目/费用计划；凭证下载重新校验权限，不因知道 URL 即开放。

## 权限与一致性
登录会话由 server/auth.ts 解析。X-Workspace-Portal 与 X-Workspace-Scope 必须在真实授权中；兼容 X-Workspace-Desk 并固定原范围，不能通过请求头提权。入口合并不改变角色身份。销售财务响应是显式字段投影；公司工资、采购成本、现金不向销售开放。
CashStore 保存时校验成员、项目、台账和公司版本及窄授权，条件插入 mutation 后批量写入；失败返回409。requestId 与请求 hash、银行编号及核销约束防重复；跨项目分摊使用批处理事务。审计保留 before/after，冲销保留原支付。不要另建现金账本或把银行流水与计划实付重复累计。
构建和隔离测试见 TESTING.md；接口与 UI 的同名指标必须复用原模型口径。
