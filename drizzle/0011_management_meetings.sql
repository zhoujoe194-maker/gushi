CREATE TABLE management_meetings (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL,
 region TEXT NOT NULL,
 data TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
CREATE INDEX management_meetings_scope ON management_meetings(workspace_id, region, updated_at);
