CREATE TABLE task_images (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES desk_tasks(id) ON DELETE CASCADE,
  content_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX task_images_task ON task_images(workspace_id, task_id);
