import {env} from './node-env';
import {Member,Role,deskOf,DESK_IDS,Desk,isManager,Portal,PORTAL_IDS,portalOfDesk} from '../team';
import {grantedDesks,defaultDesk,inPortal,needsOnboarding,hasPortal,scopesInPortal} from '../access';
import {digestToken} from './password';
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export type RawMember={id:string;workspace_id:string;subject_id:string|null;email:string;phone:string|null;name:string;role:Role;region:string;status:'active'|'disabled';version:number;has_password?:number;must_change?:number;desks?:string|null;default_desk?:string|null;profile_completed_at?:string|null};
export function memberDTO(r:RawMember):Member{let desks:Desk[]|undefined;try{if(r.desks!==null&&r.desks!==undefined)desks=JSON.parse(r.desks)}catch{desks=[]}return {id:r.id,name:r.name,email:r.email.endsWith('@phone.internal.invalid')?'':r.email,phone:r.phone||'',role:r.role,accountRole:r.role,assignedDesks:grantedDesks({role:r.role,assignedDesks:desks}),defaultDesk:DESK_IDS.includes(r.default_desk as Desk)?r.default_desk as Desk:deskOf(r.role),region:r.region,status:r.status,bound:!!r.has_password,version:r.version,mustChangePassword:!!r.must_change,profileCompleted:!!r.profile_completed_at};}

export type Context={db:D1Database;uid:string;workspaceId:string;member:Member;portal:Portal};
export const COOKIE_NAME='gushi_session';
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export function handleError(e:unknown){if(e instanceof HttpError)return response({error:e.message},e.status);if(e instanceof SyntaxError)return response({error:'提交格式不正确'},400);if(e instanceof Error&&e.name==='ZodError'){const issues=(e as unknown as {issues:{message:string}[]}).issues;return response({error:issues?.[0]?.message||'请检查填写内容'},400)}console.error('[server]',e instanceof Error?e.message:'unknown error');return response({error:'操作未完成，请稍后重试'},503)}
export function checkOrigin(req:Request){const expected=env.APP_ORIGIN;if(!expected)throw new HttpError(503,'网站访问域名尚未配置');if(req.headers.get('origin')!==expected)throw new HttpError(403,'请求来源不正确')}
export const sessionToken=(req:Request)=>(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE_NAME+'='))?.slice(COOKIE_NAME.length+1)||'';
export function sessionCookie(req:Request,token:string,maxAge=43200){const secure=(env.APP_ORIGIN||req.url).startsWith('https:');return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;}
const isPortalId=(v:string):v is Portal=>(PORTAL_IDS as readonly string[]).includes(v);
// D1 workbench selection is resolved here, once, for every API and page.
// Values accepted, in priority order:
// - x-workspace-portal / portal option: one of the three workbenches.
// - x-workspace-desk / desk option: legacy granular desk (old links, saved
//   tabs and automation) mapped to its workbench and kept as the requested
//   granular scope so old sessions keep exactly the same authority.
// - x-workspace-scope / scope option: optional granular scope inside the
//   workbench (operations/aftersales inside management, or manager scope).
export async function getContext(req:Request,options:{allowPasswordChange?:boolean;desk?:string;portal?:string;scope?:string}={}):Promise<Context>{
 const token=sessionToken(req);if(!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'请使用邮箱或手机号和密码登录');const db=env.DB;
 const raw=await db.prepare('SELECT m.*,1 AS has_password,c.must_change FROM auth_sessions s JOIN members m ON m.id=s.member_id JOIN credentials c ON c.member_id=m.id AND c.version=s.credential_version WHERE s.token_hash=? AND s.expires_at>?').bind(await digestToken(token),new Date().toISOString()).first<RawMember>();
 if(!raw)throw new HttpError(401,'登录已失效，请重新登录');if(raw.status!=='active')throw new HttpError(403,'此账号已停用，请联系管理员');const base=memberDTO(raw);if(needsOnboarding(base)&&!options.allowPasswordChange)throw new HttpError(423,'请先完成真实姓名确认和首次密码设置');
 const header=(name:string)=>req.headers.get(name)||'';
 const isDeskId=(v:string):v is Desk=>(DESK_IDS as readonly string[]).includes(v);
 const toPortal=(v:string):Portal=>isPortalId(v)?v:isDeskId(v)?portalOfDesk(v):(()=>{throw new HttpError(403,'工作台不存在或账号未获授权')})();
 const portalHeader=options.portal||header('x-workspace-portal');
 const legacyDesk=options.desk||header('x-workspace-desk');
 const fallback=defaultDesk(base);
 // A legacy granular desk always means "its workbench", and is also pinned as
 // the requested scope below so old sessions keep exactly the same authority.
 let portal:Portal;
 if(portalHeader)portal=toPortal(portalHeader);
 else if(legacyDesk)portal=toPortal(legacyDesk);
 else portal=portalOfDesk(fallback);
 if(!hasPortal(base,portal))throw new HttpError(403,'账号未获授权进入此工作台，请联系管理人员');
 // A legacy X-Workspace-Desk value also pins the granular scope it used to mean.
 const scopeHeader=options.scope||header('x-workspace-scope')||legacyDesk;
 const rawScope:Desk|''=scopeHeader?(isDeskId(scopeHeader)?scopeHeader:''):'';
 if(scopeHeader&&!rawScope)throw new HttpError(403,'岗位范围不存在或账号未获授权');
 if(rawScope&&!scopesInPortal(base,portal).includes(rawScope))throw new HttpError(403,'账号未获授权使用此岗位范围，请联系管理人员');
 const member=inPortal(base,portal,rawScope||undefined);
 return {db,uid:raw.id,workspaceId:raw.workspace_id,member,portal};
}
export async function directory(ctx:Context){const rows=await ctx.db.prepare('SELECT m.*,CASE WHEN c.member_id IS NULL THEN 0 ELSE 1 END AS has_password,c.must_change FROM members m LEFT JOIN credentials c ON c.member_id=m.id WHERE m.workspace_id=? ORDER BY m.created_at').bind(ctx.workspaceId).all<RawMember>();return rows.results.map(memberDTO)}
export function requireManager(ctx:Context){if(!isManager(ctx.member))throw new HttpError(403,'仅管理工作台可以管理人员和工作台权限')}
export function requireOwner(ctx:Context){if(ctx.member.role!=='owner')throw new HttpError(403,'仅系统管理员可以配置成员与岗位')}
export function activeGuard(ctx:Context){return ctx.db.prepare("SELECT id FROM members WHERE id=? AND status='active'").bind(ctx.member.id)}
