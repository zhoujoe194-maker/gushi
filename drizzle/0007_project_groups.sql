CREATE TABLE `message_participants` (
	`thread_id` text NOT NULL,
	`member_id` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`thread_id`, `member_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `message_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `message_participants_member` ON `message_participants` (`member_id`,`thread_id`);--> statement-breakpoint
ALTER TABLE `message_items` ADD `kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `message_threads` ADD `kind` text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `message_threads` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `message_threads` ADD `project_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `message_threads` ADD `created_by` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `message_threads` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `message_threads` ADD `last_mutation` text DEFAULT '' NOT NULL;