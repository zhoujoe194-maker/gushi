-- SQLite requires rebuilding the table to extend its kind CHECK constraint.
-- Copy every stored field before swapping tables; preserve ids, history and versions.
CREATE TABLE sales_records_expanded (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL,
 member_id TEXT NOT NULL REFERENCES members(id),
 region TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('activity','weekly','monthly','performance')),
 period TEXT NOT NULL,
 record_date TEXT NOT NULL,
 status TEXT NOT NULL,
 data TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(workspace_id, member_id, kind, period)
);
INSERT INTO sales_records_expanded SELECT id,workspace_id,member_id,region,kind,period,record_date,status,data,version,created_at,updated_at FROM sales_records;
DROP TABLE sales_records;
ALTER TABLE sales_records_expanded RENAME TO sales_records;
CREATE INDEX sales_records_member ON sales_records(workspace_id,member_id,record_date);
CREATE INDEX sales_records_review ON sales_records(workspace_id,region,status);
