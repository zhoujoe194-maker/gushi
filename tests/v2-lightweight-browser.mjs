import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.QA_URL || 'http://127.0.0.1:5290';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !process.env.QA_PASSWORD || !process.env.QA_EMAIL) throw Error('仅限本机模拟库，需指定 QA_EMAIL 和 QA_PASSWORD');
const out=resolve(process.env.QA_OUTPUT || 'work/v2-ui-qa'); mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const failures=[];page.on('pageerror',e=>failures.push(e.message));
try{
await page.goto(base+'/login/sales');await page.getByLabel('邮箱或手机号').fill(process.env.QA_EMAIL);await page.getByLabel('密码',{exact:true}).fill(process.env.QA_PASSWORD);await page.getByRole('button',{name:'登录工作区',exact:true}).click();await page.waitForURL('**/work/sales');await page.getByRole('button',{name:'新建项目',exact:true}).first().click();
await page.getByLabel('项目名称').fill('桌面极简验收项目');await page.screenshot({path:out+'/desktop-create.png'});
await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.getByRole('heading',{name:'桌面极简验收项目',exact:true}).waitFor();console.log('PASS 桌面只填写名称创建并打开详情');
await page.getByRole('button',{name:'记录跟进',exact:true}).last().click();await page.getByLabel('本次跟进内容').fill('已联系客户，确认产品需求。');await page.screenshot({path:out+'/desktop-followup.png'});await page.getByRole('button',{name:'保存跟进结果',exact:true}).click();await page.getByText('跟进已保存',{exact:true}).waitFor();console.log('PASS 桌面跟进日期留空保存');
await page.screenshot({path:out+'/desktop-detail.png'});
await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('button',{name:'新建项目',exact:true}).first().click();await page.getByLabel('项目名称').fill('手机极简验收项目');await page.screenshot({path:out+'/mobile-create.png'});
await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.getByRole('heading',{name:'手机极简验收项目',exact:true}).waitFor();console.log('PASS 手机只填名称创建');
await page.getByRole('button',{name:'记录跟进',exact:true}).last().click();await page.getByLabel('本次跟进内容').fill('客户希望下周收到新的样品。');await page.getByLabel('下次跟进日期（选填）').fill('2026-11-16');await page.screenshot({path:out+'/mobile-followup.png'});await page.getByRole('button',{name:'保存跟进结果',exact:true}).click();await page.getByText('跟进已保存',{exact:true}).waitFor();console.log('PASS 手机填写跟进和下次日期');
console.log('overflow',await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})));console.log('pageErrors',failures);await page.screenshot({path:out+'/mobile-detail.png'});

await page.getByRole('button',{name:'合同与票款',exact:true}).last().click();await page.getByRole('button',{name:'提交合同',exact:true}).click();
await page.getByLabel('合同编号',{exact:true}).fill('MOBILE-TRIAL-001');await page.getByLabel('合同金额（元）').fill('1000');await page.getByLabel('付款与交付约定').fill('验收后支付，模拟试用。');await page.getByRole('button',{name:'确认提交',exact:true}).click();await page.getByText('MOBILE-TRIAL-001',{exact:true}).waitFor();console.log('PASS 手机销售合同提交界面可用');
await page.getByRole('button',{name:'编辑项目',exact:true}).click();await page.getByText('补充资料（选填）',{exact:true}).click();await page.getByLabel('业主单位',{exact:true}).fill('手机补充的模拟客户');await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.getByText('项目资料已保存',{exact:true}).waitFor();console.log('PASS 取消分部后新项目仍能编辑补充资料');
await page.getByRole('button',{name:'关闭项目详情',exact:true}).click();await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('button',{name:'项目协同',exact:true}).click();await page.locator('.quick-project-table').waitFor();await page.screenshot({path:out+'/mobile-project-list.png'});
const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(metrics.scroll>metrics.width)throw Error('Mobile horizontal overflow');console.log('PASS 手机项目列表无横向溢出');await page.locator('.quick-project-table').getByRole('button',{name:'记录跟进',exact:true}).first().click();await page.getByLabel('本次跟进内容').waitFor();console.log('PASS 手机列表可一键打开跟进窗口');
if(failures.length)throw Error(failures.join('\n'));
for(const viewport of [{width:360,height:740},{width:768,height:1024}]) {
 await page.setViewportSize(viewport);
 const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 if(size.scroll>size.width)throw Error('Viewport overflow '+viewport.width);
 await page.getByLabel('本次跟进内容').fill('小屏与平板的模拟跟进');
 await page.screenshot({path:out+'/followup-'+viewport.width+'.png'});
 console.log('PASS '+viewport.width+'px 跟进表单无溢出且可输入');
}
console.log('PASS 无浏览器运行时异常');

}finally{await browser.close();}
