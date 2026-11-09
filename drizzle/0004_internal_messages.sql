CREATE TABLE message_threads (
 id TEXT PRIMARY KEY NOT NULL,
 workspace_id TEXT NOT NULL,
 endpoint_a TEXT NOT NULL,
 endpoint_b TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(workspace_id,endpoint_a,endpoint_b)
);
CREATE INDEX message_threads_workspace ON message_threads(workspace_id);
CREATE TABLE message_items (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 thread_id TEXT NOT NULL REFERENCES message_threads(id),
 workspace_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 sender_key TEXT NOT NULL,
 body TEXT NOT NULL,
 project_id TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX message_items_thread ON message_items(thread_id,seq);
CREATE INDEX message_items_workspace ON message_items(workspace_id,seq);
CREATE TABLE message_reads (
 workspace_id TEXT NOT NULL,
 thread_id TEXT NOT NULL REFERENCES message_threads(id),
 member_id TEXT NOT NULL,
 last_seq INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(thread_id,member_id)
);
