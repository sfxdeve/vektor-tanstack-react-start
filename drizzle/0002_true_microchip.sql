ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX `user_role_idx` ON `user` (`role`);