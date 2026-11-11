// D1 three-workbench browser acceptance test.
//
// Scope: sales / management (+operations, aftersales inside it) / finance
// workbenches, the /workspaces three-entrance selector, legacy redirects, and
// responsive behaviour at 360/390/768/1440. Uses only the disposable QA copy of
// the simulation database produced by tests/d1-browser-setup.mjs and a server
// bound to 127.0.0.1.
//
// Run with the ad-hoc signed Node 24 copy (sharp needs it):
//   /private/tmp/node-d1 tests/d1-portals-browser.mjs
// Optional env:
//   QA_URL=http://127.0.0.1:5293   use an already running server instead of
//                                  spawning .next-production/standalone/server.js
//   QA_PASSWORD=...                test-only password (also read from the
//                                  temporary accounts.json manifest)
//   QA_ACCOUNTS_FILE=...           override temporary account manifest
//   PLAYWRIGHT_MODULE=...          override the out-of-repo playwright module
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const require = createRequire(import.meta.url);
const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const workspaceRoot = resolve(repoRoot, '..', '..');
const NODE = existsSync('/private/tmp/node-d1') ? '/private/tmp/node-d1' : process.execPath;
const setupScript = resolve(repoRoot, 'tests/d1-browser-setup.mjs');
const database = '/private/tmp/gushi-d1-browser/company.sqlite';
const accountsFile =
  process.env.QA_ACCOUNTS_FILE || '/private/tmp/gushi-d1-browser/accounts.json';
const playwrightModule =
  process.env.PLAYWRIGHT_MODULE || '/private/tmp/gushi-d1-pw/node_modules/playwright';
// QA_SCREENSHOT_DIR lets a sandboxed/CI run keep evidence outside the repo.
const screenshotDir = process.env.QA_SCREENSHOT_DIR
  ? resolve(process.env.QA_SCREENSHOT_DIR)
  : resolve(workspaceRoot, 'outputs/gushios-v2-d1/browser');
const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];
const DESKTOP = { width: 1440, height: 1000 };

const failures = [];
const passes = [];
function check(condition, label) {
  if (condition) {
    passes.push(label);
    console.log('PASS ' + label);
  } else {
    failures.push(label);
    console.log('FAIL ' + label);
  }
  return !!condition;
}
function must(condition, message) {
  if (!condition) throw new Error(message);
}
async function group(label, fn) {
  try {
    await fn();
  } catch (error) {
    failures.push(label + '：' + (error instanceof Error ? error.message : String(error)));
    console.log('FAIL ' + label + '：' + (error instanceof Error ? error.message : String(error)));
  }
}

// ---------------------------------------------------------------- bootstrap
if (!existsSync(playwrightModule))
  throw new Error(
    '缺少 Playwright：请先安装到 ' +
      playwrightModule +
      ' 或设置 PLAYWRIGHT_MODULE。参考：/private/tmp/node-d1 <pnpm> add playwright --dir /private/tmp/gushi-d1-pw',
  );
const { chromium } = require(playwrightModule);

const externalUrl = process.env.QA_URL || '';
if (externalUrl && !/^http:\/\/127\.0\.0\.1:\d+$/.test(externalUrl))
  throw new Error('QA_URL 仅允许 127.0.0.1 本机模拟服务：' + externalUrl);

// Deterministic disposable database: always rebuild from the simulation export
// unless an external server is provided or QA_SKIP_SETUP=1.
if (!externalUrl && process.env.QA_SKIP_SETUP !== '1') {
  const setup = spawnSync(NODE, [setupScript], {
    cwd: repoRoot,
    env: { ...process.env },
    encoding: 'utf8',
  });
  process.stdout.write(setup.stdout || '');
  if (setup.status !== 0) {
    process.stderr.write(setup.stderr || '');
    throw new Error('测试数据库准备失败，无法继续浏览器验收');
  }
}
if (!existsSync(accountsFile))
  throw new Error('缺少测试账号清单：' + accountsFile + '（先运行 tests/d1-browser-setup.mjs）');
if (!existsSync(database))
  throw new Error('缺少临时数据库：' + database + '（先运行 tests/d1-browser-setup.mjs）');
