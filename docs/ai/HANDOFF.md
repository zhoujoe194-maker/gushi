# 快速交接

## 当前版本
2026-11-12，分支 `codex/gushios-v2`，D1-RECTIFY 已完成并提交等待 Codex 验收。基线 `aa921d1`；代码提交 `16de17e8e25e623e0f5fabe2395b071731ad3f8a`；测试提交 `398699952a432da88c767f9f9433d7189fd9ac38`；浏览器断言补充 `f0cf06fc2b6d6e7baa952b85f3a7208d5c9cc63f`；文档提交用 `git log -1 --format=%H -- docs/ai/HANDOFF.md` 查询。未推送、未部署、未合并 main。

## 本次任务与结论（D1-RECTIFY）
用户批准整改并最终由 Codex 验收。本任务**取代**旧 D1“五粒度授权作为管理台内部岗位范围切换、保留五类 scope”的方案，不只是隐藏导航：

- 系统只有 sales / management / finance 三个工作台。operations/aftersales 不再是工作台、默认台或可切换的内部岗位范围，只作为真实专业岗位/业务能力保留在管理工作台。
- 进入工作台**不改变真实角色**（`inPortal` 不再改写 role）。管理权限只来自真实专业岗位（owner/management/general/director/branch_manager），且仅 owner 可授予/取消；旧 operations/aftersales 授权不会映射成 manager，不会获得公司项目、人员管理、工资成本或现金权限。
- 人员管理重写：三个工作台授权 + 独立专业岗位 + 管理台任务协作能力；支持转岗/降权，`member_audit` 记录 role/desks/portals/defaultDesk 前后值。
- owner 在管理工作台财务只读（收款/核销/合同审核等 403）；实际财务写必须进入已授权的 finance 工作台。
- 旧账号、`members.desks`、`default_desk`、项目、任务、会议、消息、合同财务**原值保留**，不做数据迁移/回写；读取时把 operations/aftersales 默认台映射到 management。历史任务与台间/私聊消息按原持久授权等价可读，不合并为全员管理群。
- 旧 `/work/operations|aftersales|<旧岗位>` 安全跳到三个工作台；`?scope=` 被清洗；`X-Workspace-Scope` 明确 403；旧 `X-Workspace-Desk` 只映射工作台、不提权。无任何 scope 选择器。
- 无 schema 变更、无 drizzle 新迁移；兼容通过读取适配完成（重复执行迁移幂等不提权有测试）。

## 本次实际验证（2026-11-12，构建后运行）
使用 `/private/tmp/node-d1`（Node 24，普通 PATH 无 node；支持 sharp）。先 tsc、再重新生产构建，再跑接口/浏览器；没有把旧构建结果当成本次证据。
- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `node scripts/selfhost-build.mjs`：通过。
- `RUN_LOCAL_TESTS=1 QA_BASE_PORT=5530 node tests/release-checks.mjs`：**739 通过**，独立临时 SQLite/端口；含 access 65、auth 53、business 112、task-images 46、commercial 40、messages 45、groups 54、sales 92、setup 40、deployment 51、d1-portals 113、d1-rectify 22、sales-migration 6。日志在 `/private/tmp/d1-rectify-release-final.log` 与 `work/release-checks/run-MVn5Cv/`。
- `RUN_LOCAL_TESTS=1 V2_QA_PORT=5273 node tests/v2-cashflow.mjs`：99 通过（原 D0 财务回归）。
- `node tests/cash-forecast-unit.mjs`：26 通过。
- 隔离浏览器：先 `node tests/d1-browser-setup.mjs`（5 项，模拟库只读复制到 `/private/tmp/gushi-d1-browser/company.sqlite`），再 `QA_PORT=5406 QA_SCREENSHOT_DIR=/private/tmp/gushi-d1-browser/screenshots node tests/d1-portals-browser.mjs`：**87 通过、0 失败、0 页面/脚本错误**（销售/运营/售后/管理/财务/多工作台入口、旧链接、无岗位范围切换、四档视口）。日志 `/private/tmp/d1-rectify-browser-final3.log`。
- 未运行/未宣称：v2-foundation、v2-lightweight、v2-outcomes 未单独重跑（release 覆盖相近流程但不等于同脚本）；真实员工/手机与财务对账未验收；未部署、未推送、未合并 main；未打开真实公司库。截图在 `/private/tmp/gushi-d1-browser/screenshots`，未提交。

## 供 Codex 复核的要点
设计/兼容说明、文件清单与验收证据见本文件及 `D1_REVIEW.md`、`DECISIONS.md` 第9条、`DEVELOPMENT_STATUS.md`。重点检查：`app/team.ts`（真实角色鉴权、canFinance 工作台边界）、`app/access.ts`、`app/server/auth.ts`（scope 拒绝/旧 desk 仅映射）、`app/api/team/route.ts`（专业岗位与 owner-only 管理授权、审计）、`app/members-panel.tsx`、`app/work/[role]/page.tsx`、`app/workspace.tsx`、`app/message-model.ts`/`message-access.ts`、`app/task-model.ts`。测试 diff 中所有断言调整均为适配“无 scope 切换+真实角色”后的更强边界，没有放宽隔离断言；如认为某项应是 403 而非 404，请指出。

## 本机模拟试用（不对外公开密码）
只使用一次性/模拟副本，不写源模拟库：

```sh
# 1) 从阶段C模拟导出只读复制并迁移（生成 /private/tmp/gushi-d1-browser/company.sqlite 与 0600 账号清单）
/private/tmp/node-d1 tests/d1-browser-setup.mjs
# 2) 启动本机模拟服务（地址 http://127.0.0.1:5501）
DATABASE_PATH=/private/tmp/gushi-d1-browser/company.sqlite APP_ORIGIN=http://127.0.0.1:5501 \
APP_BUILD_DIR=.next-production NODE_ENV=production \
/private/tmp/node-d1 node_modules/next/dist/bin/next start -p 5501
```

账号邮箱见 `/private/tmp/gushi-d1-browser/accounts.json`；测试密码在同一个 0600 权限的临时文件内，仅本机使用，不写入仓库、聊天或外部文档。源码模拟库 `outputs/gushios-v2-phase3c/trial-before.sqlite` 只读不修改。

## 下一步
Codex 复核 diff 与上述证据 → 决定验收/推送并打开页面（用户指定 Codex 负责推送）。D2/D3、企业微信、知识库、AI Agent 未授权，不自动开工；不自动部署或合并 main。

## Codex验收与体验入口（2026-11-12）
Codex独立复核权限/人员授权/历史消息兼容，并复跑TypeScript、release 739项与浏览器87项，均通过；真实员工验收仍待用户。DSH完成生产构建及财务99/计算26项。新本机服务为 http://127.0.0.1:5561（5501已占用），使用隔离模拟库。运行时无scope切换，旧DESK字符串仅为历史授权与协作能力兼容，不代表五个工作台。用户已批准推送V2分支，不合并main不部署；实际远端SHA以推送后核验为准。
