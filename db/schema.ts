import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('projects', {
 id: text('id').primaryKey(), userId: text('user_id').notNull(), data: text('data').notNull(), version: integer('version').notNull().default(1), updatedAt: text('updated_at').notNull(),
});
export const events = sqliteTable('events', {
 id: text('id').primaryKey(), projectId: text('project_id').notNull(), userId: text('user_id').notNull(), data: text('data').notNull(), createdAt: text('created_at').notNull(),
});
export const settings = sqliteTable('settings', {userId: text('user_id').primaryKey(), data: text('data').notNull()});
export const members = sqliteTable('members', {
 desks:text('desks'),defaultDesk:text('default_desk'),profileCompletedAt:text('profile_completed_at'),id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull(), subjectId: text('subject_id').unique(), email: text('email').notNull().unique(), phone:text('phone').unique(), name: text('name').notNull(), role: text('role').notNull(), region: text('region').notNull(), status: text('status').notNull(), version: integer('version').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const financeBooks = sqliteTable('finance_books', {projectId:text('project_id').primaryKey(),workspaceId:text('workspace_id').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull()});
export const memberAudit=sqliteTable('member_audit',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),actorId:text('actor_id').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull()});
export const notifications=sqliteTable('notifications',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),recipientId:text('recipient_id').notNull(),projectId:text('project_id').notNull(),message:text('message').notNull(),readAt:text('read_at'),createdAt:text('created_at').notNull()});
export const deskTasks=sqliteTable('desk_tasks',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),desk:text('desk').notNull(),region:text('region').notNull(),projectId:text('project_id'),data:text('data').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull()});

export const credentials=sqliteTable('credentials',{memberId:text('member_id').primaryKey(),passwordHash:text('password_hash').notNull(),mustChange:integer('must_change').notNull().default(1),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull()});
export const authSessions=sqliteTable('auth_sessions',{tokenHash:text('token_hash').primaryKey(),memberId:text('member_id').notNull(),credentialVersion:integer('credential_version').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull()});
export const loginAttempts=sqliteTable('login_attempts',{key:text('key').primaryKey(),attempts:integer('attempts').notNull().default(0),windowStart:integer('window_start').notNull(),lockedUntil:integer('locked_until').notNull().default(0)});

export const messageThreads=sqliteTable('message_threads',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),endpointA:text('endpoint_a').notNull(),endpointB:text('endpoint_b').notNull(),kind:text('kind').notNull().default('direct'),name:text('name').notNull().default(''),projectId:text('project_id').notNull().default(''),createdBy:text('created_by').notNull().default(''),version:integer('version').notNull().default(1),lastMutation:text('last_mutation').notNull().default(''),createdAt:text('created_at').notNull()},t=>[uniqueIndex('message_thread_endpoints').on(t.workspaceId,t.endpointA,t.endpointB),index('message_threads_workspace').on(t.workspaceId)]);
export const messageItems=sqliteTable('message_items',{seq:integer('seq').primaryKey({autoIncrement:true}),id:text('id').notNull().unique(),threadId:text('thread_id').notNull().references(()=>messageThreads.id),workspaceId:text('workspace_id').notNull(),actorId:text('actor_id').notNull(),actorName:text('actor_name').notNull(),senderKey:text('sender_key').notNull(),kind:text('kind').notNull().default('text'),body:text('body').notNull(),projectId:text('project_id').notNull().default(''),createdAt:text('created_at').notNull()},t=>[index('message_items_thread').on(t.threadId,t.seq),index('message_items_workspace').on(t.workspaceId,t.seq)]);
export const messageReads=sqliteTable('message_reads',{workspaceId:text('workspace_id').notNull(),threadId:text('thread_id').notNull().references(()=>messageThreads.id),memberId:text('member_id').notNull(),lastSeq:integer('last_seq').notNull().default(0)},t=>[primaryKey({columns:[t.threadId,t.memberId]})]);

export const messageParticipants=sqliteTable('message_participants',{threadId:text('thread_id').notNull().references(()=>messageThreads.id),memberId:text('member_id').notNull().references(()=>members.id),joinedAt:text('joined_at').notNull()},t=>[primaryKey({columns:[t.threadId,t.memberId]}),index('message_participants_member').on(t.memberId,t.threadId)]);

