CREATE TABLE sales_records (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL,
 member_id TEXT NOT NULL REFERENCES members(id),
 region TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('activity','weekly','performance')),
 period TEXT NOT NULL,
 record_date TEXT NOT NULL,
 status TEXT NOT NULL,
 data TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id, member_id, kind, period)
);
CREATE INDEX sales_records_member ON sales_records(workspace_id,member_id,record_date);
CREATE INDEX sales_records_review ON sales_records(workspace_id,region,status);
