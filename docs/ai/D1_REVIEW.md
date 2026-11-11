# D1 独立审查（2026-11-12）

基线0db4c113e181e1b8281f44f1f1c6d7ea0b811f0b；审查D0到0f76484。用户授权Codex通过DSH Baton委派DeepSeek Harness审查。DSH默认deepseek-flash负责只读分析，Codex核对源码和运行测试。未修改业务代码，未部署、合并或推送。

## 结论与已确认发现
核心隔离回归通过，但有以下问题，不给予无条件验收通过。以下主要为源码确认，未逐项进行浏览器或漏洞请求复现。

- P2：app/members-panel.tsx:58、98、141、182 锁住已有成员当前岗位范围，管理转销售、销售转运营等不能在界面撤销原权限。服务端roleForScopes本可在旧范围移除后回退，但UI阻断。应允许明确转岗并保留审计，补降权回归。
- P2：app/access.ts:61 和 server/auth.ts:34-47 对无显式scope的管理入口优先management，忽略账号default_desk为operations/aftersales的默认范围。多授权账号无头请求与登录落地可能改变D0默认身份。这不是获得未授予的权限，但破坏默认范围兼容；应把无头默认范围钉住，入口带默认scope，补测试。
- P2边界待产品确认：app/team.ts:191 的canFinance允许owner。在管理入口owner仍能通过财务写权限判断，与“管理台只读”的无例外表述不符。此规则在D0已存在，不算D1新增漏洞。需明确owner是否也必须切财务入口才能写，并覆盖owner测试。
- P3：server/auth.ts:31 接受X-Workspace-Portal为operations/aftersales并映射，却不像旧desk头那样固定scope。多授权账号可能落入management；应对新portal头只允许三个Portal值，旧值留给legacy desk头。
- P3：api/team/route.ts:12-13 保存roleValue却没有在member_audit中记录前后role。新身份与defaultDesk解耦后，授权日志不足以还原专业岗位变更，建议补角色前后值。

## 对DSH结论的校正
DSH把默认范围问题标为P1，本审查按P2处理：management授权确实存在，不是无授权提权。DSH提出“旧测试修改可能破坏证据链”，不能据此断言测试造假或权限放宽。messages-integration从restricted占位改为消息过滤，符合api/messages/route.ts:96的SQL及二次filter；新构建全量695检查通过。其他历史断言变更未逐条在D0重新复现，仍是审计范围限制。
DSH工具的文件变化快照包含Codex同时执行的构建产物，不能归因为DSH修改源码；Git业务文件无改动。

## 本次实际验证
使用现有/private/tmp/node-d1（普通PATH无node），先tsc再重新构建，避免旧产物冒充当前代码。
- TypeScript无报错；selfhost-build成功。
- d1-portals：97通过，独立临时SQLite，端口5520。
- cash-forecast-unit：26通过。
- v2-cashflow：99通过，独立临时SQLite，端口5521。
- release-checks：695通过，端口基数5530；含D1 97及部署/备份51，不与单独套件重复累计。
- 本次未重跑浏览器、真实手机或员工验收，历史83项浏览器不能算本次结果。
日志：本机/tmp/gushi-review-{tsc,build,d1,math,cash,release}.log；release摘要位于work/release-checks/run-rsyCjL/summary.json（忽略目录，不提交测试数据库或账号）。

## 下一轮与协作约定
建议用户批准后让DSH在独立worktree定向修复并补上述用例，由Codex复核diff、权限与实际测试结果后集成；本次不自动修复。任务应包含基线、白名单、禁止项、验收测试和交接格式。Codex负责范围/冲突协调与最终判断，不能把DSH报告直接当验收。

## 2026-11-12 D1-RECTIFY 处理结果

用户已批准整改并要求由Codex验收。本次整改不是D1的增量补丁，而是取代旧D1“五粒度授权作为内部岗位范围切换”的方案：

- P2 默认范围/多授权身份：取消内部scope概念。`inPortal()`不再按scope改写角色；账号在三个工作台内始终按真实专业岗位鉴权。多授权账号的运营/售后任务与消息按持久授权合并可读，不依赖scope切换。
- P2 owner财务边界：`canFinance()`同时要求真实财务能力（owner/finance岗位或finance授权）与实际处于finance工作台；owner在管理工作台执行收款/核销/合同审核等财务写操作返回403，在财务工作台可执行。动作测试见d1-portals第7b节。
- P2 人员转岗锁死：人员面板重写为三个工作台授权 + 独立专业岗位 + 管理台内任务协作能力；支持转岗/降权，服务端记录`member_audit`前后role/desks/portals/defaultDesk。仅owner可授予或取消管理岗位，普通管理不能把协作成员提升为管理员。
- P3 X-Workspace-Portal：只接受三个工作台；旧`X-Workspace-Desk`只映射工作台；`X-Workspace-Scope`明确403。
- P3 审计：`member_audit`新增role/desks/portals/defaultDesk的before/after值。

验证命令与结果见DEVELOPMENT_STATUS.md和交接材料；由Codex复核diff后决定验收与推送。

整改实现提交：代码 `16de17e8e25e623e0f5fabe2395b071731ad3f8a`，测试 `398699952a432da88c767f9f9433d7189fd9ac38`。Codex待复核。
