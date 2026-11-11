# 多窗口工作登记与协议

状态仅用 planned / in_progress / review / blocked / completed。单一集成窗口维护本表；开始写入前领取文件范围，其他窗口提交交接材料，不并发编辑本表。分支独立还不够：并行写入必须有独立 worktree/clone，禁止共享工作目录写入。

| ID | 目标 | 负责人 | 分支/worktree | 可写范围 | 依赖 | 状态 | 测试/提交/集成 |
|---|---|---|---|---|---|---|---|
| CTX-01 | 上下文体系 | 当前Codex文档窗口 | codex/gushios-v2，当前独占checkout | AGENTS.md、docs/ai/*.md | D1基线98774cd | completed | 文档静态检查；提交用 git log -1 -- docs/ai 查询；本地提交，不自动推送 |
| D1-REVIEW | 独立复核D1 | Codex核验、DSH只读审查 | codex/gushios-v2；DSH只读共享checkout | Codex仅docs/ai报告及交接；DSH无写权限 | 0f76484 | completed | 见D1_REVIEW.md；发现问题待修复，不表示D1验收通过 |
| D1-RECTIFY | 三工作台-only整改，取消operations/aftersales工作台、默认台与scope切换；修复D1审查P2/P3 | DSH（唯一代码写入者） | codex/gushios-v2，当前唯一checkout；基线aa921d1 | app/、tests/、docs/ai、README、部署说明本整改所需文件；无schema变更 | aa921d1；用户授权整改并最终由Codex验收 | completed | 代码16de17e、测试3986999；本次tsc/构建/739 release/99 D0财务/26计算/83浏览器通过；待Codex复核推送，未部署未合并main |

## 推荐职责（不是自动分配的新任务）
产品窗口：需求、验收标准与决策草案；前端：导航、页面、手机交互；后端：API、权限与模型；财务：现金流和收付口径；测试：独立复现与审查；集成：登记任务、合入V2、统一更新上下文。
每项任务开始前填写ID、目标、负责人、分支、worktree绝对路径、文件白名单、依赖、状态。实际分配前不得开工；不把泛化角色当写入授权。

## 文件所有权与集成
team.ts、access.ts、server/auth.ts、db/schema.ts、drizzle/*、server/cash*.ts、finance-model.ts、cash-model.ts 每一时段只能有一个写入负责人。workspace.tsx、globals.css、共享测试与本目录也是冲突热点。扩展白名单先协调；后续任务等待或重排，不能直接覆盖。
新分支从约定的V2提交建立，记录基线。只读审查可并行；代码任务逐个提交。集成窗口检查依赖、diff、权限和计算变化、测试与干净状态后按批准范围集成至V2，处理冲突后重跑相关测试。不得自动合并main。不得替其他窗口提交尚未交接的修改。
交接必须包含：目的、文件、理由、权限/财务影响、测试命令与结果/未运行原因、完整SHA、遗留问题、是否可集成。冲突/阻塞标blocked，未审查标review；集成完成和任务实现完成分别记录。
