import { Desk, Member, hasGrant, isManager, isScopedManager, realRole } from './team';
import { today, shiftDate } from './model';
import type { TaskImage } from './task-images';
export const TASK_STATUSES = [
  '待处理',
  '处理中',
  '待验收',
  '已完成',
  '已取消',
] as const;
export type DeskTask = {
  id: string;
  version: number;
  desk: Desk;
  region: string;
  title: string;
  request: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  assigneeId: string;
  assigneeName: string;
  status: (typeof TASK_STATUSES)[number];
  result: string;
  images?: TaskImage[];
  reviewNote: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  history: {
    at: string;
    actor: string;
    note: string;
    status: string;
    images?: TaskImage[];
  }[];
};
export const canDispatchTask = (m: Member) =>
  isManager(m) || realRole(m) === 'sales';
// D1-RECTIFY: receiving scope follows the persisted capability grants. This is
// equivalent to the old ability to switch into each granted desk, without any
// runtime scope switch and without turning a collaborator into a manager.
export const inReceivingTaskScope = (
  t: Pick<DeskTask, 'desk' | 'region'>,
  m: Member,
) =>
  isManager(m) || hasGrant(m, t.desk);
export const inTaskScope = (
  t: Pick<DeskTask, 'desk' | 'region'> & Partial<Pick<DeskTask, 'createdBy' | 'assigneeId'>>,
  m: Member,
) =>
  (inReceivingTaskScope(t, m) && (isManager(m) || t.assigneeId === m.id)) ||
  (realRole(m) === 'sales' &&
    t.createdBy === m.id);
export const canManageTask = (t: DeskTask, m: Member) =>
  inTaskScope(t, m) &&
  (isManager(m) || (realRole(m) === 'sales' && t.createdBy === m.id));
export const canHandleTask = (t: DeskTask, m: Member) =>
  inReceivingTaskScope(t, m) &&
  (isManager(m) || !t.assigneeId || t.assigneeId === m.id);
export const taskOverdue = (t: DeskTask) =>
  !['已完成', '已取消'].includes(t.status) && t.dueDate < today();
export function demoDeskTasks(): DeskTask[] {
  return (
    ['sales', 'finance', 'operations', 'aftersales', 'management'] as Desk[]
  ).map((desk, i) => ({
    id: 'desk-demo-' + desk,
    version: 1,
    desk,
    region: '全部分部',
    title: [
      '确认客户下次采购计划',
      '核对本周应收与开票资料',
      '确认厂家交期并更新报备',
      '回访客户并反馈现场问题处理结果',
      '复核本周重点项目风险',
    ][i],
    request: '请按期限处理，记录办理过程和具体结果，提交管理台验收。',
    dueDate: shiftDate(i === 2 ? -1 : 2),
    projectId: '',
    projectName: '',
    assigneeId: '',
    assigneeName: '',
    status: i === 1 ? '待验收' : '待处理',
    result: i === 1 ? '应收明细与待开票资料已核对，请验收。' : '',
    reviewNote: '',
    createdBy: 'demo-management',
    createdByName: '管理（演示）',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
  }));
}
