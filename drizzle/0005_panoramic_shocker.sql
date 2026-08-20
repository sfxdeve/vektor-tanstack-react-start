CREATE TABLE `tenders` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`tenderNumber` text,
	`title` text NOT NULL,
	`issuingEntity` text,
	`closingDate` text,
	`requiredCidbGrade` text,
	`preferencePointSystem` text DEFAULT '80/20' NOT NULL,
	`parsedReturnables` text,
	`fitScore` integer NOT NULL,
	`riskFlags` text,
	`eligibleBbbeePoints` real DEFAULT 0 NOT NULL,
	`returnableStatus` text,
	`pdfStorageKey` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenders_companyId_idx` ON `tenders` (`companyId`);--> statement-breakpoint
CREATE INDEX `tenders_createdAt_idx` ON `tenders` (`createdAt`);--> statement-breakpoint
CREATE TABLE `company_credits` (
	`companyId` text PRIMARY KEY NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
