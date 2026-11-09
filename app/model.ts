import {demoBusiness} from './business-demo';
import type { Commercial, Execution } from './business-model';
import type { Workflow } from './workflow';
export const STAGES=['项目筛选','设计上图','业主推进','招标跟进','商务谈判','合同履约','售后复盘','已结项','已丢单','已暂停'];
export const ACTIVE=STAGES.slice(0,7);
export type Product={id:string;brand:string;category:string;area:string;name:string};
export type Opportunity={id:string;productId:string;drawing:'未开始'|'推进中'|'已完成';tender:'未开始'|'推进中'|'已完成';filing:'未报备'|'已提交'|'已确认'|'未通过';note:string;filingDate?:string;filingContact?:string;filingReference?:string};
export type Project={commercial?:Commercial;execution?:Execution;id:string;version:number;ownerMemberId?:string;name:string;location:string;type:string;source:string;owner:string;stage:string;amount:number;customer:string;designer:string;contractor:string;contact:string;phone:string;nextAction:string;nextDate:string;notes:string;opportunities:Opportunity[];workflow?:Workflow;updatedAt:string};
export type Event={id:string;projectId:string;createdAt:string;kind:string;actor:string;note:string;changes:string[]};
export type Config={company:string;owners:string[];staleDays:number;products:Product[]};
const rows=[
['欧文斯科宁保温系列','建筑','厂房/仓库钢结构屋墙面保温','钢构玻璃棉'],
['欧文斯科宁保温系列','机电暖通','中央空调风管保温方案一','暖通玻璃棉'],
['欧文斯科宁保温系列','机电暖通','中央空调风管保温方案二','机制玻璃棉衬里内保温风管'],
['欧文斯科宁保温系列','机电暖通','地下室防排烟管道包裹','防排烟专用玻璃棉/岩棉'],
['欧文斯科宁保温系列','工艺设备管道','工业园区高温管道及锅炉设备等保温','高温玻璃棉'],
['欧文斯科宁保温系列','建筑','建筑隔墙吸音','吸音玻璃棉'],
['欧文斯科宁保温系列','幕墙','幕墙保温用','憎水玻璃棉'],
['欧文斯科宁保温系列','机电暖通','中央空调冷水管保温','橡塑保温'],
['欧文斯科宁保温系列','建筑','混凝土建筑屋面保温','挤塑板保温'],
['欧文斯科宁保温系列','建筑','钢构建筑屋面保温','岩棉'],
['欧文斯科宁保温系列','建筑','建筑外墙内保温','岩棉'],
['欧文斯科宁保温系列','建筑','幕墙保温/防火','岩棉'],
['欧文斯科宁保温系列','建筑','室内防火隔墙','岩棉'],
['亚萨合莱（阔福工业门）','建筑','厂房/仓库滑升门及卸货平台','滑升门/快卷门/卸货平台'],
['亚萨合莱（五金配件）','建筑','各种门','门锁、闭门器、逃生装置及配套五金'],
['索普瑞玛防水','建筑','建筑屋面/墙面/地下室防水','PVC/TPO柔性卷材/沥青类防水'],
['波尔派丝地坪钢纤维','建筑','地下室/厂房建筑地坪','地坪防开裂钢纤维'],
['贝塔围栏','建筑','园区围栏及传达室大门','围网/栅栏'],
['阿姆斯壮天花板与地材','建筑（装修）','室内吊顶与地面装修','阿姆斯壮天花板/地材/地毯'],
['凯伦融合瓦防水','建筑','厂房/仓库钢结构屋墙面保温','融合瓦'],
['瓦希虹吸排水','建筑','钢构建筑屋面保温','瓦希虹吸排水/洁净地漏'],
];
export const CATALOG:Product[]=rows.map((r,i)=>({id:'p'+(i+1),brand:r[0],category:r[1],area:r[2],name:r[3]}));
export const DEFAULT_CONFIG:Config={company:'固实能源 · 项目协同',owners:['销售负责人','销售协作'],staleDays:7,products:CATALOG};
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function shiftDate(n:number){const d=new Date(today()+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()+n);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
export function daysSince(date:string){const day=date.includes('T')?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date)):date;return Math.floor((Date.parse(today()+'T00:00:00+08:00')-Date.parse(day+'T00:00:00+08:00'))/86400000);}
export function isActive(p:Project){return ACTIVE.includes(p.stage);}
export function risk(p:Project,stale:number){if(!isActive(p))return {text:p.stage,tone:'gray',level:0};if(!p.nextDate||!p.nextAction)return {text:'缺少跟进计划',tone:'red',level:4};if(p.nextDate<today())return {text:'逾期 '+daysSince(p.nextDate)+' 天',tone:'red',level:3};if(daysSince(p.updatedAt)>=stale)return {text:daysSince(p.updatedAt)+' 天未更新',tone:'amber',level:2};if(p.nextDate===today())return {text:'今日待跟进',tone:'blue',level:1};return {text:'正常推进',tone:'green',level:0};}
export function blankProject(owner:string):Project{return {id:'',version:0,name:'',location:'',type:'工业厂房',source:'老客户',owner,stage:STAGES[0],amount:0,customer:'',designer:'',contractor:'',contact:'',phone:'',nextAction:'',nextDate:today(),notes:'',opportunities:[],updatedAt:new Date().toISOString()};}
export function demoData(){
 const specs=[
 ['苏州高新区智能制造基地','苏州 · 高新区','工业厂房','设计上图',128,'销售负责人',-2,-9,'确认暖通设计图纸与保温参数',['p1','p2','p14']],
 ['嘉兴智慧物流园二期','嘉兴 · 秀洲区','物流仓库','商务谈判',86,'销售协作',0,-2,'与采购方确认付款节点和交期',['p14','p16']],
 ['杭州滨江研发中心','杭州 · 滨江区','商业地产','业主推进',65,'销售负责人',0,-1,'向业主提交同类型项目案例',['p6','p19']],
 ['宁波临港工业园能源站','宁波 · 北仑区','工业园区','招标跟进',94,'销售协作',3,-12,'确认招标文件发布时间',['p5','p8']],
 ['无锡新能源生产基地','无锡 · 新吴区','工业厂房','合同履约',156,'销售负责人',1,-2,'核对首批材料交付计划',['p1','p16','p21']],
 ['南京科创园配套厂房','南京 · 江宁区','工业厂房','项目筛选',48,'销售协作',4,-3,'联系设计院，确认项目立项情况',['p10','p17']],
 ['常州体育中心配套工程','常州 · 新北区','公共建筑','设计上图',72,'销售负责人',-1,-5,'约设计师讨论吸音材料选型',['p6','p19']],
 ['南通先进材料产业园','南通 · 开发区','工业园区','项目筛选',39,'销售协作',2,-4,'核实业主建设计划和预算',['p18','p20']],
 ] as const;
 const projects:Project[]=specs.map((s,i)=>({...blankProject(s[5]),...demoBusiness(i),id:'demo-'+i,version:1,name:s[0],location:s[1],type:s[2],stage:s[3],amount:s[4],nextDate:shiftDate(s[6]),nextAction:s[8],updatedAt:shiftDate(s[7])+'T09:30:00+08:00',source:['设计院','老客户','同行','RCC'][i%4],customer:'示例业主单位 '+(i+1),designer:'示例建筑设计院',contractor:i===1||i===4?'示例工程采购单位':'待确认',contact:'项目联系人（示例）',notes:'此项目仅用于演示，不代表真实客户或业务。',opportunities:s[9].map((id,j)=>({id:'op-'+i+'-'+j,productId:id,drawing:i===1||i===4?'已完成':j===0?'推进中':'未开始',tender:i===4?'已完成':'未开始',filing:i===4?'已确认':j===0?'已提交':'未报备',note:''}))}));
 const events:Event[]=projects.flatMap(p=>[{id:p.id+'-e1',projectId:p.id,createdAt:p.updatedAt,kind:'跟进记录',actor:p.owner+'（演示）',note:'已完成初步沟通，明确当前需求，下一步：'+p.nextAction,changes:[]},{id:p.id+'-e2',projectId:p.id,createdAt:shiftDate(-18)+'T09:00:00+08:00',kind:'创建项目',actor:p.owner+'（演示）',note:'录入项目线索，建立项目档案。',changes:[]}]);
 return {projects,events};
}