export const salesRecords=sqliteTable('sales_records',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),memberId:text('member_id').notNull().references(()=>members.id),region:text('region').notNull(),kind:text('kind').notNull(),period:text('period').notNull(),recordDate:text('record_date').notNull(),status:text('status').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()},t=>[uniqueIndex('sales_records_unique').on(t.workspaceId,t.memberId,t.kind,t.period),index('sales_records_member').on(t.workspaceId,t.memberId,t.recordDate),index('sales_records_review').on(t.workspaceId,t.region,t.status)]);

export const taskImages=sqliteTable('task_images',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),taskId:text('task_id').notNull().references(()=>deskTasks.id,{onDelete:'cascade'}),contentBase64:text('content_base64').notNull(),createdAt:text('created_at').notNull()},t=>[index('task_images_task').on(t.workspaceId,t.taskId)]);

export const managementMeetings=sqliteTable('management_meetings',{id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),region:text('region').notNull(),data:text('data').notNull(),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull()},t=>[index('management_meetings_scope').on(t.workspaceId,t.region,t.updatedAt)]);
export const projectFollowups = sqliteTable('project_followups', {
 id: text('id').primaryKey(),
 workspace_id: text('workspace_id').notNull(),
 project_id: text('project_id').notNull(),
 actor_id: text('actor_id').notNull(),
 actor_name: text('actor_name').notNull(),
 content: text('content').notNull(),
 next_followup_date: text('next_followup_date'),
 created_at: text('created_at').notNull(),
 request_id: text('request_id').notNull()
}, t => [uniqueIndex('project_followups_request').on(t.workspace_id,t.request_id),index('project_followups_timeline').on(t.workspace_id,t.project_id,t.created_at)]);
export const projectReasonCategories = sqliteTable('project_reason_categories', {
 id: text('id').notNull(),
 workspace_id: text('workspace_id').notNull(),
 label: text('label').notNull(),
 active: integer('active').notNull().default(1),
 sort_order: integer('sort_order').notNull().default(0)
}, t => [primaryKey({columns:[t.workspace_id,t.id]})]);
export const projectOutcomeEvents = sqliteTable('project_outcome_events', {
 id: text('id').primaryKey(),
 workspace_id: text('workspace_id').notNull(),
 project_id: text('project_id').notNull(),
 project_name: text('project_name').notNull(),
 event_type: text('event_type').notNull(),
 category_id: text('category_id').notNull(),
 category_label: text('category_label').notNull(),
 explanation: text('explanation').notNull(),
 owner_member_id: text('owner_member_id'),
 actor_id: text('actor_id').notNull(),
 created_at: text('created_at').notNull(),
 review_due_date: text('review_due_date'),
 data: text('data').notNull().default('{}')
}, t => [index('project_outcomes_owner').on(t.workspace_id,t.owner_member_id,t.created_at)]);
export const projectOutcomeRevisions = sqliteTable('project_outcome_revisions', {
 id: text('id').primaryKey(),
 workspace_id: text('workspace_id').notNull(),
 event_id: text('event_id').notNull(),
 actor_id: text('actor_id').notNull(),
 created_at: text('created_at').notNull(),
 data: text('data').notNull()
});
export const projectOwnerHistory = sqliteTable('project_owner_history', {
 id: text('id').primaryKey(),
 workspace_id: text('workspace_id').notNull(),
 project_id: text('project_id').notNull(),
 previous_member_id: text('previous_member_id'),
 new_member_id: text('new_member_id'),
 actor_id: text('actor_id').notNull(),
 created_at: text('created_at').notNull()
}, t => [index('project_owner_history_timeline').on(t.workspace_id,t.project_id,t.created_at)]);
export const projectManagementReviews = sqliteTable('project_management_reviews', {
 id: text('id').primaryKey(),
 workspace_id: text('workspace_id').notNull(),
 project_id: text('project_id').notNull(),
 outcome_event_id: text('outcome_event_id'),
 actor_id: text('actor_id').notNull(),
 action: text('action').notNull(),
 content: text('content').notNull(),
 next_review_date: text('next_review_date'),
 created_at: text('created_at').notNull()
});
