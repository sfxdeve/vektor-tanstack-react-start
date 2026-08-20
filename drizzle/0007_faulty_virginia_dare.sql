CREATE TABLE `eft_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`userId` text NOT NULL,
	`userEmail` text NOT NULL,
	`companyId` text NOT NULL,
	`companyName` text DEFAULT '' NOT NULL,
	`lookupKey` text NOT NULL,
	`packageName` text NOT NULL,
	`amount` integer NOT NULL,
	`credits` integer NOT NULL,
	`annualCredits` integer,
	`billingPeriod` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'awaiting_proof' NOT NULL,
	`proofPath` text,
	`proofContentType` text,
	`proofFilename` text,
	`rejectReason` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`confirmedAt` integer,
	`confirmedBy` text,
	`rejectedAt` integer,
	`rejectedBy` text,
	`creditsGranted` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eft_payments_reference_unique` ON `eft_payments` (`reference`);--> statement-breakpoint
CREATE INDEX `eft_userId_idx` ON `eft_payments` (`userId`);--> statement-breakpoint
CREATE INDEX `eft_companyId_idx` ON `eft_payments` (`companyId`);--> statement-breakpoint
CREATE INDEX `eft_status_idx` ON `eft_payments` (`status`);--> statement-breakpoint
CREATE INDEX `eft_createdAt_idx` ON `eft_payments` (`createdAt`);