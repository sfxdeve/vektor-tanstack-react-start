CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`companyName` text NOT NULL,
	`cipcNum` text NOT NULL,
	`csdMaaaNum` text,
	`sarsTcsPin` text,
	`cidbCrsNum` text,
	`bbbeeLevel` integer,
	`contactEmail` text,
	`contactPhone` text,
	`authorisedSignatoryName` text,
	`authorisedSignatoryPosition` text,
	`bargainingCouncils` text,
	`preferredPppfaSystem` text,
	`alertsEnabled` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `companies_userId_idx` ON `companies` (`userId`);--> statement-breakpoint
ALTER TABLE `session` ADD `impersonatedBy` text;--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `banReason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `banExpires` integer;