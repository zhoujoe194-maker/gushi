# 测试与证据规范

## 准备
使用package.json要求的Node 24+及锁文件依赖，按README安装（npm ci）。先检查分支、工作区、端口与DATABASE_PATH；不要输出环境中的密钥。生产构建只是本机验证，不是部署。

```sh
node node_modules/typescript/bin/tsc --noEmit
npm run build
RUN_LOCAL_TESTS=1 node tests/v2-foundation.mjs
RUN_LOCAL_TESTS=1 node tests/v2-lightweight.mjs
RUN_LOCAL_TESTS=1 node tests/v2-outcomes.mjs
RUN_LOCAL_TESTS=1 node tests/v2-cashflow.mjs
node tests/cash-forecast-unit.mjs
RUN_LOCAL_TESTS=1 QA_D1_PORT=5220 node tests/d1-portals.mjs
RUN_LOCAL_TESTS=1 QA_DEPLOY_PORT=5491 node tests/deployment-smoke.mjs
RUN_LOCAL_TESTS=1 QA_BASE_PORT=5210 node tests/release-checks.mjs
```

按受影响模块选择；共享权限/财务变更扩大回归。接口脚本创建临时数据库并迁移；使用前检查脚本和端口，不能假定所有测试脚本都同样隔离。并行测试须隔离数据库、端口和构建输出，避免多进程同时写.next-production。

## 数据库与浏览器
迁移脚本为scripts/selfhost-migrate.mjs，备份为scripts/selfhost-backup.mjs。手动运行前将DATABASE_PATH显式指向mktemp建立的临时目录；只允许已确认模拟库的备份副本。deployment-smoke覆盖启动、迁移和备份恢复；scripts/v2-migration-audit.py接收源模拟副本及新的临时目标路径，比较历史摘要与重复迁移。不要将备份、账号清单、截图中的敏感数据提交。
D1浏览器：先审阅 tests/d1-browser-setup.mjs，它依赖仓库外阶段C模拟导出，生成一次性副本和受限账号文件；再运行 `node tests/d1-browser-setup.mjs`、`QA_PORT=5406 node tests/d1-portals-browser.mjs`。需本机Chrome及可用PLAYWRIGHT_MODULE；QA_URL只能指向隔离测试服务。C浏览器脚本使用QA_URL/QA_PASSWORD，密码仅在本地安全环境传入。

## 限制与失败处理
D1报告使用临时ad-hoc签名Node副本解决本机sharp加载限制，该路径不是可携带依赖。新环境先验证Node/sharp与浏览器模块，不承诺旧临时路径仍存在。缺模拟导出、浏览器、依赖或可用端口时注明阻塞，不用真实库替代。
记录基线SHA、命令、环境、通过/失败/跳过数量和日志位置；失败保留证据，区分环境失败与产品失败，修正后重新运行相关套件。不得把未运行写为通过；套件重叠不累计独立用例。本次纯文档任务只做文档及Git检查，未重新执行历史业务测试。
