CREATE TABLE `compliance_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`docType` text NOT NULL,
	`fileName` text NOT NULL,
	`storageKey` text,
	`expiryDate` integer,
	`isCompliant` integer DEFAULT true NOT NULL,
	`bargainingCouncil` text,
	`extractedBbbeeLevel` integer,
	`extractedExpiryDate` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `compliance_company_idx` ON `compliance_documents` (`companyId`);--> statement-breakpoint
CREATE INDEX `compliance_docType_idx` ON `compliance_documents` (`docType`);--> statement-breakpoint
CREATE INDEX `compliance_expiry_idx` ON `compliance_documents` (`expiryDate`);--> statement-breakpoint
CREATE TABLE `sent_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`documentId` text NOT NULL,
	`threshold` integer NOT NULL,
	`sentAt` integer NOT NULL,
	`resendId` text,
	`toEmail` text,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`documentId`) REFERENCES `compliance_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sent_reminders_company_idx` ON `sent_reminders` (`companyId`);--> statement-breakpoint
CREATE INDEX `sent_reminders_document_idx` ON `sent_reminders` (`documentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `sent_reminders_unique` ON `sent_reminders` (`companyId`,`documentId`,`threshold`);