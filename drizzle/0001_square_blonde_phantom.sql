CREATE TABLE `robotAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`robotId` int NOT NULL,
	`type` enum('disconnect','emergency_stop','hardware_fault') NOT NULL,
	`message` text NOT NULL,
	`acknowledgedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `robotAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `robotCommands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`robotId` int NOT NULL,
	`operatorUserId` int NOT NULL,
	`command` varchar(120) NOT NULL,
	`result` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `robotCommands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `robotSecrets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`robotId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp,
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `robotSecrets_id` PRIMARY KEY(`id`),
	CONSTRAINT `robotSecrets_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `robotTelemetry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`robotId` int NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `robotTelemetry_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `robots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` enum('offline','online','fault','estopped') NOT NULL DEFAULT 'offline',
	`lastSeenAt` timestamp,
	`lastIp` varchar(64),
	`safetyLocked` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `robots_id` PRIMARY KEY(`id`)
);