const manifest = JSON.parse(readFileSync(accountsFile, 'utf8'));
const password = process.env.QA_PASSWORD || manifest.password;
const accounts = manifest.accounts;
must(password, '测试账号清单缺少密码');
for (const key of ['sales', 'operations', 'aftersales', 'management', 'finance', 'multi'])
  must(accounts[key]?.email, '测试账号清单缺少 ' + key + ' 账号');

// Ensure Next standalone has its static/public assets (the build step normally
// copies them; a fresh standalone rebuild may need this again).
const standalone = resolve(repoRoot, '.next-production/standalone');
must(existsSync(standalone + '/server.js'), '缺少生产构建 .next-production/standalone/server.js，请先运行 npm run build');
for (const [from, to] of [
  ['.next-production/static', standalone + '/.next-production/static'],
  ['public', standalone + '/public'],
]) {
  const source = resolve(repoRoot, from);
  if (existsSync(source) && !existsSync(to)) cpSync(source, to, { recursive: true });
}
mkdirSync(screenshotDir, { recursive: true });

async function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.unref();
    server.on('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

let base = externalUrl;
let server = null;
let serverLog = '';
if (!base) {
  const port = Number(process.env.QA_PORT) || (await freePort());
  base = 'http://127.0.0.1:' + port;
  server = spawn(NODE, ['.next-production/standalone/server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_PATH: database,
      APP_ORIGIN: base,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => (serverLog += chunk));
  server.stderr.on('data', (chunk) => (serverLog += chunk));
  server.on('exit', (code) => {
    if (code && code !== 0 && code !== 143) serverLog += '\n[server exited ' + code + ']';
  });
}
let healthy = false;
for (let attempt = 0; attempt < 200; attempt++) {
  try {
    const response = await fetch(base + '/api/health');
    if (response.status < 500) {
      healthy = true;
      break;
    }
  } catch {
    // server still starting
  }
  await new Promise((done) => setTimeout(done, 150));
}
if (!healthy) {
  console.error('服务器启动失败，日志尾部：\n' + serverLog.slice(-4000));
  if (server) server.kill('SIGTERM');
  throw new Error('无法访问 ' + base);
}
console.log('PASS 生产构建服务已启动：' + base + '（数据库：' + database + '）');
passes.push('生产构建服务已启动');

const pageErrors = [];
const consoleErrors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
function watch(page, name) {
  page.on('pageerror', (error) => pageErrors.push({ page: name, message: error.message }));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource|net::ERR_|favicon/i.test(text)) return;
    consoleErrors.push({ page: name, text });
  });
  return page;
}
async function newPage(name, viewport = DESKTOP) {
  const context = await browser.newContext({ viewport, locale: 'zh-CN' });
  const page = await context.newPage();
  watch(page, name);
  return { context, page };
}

