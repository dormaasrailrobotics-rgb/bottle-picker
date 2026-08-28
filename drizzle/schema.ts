import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const robots = mysqlTable("robots", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["offline", "online", "fault", "estopped"]).default("offline").notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
  lastIp: varchar("lastIp", { length: 64 }),
  safetyLocked: int("safetyLocked").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const robotSecrets = mysqlTable("robotSecrets", {
  id: int("id").autoincrement().primaryKey(),
  robotId: int("robotId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt"),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const robotTelemetry = mysqlTable("robotTelemetry", {
  id: int("id").autoincrement().primaryKey(),
  robotId: int("robotId").notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const robotCommands = mysqlTable("robotCommands", {
  id: int("id").autoincrement().primaryKey(),
  robotId: int("robotId").notNull(),
  operatorUserId: int("operatorUserId").notNull(),
  command: varchar("command", { length: 120 }).notNull(),
  agentCommandId: varchar("agentCommandId", { length: 64 }),
  result: text("result"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const robotAlerts = mysqlTable("robotAlerts", {
  id: int("id").autoincrement().primaryKey(),
  robotId: int("robotId").notNull(),
  type: mysqlEnum("type", ["disconnect", "emergency_stop", "hardware_fault"]).notNull(),
  message: text("message").notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Robot = typeof robots.$inferSelect;
