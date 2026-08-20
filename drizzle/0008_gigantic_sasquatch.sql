CREATE TABLE `referral_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`referrer_user_id` text NOT NULL,
	`referee_user_id` text NOT NULL,
	`referrer_company_id` text NOT NULL,
	`credits_granted` integer NOT NULL,
	`type` text DEFAULT 'first_paid_subscription' NOT NULL,
	`plan_lookup_key` text,
	`trigger_reference` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`referrer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`referee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`referrer_company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `referral_rewards_referrer_idx` ON `referral_rewards` (`referrer_user_id`);--> statement-breakpoint
CREATE INDEX `referral_rewards_created_at_idx` ON `referral_rewards` (`created_at`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`referrer_user_id` text NOT NULL,
	`referee_user_id` text NOT NULL,
	`referee_email` text NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'signed_up' NOT NULL,
	`signup_bonus_granted` integer DEFAULT false NOT NULL,
	`referrer_first_paid_bonus_granted` integer DEFAULT false NOT NULL,
	`referrer_sub_bonus_granted` integer DEFAULT false NOT NULL,
	`capped_at` integer,
	`cap_reason` text,
	`pending_referrer_credits` integer,
	`pending_plan_lookup_key` text,
	`first_paid_at` integer,
	`first_paid_plan_lookup_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`referrer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`referee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `referrals_referrer_idx` ON `referrals` (`referrer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `referrals_referee_unique` ON `referrals` (`referee_user_id`);--> statement-breakpoint
CREATE INDEX `referrals_code_idx` ON `referrals` (`code`);--> statement-breakpoint
ALTER TABLE `user` ADD `referralCode` text;--> statement-breakpoint
ALTER TABLE `user` ADD `referredByUserId` text;--> statement-breakpoint
ALTER TABLE `user` ADD `referredByCode` text;--> statement-breakpoint
ALTER TABLE `user` ADD `referredAt` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `user_referral_code_unique` ON `user` (`referralCode`);