// ---------------------------------------------------------------- helpers
const pathOf = (page) => new URL(page.url()).pathname;
const bodyText = async (page) =>
  (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
const navLabels = async (page) =>
  (await page.locator('#workspace-navigation nav button').allInnerTexts())
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));
async function navHas(page, patterns) {
  return hasAny((await navLabels(page)).join(' | '), patterns);
}
async function pageHas(page, patterns) {
  return hasAny(await bodyText(page), patterns);
}
async function findPage(page, selector, patterns) {
  const locator = page.locator(selector);
  const count = await locator.count();
  for (let index = 0; index < count; index++) {
    const item = locator.nth(index);
    let text = '';
    try {
      text = await item.innerText();
    } catch {
      text = '';
    }
    try {
      text +=
        ' ' +
        ((await item.getAttribute('aria-label')) || '') +
        ' ' +
        ((await item.getAttribute('title')) || '');
    } catch {
      // keep the inner text only
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (patterns.some((pattern) => pattern.test(text)) && (await item.isVisible()))
      return item;
  }
  return null;
}
async function waitForWorkspace(page) {
  await page.locator('#workspace-navigation').waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForTimeout(500);
}
async function waitForShell(page) {
  await page.locator('main').first().waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForTimeout(500);
}
async function login(page, email) {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const identifier = page.getByLabel('邮箱或手机号');
  must((await identifier.count()) > 0, '登录页没有邮箱/手机号输入框');
  await identifier.first().fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录工作区', exact: true }).click();
  await page.waitForURL(
    (url) => /\/(work\/[a-z]+|workspaces|account\/security)/.test(url.pathname),
    { timeout: 30000 },
  );
  if (/\/work\/[a-z]+/.test(pathOf(page))) await waitForWorkspace(page);
  else await waitForShell(page);
}
async function openNavItem(page, patterns) {
  const item = await findPage(page, '#workspace-navigation nav button', patterns);
  if (!item) return false;
  await item.click();
  await page.waitForTimeout(500);
  return true;
}
async function metrics(page) {
  return page.evaluate(() => ({
    inner: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
}
async function waitForAnyText(page, patterns, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (hasAny(await bodyText(page), patterns)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
async function noHorizontalOverflow(page, label) {
  const size = await metrics(page);
  const ok = size.document <= size.inner;
  check(ok, label + '（scrollWidth ' + size.document + ' / innerWidth ' + size.inner + '）');
  return ok;
}

try {
  // ------------------------------------------------------------ sales
  await group('销售工作台', async () => {
    const { context, page } = await newPage('sales');
    try {
      await login(page, accounts.sales.email);
      check(/^\/work\/sales$/.test(pathOf(page)), '销售账号登录后进入销售工作台（当前 ' + pathOf(page) + '）');
      check(await pageHas(page, [/(销售工作台|销售台)/]), '销售工作台首页标题可见');
      await waitForAnyText(page, [/新建项目|项目创建|快速跟进/], 20000);

      const entries = [
        [[/项目创建|新建项目/], '项目创建'],
        [[/快速跟进|记录跟进/], '快速跟进'],
        [[/商务报价|报价|商务与交付/], '商务报价'],
        [[/客户回款|回款/], '客户回款'],
        [[/我的.*结果|项目结果/], '我的结果'],
        [[/协作任务|任务下发与跟进|本台任务/], '协作任务'],
      ];
      for (const [patterns, name] of entries) {
        const present =
          (await navHas(page, patterns)) || (await pageHas(page, patterns));
        check(present, '销售台可见' + name + '入口');
      }

      const createButton =
        (await findPage(page, 'button', [/新建项目|项目创建/])) ||
        (await findPage(page, 'a', [/新建项目|项目创建/]));
      must(createButton, '找不到新建项目入口');
      await createButton.click();
      await page.getByLabel('项目名称').waitFor({ state: 'visible', timeout: 15000 });
      const projectName = 'D1浏览器验收项目-' + Date.now().toString().slice(-6);
      await page.getByLabel('项目名称').fill(projectName);
      await page.getByRole('button', { name: '保存项目', exact: true }).click();
      await page.getByRole('heading', { name: projectName, exact: true }).waitFor({ timeout: 20000 });
      check(true, '销售通过现有流程创建项目：' + projectName);
      await page.screenshot({ path: resolve(screenshotDir, 'sales-create-project.png') });

      // The project detail drawer is a dialog whose focus isolation marks the
      // background inert, so record the follow-up from inside the drawer.
      const drawer = page.locator('[role="dialog"]').last();
      const followButton = (await drawer.count())
        ? await findPage(drawer, 'button', [/记录跟进/])
        : null;
      must(followButton, '找不到记录跟进入口');
      await followButton.click();
      await page.getByLabel('本次跟进内容').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByLabel('本次跟进内容').fill('D1 浏览器验收：已联系客户确认需求，约定下次跟进。');
      await page.getByRole('button', { name: '保存跟进结果', exact: true }).click();
      await page.getByText('跟进已保存', { exact: true }).waitFor({ timeout: 20000 });
      check(true, '销售保存客户跟进成功');
      await page.screenshot({ path: resolve(screenshotDir, 'sales-followup.png') });

      const salesNav = (await navLabels(page)).join(' | ');
      check(!/人员管理|工资和固定费用|工资费用|经营总览|公司现金流/.test(salesNav), '销售台导航不含管理台专属入口（人员/工资/现金流）');
      const salesBody = await bodyText(page);
      check(!/人员管理|工资和固定费用|公司现金流/.test(salesBody), '销售台页面不显示管理台专属入口');
    } finally {
      await context.close();
    }
  });

  // ------------------------------------------------------------ operations
  await group('运营账号在管理工作台', async () => {
    const { context, page } = await newPage('operations');
    try {
      await login(page, accounts.operations.email);
      check(/^\/work\/management$/.test(pathOf(page)), '运营账号登录后进入管理工作台（当前 ' + pathOf(page) + '）');
      check(await pageHas(page, [/运营/]), '管理工作台显示真实运营岗位');
      check(!(await pageHas(page, [/切换岗位范围/])), '运营账号没有内部岗位范围切换器');
      const nav = (await navLabels(page)).join(' | ');
      const forbidden = [/项目协同/, /项目管理/, /人员管理/, /工资和固定费用/, /工资费用/, /合同与票款/, /现金流/, /经营总览/];
      check(!hasAny(nav, forbidden), '运营台导航无项目/合同/财务/工资/人员入口');
      check(await navHas(page, [/本台任务|任务下发与跟进/]), '运营台可见本台任务入口');

      must(await openNavItem(page, [/本台任务|任务下发与跟进/]), '运营台找不到本台任务入口');
      await page.waitForTimeout(700);
      const rows = page.locator('.dispatch-row');
      await page.locator('.dispatch-row').first().waitFor({ timeout: 15000 }).catch(() => {});
      check((await rows.count()) > 0, '运营本台任务列表有可处理任务');
      must((await rows.count()) > 0, '运营本台任务列表为空，无法验收任务流程');
      const firstRow = rows.first();
      const title = (await firstRow.innerText()).split('\n')[0].trim();
      await firstRow.click();
      const resultField = page.getByLabel('填写处理过程和具体结果');
      await resultField.waitFor({ state: 'visible', timeout: 15000 });
      await resultField.fill('D1 浏览器验收：运营处理中反馈已填写，等待后续验收。');
      await page.getByRole('button', { name: '保存进展', exact: true }).click();
      await resultField.waitFor({ state: 'detached', timeout: 20000 });
      await page.waitForTimeout(800);
      const updatedRow = page.locator('.dispatch-row').filter({ hasText: title }).first();
      const updatedText = (await updatedRow.count()) ? await updatedRow.innerText() : '';
      check(/处理中/.test(updatedText), '运营提交处理中反馈后任务状态为处理中');
      await page.screenshot({ path: resolve(screenshotDir, 'operations-task.png') });
    } finally {
      await context.close();
    }
  });

  // ------------------------------------------------------------ aftersales
  await group('售后账号在管理工作台', async () => {
    const { context, page } = await newPage('aftersales');
    try {
      await login(page, accounts.aftersales.email);
      check(/^\/work\/management$/.test(pathOf(page)), '售后账号登录后进入管理工作台（当前 ' + pathOf(page) + '）');
      check(await pageHas(page, [/售后/]), '管理工作台显示真实售后岗位');
      check(!(await pageHas(page, [/切换岗位范围/])), '售后账号没有内部岗位范围切换器');
      const nav = (await navLabels(page)).join(' | ');
      const forbidden = [/项目协同/, /项目管理/, /人员管理/, /工资和固定费用/, /工资费用/, /合同与票款/, /现金流/, /经营总览/];
      check(!hasAny(nav, forbidden), '售后台导航无项目/合同/财务/工资/人员入口');
      check(await navHas(page, [/本台任务|任务下发与跟进/]), '售后台可见本台任务入口');

      must(await openNavItem(page, [/本台任务|任务下发与跟进/]), '售后台找不到本台任务入口');
      await page.waitForTimeout(700);
      const rows = page.locator('.dispatch-row');
      await page.locator('.dispatch-row').first().waitFor({ timeout: 15000 }).catch(() => {});
      check((await rows.count()) > 0, '售后本台任务列表有可处理任务');
      must((await rows.count()) > 0, '售后本台任务列表为空，无法验收任务流程');
      const firstRow = rows.first();
      const title = (await firstRow.innerText()).split('\n')[0].trim();
      await firstRow.click();
      const resultField = page.getByLabel('填写处理过程和具体结果');
      await resultField.waitFor({ state: 'visible', timeout: 15000 });
      await resultField.fill('D1 浏览器验收：售后回访处理结果已填写，提交管理验收。');
      await page.getByRole('button', { name: '提交验收', exact: true }).click();
      await resultField.waitFor({ state: 'detached', timeout: 20000 });
      await page.waitForTimeout(800);
      const updatedRow = page.locator('.dispatch-row').filter({ hasText: title }).first();
      const updatedText = (await updatedRow.count()) ? await updatedRow.innerText() : '';
      check(/待验收/.test(updatedText), '售后提交验收后任务状态为待验收');
      await page.screenshot({ path: resolve(screenshotDir, 'aftersales-task.png') });
    } finally {
      await context.close();
    }
  });

  // ------------------------------------------------------------ management
  await group('管理工作台首页与人员管理', async () => {
    const { context, page } = await newPage('management');
    try {
      await login(page, accounts.management.email);
      check(/^\/work\/management$/.test(pathOf(page)), '管理账号登录后进入管理工作台（当前 ' + pathOf(page) + '）');
      await waitForAnyText(page, [/公司经营概览|经营概览|经营总览/], 20000);
      const home = await bodyText(page);
      check(hasAny(home, [/公司经营概览|经营概览|经营总览/]), '管理首页显示公司经营概览');
      check(hasAny(home, [/员工结果/]), '管理首页显示员工结果入口');
      check(hasAny(home, [/暂停.*复查/]), '管理首页显示暂停复查提醒');
      check(hasAny(home, [/运营/]) && hasAny(home, [/售后/]), '管理首页显示运营/售后协作入口');
      await page.screenshot({ path: resolve(screenshotDir, 'management-home.png') });

      must(await openNavItem(page, [/人员管理/]), '管理台找不到人员管理入口');
      await page.waitForTimeout(700);
      const membersText = await bodyText(page);
      check(/人员管理|成员|账号|工作台/.test(membersText), '管理台可打开人员管理页面');
      check(
        /专业岗位/.test(membersText) &&
          !/切换岗位范围|运营工作台|售后工作台/.test(membersText),
        '人员管理展示专业岗位且不再出现内部岗位范围编辑',
      );
      check(
        !/运营工作台|售后工作台/.test(membersText),
        '人员管理只展示销售/管理/财务三个工作台',
      );
      await page.screenshot({ path: resolve(screenshotDir, 'management-members.png') });
    } finally {
      await context.close();
    }
  });

  // ------------------------------------------------------------ finance
  await group('财务工作台', async () => {
    const { context, page } = await newPage('finance');
    try {
      await login(page, accounts.finance.email);
      check(/^\/work\/finance$/.test(pathOf(page)), '财务账号登录后进入财务工作台（当前 ' + pathOf(page) + '）');
      await waitForAnyText(page, [/合同审核|合同与票款|现金流/], 20000);
      const home = await bodyText(page);
      check(hasAny(home, [/合同审核|合同与票款/]), '财务首页显示合同审核入口');
      check(hasAny(home, [/项目收支|应收账款|应收应付/]), '财务首页显示项目收支/应收入口');
      check(hasAny(home, [/现金流/]), '财务首页显示现金流入口');
      await page.screenshot({ path: resolve(screenshotDir, 'finance-home.png') });

      must(await openNavItem(page, [/工资和固定费用|工资费用/]), '财务台找不到工资和固定费用入口');
      await page.waitForTimeout(700);
      const expenses = await bodyText(page);
      check(/工资和固定费用|固定费用|工资/.test(expenses), '财务台可打开工资和固定费用页面');
      await noHorizontalOverflow(page, '财务工资和固定费用页无横向溢出');
      await page.screenshot({ path: resolve(screenshotDir, 'finance-expenses.png') });
    } finally {
      await context.close();
    }
  });

  // ------------------------------------------------------------ multi entrance
  await group('三工作台入口选择', async () => {
    const { context, page } = await newPage('multi');
    try {
      await login(page, accounts.multi.email);
      check(/^\/workspaces$/.test(pathOf(page)), '多工作台账号登录后进入工作台选择页（当前 ' + pathOf(page) + '）');
      await waitForAnyText(page, [/销售工作台|管理工作台|财务工作台/], 20000);
      const hrefs = await page
        .locator('a[href^="/work/"]')
        .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
      check(
        ['/work/sales', '/work/management', '/work/finance'].every((href) => hrefs.includes(href)),
        '/workspaces 显示销售/管理/财务三个工作台入口（' + hrefs.join(', ') + '）',
      );
      const selectorText = await bodyText(page);
      check(
        hasAny(selectorText, [/销售工作台/]) &&
          hasAny(selectorText, [/管理工作台/]) &&
          hasAny(selectorText, [/财务工作台/]),
        '工作台选择页显示三个工作台名称',
      );
      await page.screenshot({ path: resolve(screenshotDir, 'workspaces-selector.png') });

      for (const portal of ['sales', 'management', 'finance']) {
        await page.goto(base + '/work/' + portal, { waitUntil: 'domcontentloaded' });
        await waitForWorkspace(page);
        const names = { sales: /销售/, management: /管理/, finance: /财务/ };
        check(
          pathOf(page) === '/work/' + portal && (await pageHas(page, [names[portal]])),
          '多工作台账号可直接进入 ' + portal + ' 工作台',
        );
      }
    } finally {
      await context.close();
    }
  });

  await group('旧岗位入口跳转', async () => {
    const { context, page } = await newPage('legacy');
    try {
      await login(page, accounts.multi.email);
      for (const legacy of ['operations', 'aftersales']) {
        await page.goto(base + '/work/' + legacy, { waitUntil: 'domcontentloaded' });
        await page.waitForURL((url) => url.pathname === '/work/management', { timeout: 20000 });
        check(pathOf(page) === '/work/management', '旧入口 /work/' + legacy + ' 跳转到管理工作台');
      }
      await page.screenshot({ path: resolve(screenshotDir, 'legacy-redirect.png') });
    } finally {
      await context.close();
    }
  });

  // ------------------------------------------------------------ responsive matrix
  await group('四档视口无横向溢出与导航可用', async () => {
    const matrix = [
      { key: 'sales', account: accounts.sales.email, path: '/work/sales' },
      { key: 'management', account: accounts.operations.email, path: '/work/management' },
      { key: 'finance', account: accounts.finance.email, path: '/work/finance' },
    ];
    for (const item of matrix) {
      const { context, page } = await newPage(item.key + '-responsive', DESKTOP);
      try {
        await login(page, item.account);
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize(viewport);
          await page.goto(base + item.path, { waitUntil: 'domcontentloaded' });
          await waitForWorkspace(page);
          const label = viewport.width + 'px ' + item.key + ' 工作台';
          await noHorizontalOverflow(page, label + '无横向溢出');
          await page.screenshot({
            path: resolve(screenshotDir, item.key + '-' + viewport.width + 'x' + viewport.height + '.png'),
          });

          const toggle = await findPage(page, 'button', [/^打开导航$/]);
          if (toggle) {
            await toggle.click();
            await page.waitForTimeout(400);
          }
          const navButtons = page.locator('#workspace-navigation nav button');
          must((await navButtons.count()) > 0, label + ' 没有导航项');
          const target =
            (await findPage(page, '#workspace-navigation nav button', [/本台任务|项目协同|合同|经营|销售|财务/])) ||
            navButtons.first();
          await target.click();
          await page.waitForTimeout(500);
          check(
            (await page.locator('#workspace-navigation nav button[aria-current="page"]').count()) >= 1,
            label + '导航可切换',
          );
          await noHorizontalOverflow(page, label + '切换页后无横向溢出');
          const close = await findPage(page, 'button', [/^收起导航$/]);
          if (close) {
            try {
              await close.click({ timeout: 2000 });
            } catch {
              // navigation already closed the drawer; sidebar may be inert
            }
          }
        }
      } finally {
        await context.close();
      }
    }
  });

  // ------------------------------------------------------------ runtime errors
  check(pageErrors.length === 0, '浏览器零页面运行时错误');
  if (pageErrors.length) console.log('PAGE_ERRORS ' + JSON.stringify(pageErrors, null, 2));
  const hardConsoleErrors = consoleErrors.filter((entry) =>
    /Uncaught|TypeError|ReferenceError|Hydration/i.test(entry.text),
  );
  check(hardConsoleErrors.length === 0, '浏览器零脚本运行时错误（console）');
  if (consoleErrors.length) console.log('CONSOLE_ERRORS ' + JSON.stringify(consoleErrors, null, 2));

  console.log(
    '\n' +
      JSON.stringify(
        {
          passed: passes.length,
          failed: failures.length,
          failures,
          base,
          database,
          screenshots: screenshotDir,
          accounts: Object.fromEntries(
            Object.entries(accounts).map(([key, value]) => [key, value.email]),
          ),
          serverSpawned: !!server,
        },
        null,
        2,
      ),
  );
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  if (server) {
    server.kill('SIGTERM');
    await new Promise((done) => setTimeout(done, 300));
    if (!server.killed) server.kill('SIGKILL');
  }
}
