import {DESK_IDS,Desk,Member,Role,deskOf} from './team';
export function grantedDesks(m:Pick<Member,'role'|'assignedDesks'|'accountRole'>):Desk[]{if(m.assignedDesks)return [...new Set(m.assignedDesks.filter(d=>DESK_IDS.includes(d)))];return (m.accountRole||m.role)==='owner'?[...DESK_IDS]:[deskOf(m.accountRole||m.role)];}
export const hasDesk=(m:Pick<Member,'role'|'assignedDesks'|'accountRole'>,desk:Desk)=>grantedDesks(m).includes(desk);
export const defaultDesk=(m:Member):Desk=>m.defaultDesk&&hasDesk(m,m.defaultDesk)?m.defaultDesk:grantedDesks(m)[0]||deskOf(m.role);
export const needsOnboarding=(m:Member)=>!!m.mustChangePassword||m.profileCompleted===false;
export const entryDestination=(m:Member)=>needsOnboarding(m)?'/account/security':grantedDesks(m).length>1?'/workspaces':'/work/'+defaultDesk(m);
export function inDesk(m:Member,desk:Desk):Member{const base=m.accountRole||m.role;return {...m,accountRole:base,role:deskOf(base)===desk?base:desk};}
export function realNameProblem(value:string){const name=value.trim();return name.length<2||name.length>50||!/^\p{L}[\p{L}\p{M} .·'’-]*\p{L}$/u.test(name)?'请填写 2–50 个字的真实姓名，可使用中文或英文':/^(待完善成员|公司管理员|未命名|管理员|测试用户|员工)$/.test(name)?'请填写你本人的真实姓名':'';}
export type AccessRole=Role;
