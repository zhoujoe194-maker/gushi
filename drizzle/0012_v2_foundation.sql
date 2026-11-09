-- Additive V2 foundation. Existing JSON, credentials, IDs and history are untouched.
CREATE TABLE project_followups (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, content TEXT NOT NULL CHECK(length(trim(content))>0),
 next_followup_date TEXT, created_at TEXT NOT NULL, request_id TEXT NOT NULL,
 UNIQUE(workspace_id,request_id)
);
CREATE INDEX project_followups_timeline ON project_followups(workspace_id,project_id,created_at);
CREATE TABLE project_reason_categories (
 id TEXT NOT NULL, workspace_id TEXT NOT NULL, label TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE project_outcome_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 project_name TEXT NOT NULL, event_type TEXT NOT NULL CHECK(event_type IN ('paused','lost')),
 category_id TEXT NOT NULL, category_label TEXT NOT NULL,
 explanation TEXT NOT NULL CHECK(length(trim(explanation))>0),
 owner_member_id TEXT, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 review_due_date TEXT, data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX project_outcomes_owner ON project_outcome_events(workspace_id,owner_member_id,created_at);
CREATE TABLE project_outcome_revisions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, event_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE project_owner_history (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 previous_member_id TEXT, new_member_id TEXT, actor_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX project_owner_history_timeline ON project_owner_history(workspace_id,project_id,created_at);
CREATE TABLE project_management_reviews (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, outcome_event_id TEXT,
 actor_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('objection','request_details','reactivate','reviewed')),
 content TEXT NOT NULL, next_review_date TEXT, created_at TEXT NOT NULL
);
