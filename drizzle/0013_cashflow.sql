-- Extends finance_books; no duplicate project ledger or historical rewrites.
CREATE TABLE finance_mutations (
 id TEXT NOT NULL, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE bank_transactions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, reference TEXT NOT NULL,
 data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(workspace_id,reference)
);
CREATE TABLE finance_company (
 workspace_id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE finance_project_grants (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, member_id TEXT NOT NULL,
 PRIMARY KEY(workspace_id,project_id,member_id)
);
CREATE TABLE finance_vouchers (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 reimbursement_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, content TEXT NOT NULL
);
