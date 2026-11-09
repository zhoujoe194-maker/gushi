-- Keep explicit index names aligned with the maintained Drizzle schema.
CREATE UNIQUE INDEX message_items_id_unique ON message_items(id);
CREATE UNIQUE INDEX message_thread_endpoints ON message_threads(workspace_id,endpoint_a,endpoint_b);
