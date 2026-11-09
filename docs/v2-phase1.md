# GushiOS V2.0 第一阶段：数据与权限基础

基线：GitHub c38b30f。分支 codex/gushios-v2。仅本地开发，不部署生产。

## 实施内容

- canReadProject 收紧：销售仅本人稳定 ownerMemberId；任务、协作人和群成员不授予项目访问。
- 按用户最新决定取消分部数据权限。旧 branch_manager 和 management 统一公司管理范围；旧 region 原值保留，不批量更新历史。
- 任务列表、任务变更、任务图片需要任务授权与关联项目授权同时满足。独立任务仍允许原运营、售后承办。
- 项目群需要原会话成员授权及当前项目权限，管理/财务不会仅凭岗位获得私人聊天。
- 私聊中有关联项目 ID 的消息逐条过滤；分页、最后消息和未读计数均排除无权项目消息。
- 销售工作记录中关联已转交项目的记录不通过日常考核接口返回。记录保留在数据库。
- 财务台账不再由 sales 角色整体获得；销售项目的商务投影隐藏成本单价和利润说明。普通资料保存回传投影不会覆盖隐藏原值。
- 负责人变更在项目事务中写独立归属历史；通用事件新增稳定操作人和当时负责人 ID。
- 新增 0012 迁移：跟进、原因分类、结果事件、更正版本、负责人历史、管理复查六张表。尚未开放结果/跟进新接口。
- 补齐已有会议表的 Drizzle 声明；修复干净 GitHub 检出缺少可选 Sites hosting.json 时构建失败。

## 修改文件

权限核心：app/team.ts、app/task-model.ts、app/server/auth.ts、app/server/resource-access.ts、app/server/message-access.ts、app/server/projects.ts。

接口：app/api/workspace/route.ts、app/api/tasks/route.ts、app/api/tasks/images/[id]/route.ts、app/api/messages/route.ts、app/api/sales/route.ts、app/api/meetings/route.ts。

数据库：db/schema.ts、drizzle/0012_v2_foundation.sql。

验证：tests/v2-foundation.mjs、tests/deployment-smoke.mjs、scripts/v2-migration-audit.py。

构建：vite.config.ts、.gitignore。

## 验证与备份

备份位于工作区 outputs/gushios-v2-phase1，数据库文件权限 0600，不提交 Git。

- 生产构建和 TypeScript 检查通过。
- V2 HTTP 集成测试 27 项通过，测试真实路由与临时 SQLite。
- 首次初始化测试 40 项通过。
- 部署、重复迁移、备份恢复与静态资源检查 49 项通过。
- 两个旧库副本各 18 张历史业务表逐行摘要一致，分别 16、769 行；含账号凭据、项目、消息、任务、财务等全部原表。
- SQLite 完整性及外键检查通过；迁移再次执行无数据变化。
- 体验库 exp-project-5、exp-project-13、exp-project-21 的旧阶段需要在状态转换前确认，未自动改变。

复现：Node 24，先运行 npm run build，再运行 node tests/v2-foundation.mjs。迁移审计脚本只接受不存在的目标副本路径，绝不迁移源库。

## 第一阶段限制及后续交接

这是可测试的基础阶段，尚不是可发布的 V2 版本：

1. 三入口页面、移除分部选择器、最少字段创建、快速跟进、普通任务直完、个人结果快照界面后续实施；现有 5174/5180 预览未切换。
2. 暂停/丢单新校验、状态变化通知、定期复查、管理异议尚未接入。建议无复查日期暂停项目默认每 7 天进入管理复查，可配置；记录保存不等待审批。
3. 原运营/售后关联项目任务在无项目权限时不会显示敏感内容；原数据由管理保留查看。后续提供独立协作任务入口，不自动转授完整项目。
4. 无 projectId 的历史自由文本无法可靠分类；不自动开放私人聊天、不改写原文。新业务界面必须明确项目消息关联。
5. 销售完整财务台账入口已收紧；销售合同提交/开票申请的最小商务权限接口与页面需要后续适配。目前不能把该中间版本用于生产替换。
6. 旧五工作台全量验收脚本含“协作即可读项目”“分部隔离”等旧规则，尚未全部改为 V2；本阶段不宣称旧 584 项全量回归通过。
7. 手机/30 秒体验验收留到页面完成后，不能用接口测试替代真实员工试用。
8. 原库未运行新迁移。任何首次启用这条分支的服务都必须先执行迁移。不能直接用旧代码覆盖未来 V2 新数据来回滚；正式上线前另做完整升级/回退演练。

第二阶段前先向用户报告本阶段结果。没有执行生产部署、公开发布或改变既有账号密码。
