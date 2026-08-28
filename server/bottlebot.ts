import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { robotAlerts, robotCommands, robotSecrets, robotTelemetry, robots } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

export const ALLOWED_COMMANDS = [
  "FORWARD", "BACK", "LEFT", "RIGHT", "STOP", "ESTOP", "UNLOCK",
  "HOME", "OPEN GRIPPER", "CLOSE GRIPPER", "AUTO", "PICK",
] as const;
export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

type LiveRobot = {
  id: number;
  name: string;
  ownerUserId: number;
  status: "offline" | "online" | "fault" | "estopped";
  safetyLocked: boolean;
  lastSeenAt: number;
  lastIp?: string;
  telemetry: Record<string, unknown>;
  cameraJpeg?: string;
  detections: Array<Record<string, unknown>>;
  events: Array<{ id: string; type: string; message: string; at: number; result?: string }>;
};

const memory = new Map<number, LiveRobot>();
const pairingCodes = new Map<string, { ownerUserId: number; expiresAt: number }>();
const commandQueues = new Map<number, Array<{ id: string; command: AllowedCommand; label?: string; createdAt: number }>>();

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function randomToken(prefix: string) {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}
function getLive(robotId: number) {
  return memory.get(robotId);
}
function ensureLive(robotId: number, ownerUserId = 0, name = "BottleBot") {
  const existing = memory.get(robotId);
  if (existing) return existing;
  const created: LiveRobot = {
    id: robotId, name, ownerUserId, status: "offline", safetyLocked: true,
    lastSeenAt: 0, telemetry: {}, detections: [], events: [],
  };
  memory.set(robotId, created);
  return created;
}

export async function createPairing(ownerUserId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [robot] = await db.insert(robots).values({ ownerUserId, name, status: "offline", safetyLocked: 1 }).$returningId();
  const code = `BB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  pairingCodes.set(code, { ownerUserId, expiresAt: Date.now() + 10 * 60 * 1000 });
  ensureLive(robot.id, ownerUserId, name);
  return { robotId: robot.id, code, expiresAt: pairingCodes.get(code)!.expiresAt };
}

export async function pairAgent(code: string, name?: string) {
  const pending = pairingCodes.get(code);
  if (!pending || pending.expiresAt < Date.now()) throw new Error("Pairing code is invalid or expired");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(robots).where(eq(robots.ownerUserId, pending.ownerUserId)).orderBy(desc(robots.id)).limit(1);
  const robot = rows[0];
  if (!robot) throw new Error("Robot pairing record was not found");
  const token = randomToken("bbagent");
  await db.insert(robotSecrets).values({ robotId: robot.id, tokenHash: hash(token) });
  if (name && name !== robot.name) await db.update(robots).set({ name }).where(eq(robots.id, robot.id));
  pairingCodes.delete(code);
  ensureLive(robot.id, robot.ownerUserId, name || robot.name);
  return { robotId: robot.id, token, name: name || robot.name };
}

export async function authenticateAgent(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(robotSecrets).where(eq(robotSecrets.tokenHash, hash(token))).limit(1);
  const secret = rows[0];
  if (!secret || (secret.expiresAt && secret.expiresAt.getTime() < Date.now())) return null;
  await db.update(robotSecrets).set({ lastUsedAt: new Date() }).where(eq(robotSecrets.id, secret.id));
  const robotsFound = await db.select().from(robots).where(eq(robots.id, secret.robotId)).limit(1);
  const robot = robotsFound[0];
  if (!robot) return null;
  return { robot, live: ensureLive(robot.id, robot.ownerUserId, robot.name) };
}

export async function receiveHeartbeat(robotId: number, payload: Record<string, unknown>, ip?: string) {
  const live = ensureLive(robotId);
  const wasOffline = live.status === "offline";
  live.status = payload.fault ? "fault" : payload.estopped ? "estopped" : "online";
  live.lastSeenAt = Date.now(); live.lastIp = ip; live.telemetry = payload;
  if (typeof payload.safetyLocked === "boolean") live.safetyLocked = payload.safetyLocked;
  if (Array.isArray(payload.detections)) live.detections = payload.detections as Array<Record<string, unknown>>;
  const db = await getDb();
  if (db) {
    await db.update(robots).set({ status: live.status, lastSeenAt: new Date(), lastIp: ip, safetyLocked: live.safetyLocked ? 1 : 0 }).where(eq(robots.id, robotId));
    await db.insert(robotTelemetry).values({ robotId, payload: JSON.stringify(payload) });
  }
  if (payload.fault || payload.estopped || wasOffline) {
    const type = payload.fault ? "hardware_fault" : payload.estopped ? "emergency_stop" : null;
    if (type) await recordAlert(robotId, type, String(payload.fault || "Emergency stop reported by robot"));
  }
  return live;
}

export async function receiveFrame(robotId: number, jpegBase64: string, detections?: unknown[]) {
  const live = ensureLive(robotId);
  live.cameraJpeg = jpegBase64.replace(/^data:image\/jpeg;base64,/, "");
  if (Array.isArray(detections)) live.detections = detections as Array<Record<string, unknown>>;
  return { ok: true };
}

export async function recordAlert(robotId: number, type: "disconnect" | "emergency_stop" | "hardware_fault", message: string) {
  const live = ensureLive(robotId);
  const event = { id: crypto.randomUUID(), type, message, at: Date.now() };
  live.events.unshift(event); live.events = live.events.slice(0, 50);
  const db = await getDb();
  if (db) await db.insert(robotAlerts).values({ robotId, type, message });
  await notifyOwner({ title: `BottleBot ${type.replace("_", " ")}`, content: message }).catch(() => false);
}

export async function markDisconnects() {
  const now = Date.now();
  const stale: LiveRobot[] = [];
  memory.forEach(live => {
    if (live.status === "online" && now - live.lastSeenAt > 15_000) stale.push(live);
  });
  for (const live of stale) {
    live.status = "offline";
    await recordAlert(live.id, "disconnect", `${live.name} has not reported a heartbeat for 15 seconds.`);
    const db = await getDb();
    if (db) await db.update(robots).set({ status: "offline" }).where(eq(robots.id, live.id));
  }
}

export async function listRobots(ownerUserId: number) {
  const db = await getDb();
  if (!db) {
    const fallback: LiveRobot[] = [];
    memory.forEach(robot => { if (robot.ownerUserId === ownerUserId) fallback.push(robot); });
    return fallback;
  }
  const rows = await db.select().from(robots).where(eq(robots.ownerUserId, ownerUserId));
  return rows.map(row => ({ ...row, ...(getLive(row.id) || {}) }));
}

export async function getRobotState(robotId: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(robots).where(eq(robots.id, robotId)).limit(1);
  const row = rows[0];
  if (!row || row.ownerUserId !== ownerUserId) return null;
  return { ...row, ...(getLive(robotId) || ensureLive(robotId, ownerUserId, row.name)) };
}

export async function enqueueCommand(robotId: number, command: AllowedCommand, label?: string) {
  const queue = commandQueues.get(robotId) || [];
  const item = { id: crypto.randomUUID(), command, label, createdAt: Date.now() };
  queue.push(item); commandQueues.set(robotId, queue.slice(-30));
  return item;
}
export function takeCommands(robotId: number) {
  const queue = commandQueues.get(robotId) || [];
  commandQueues.set(robotId, []);
  return queue;
}
export async function acknowledgeAgentCommand(robotId: number, commandId: string, result: unknown) {
  const db = await getDb();
  if (db) await db.update(robotCommands).set({ result: JSON.stringify(result) }).where(eq(robotCommands.agentCommandId, commandId));
  const live = ensureLive(robotId);
  live.events.unshift({ id: commandId, type: "ack", message: "Agent acknowledgement", result: JSON.stringify(result), at: Date.now() });
  live.events = live.events.slice(0, 50);
  return { ok: true };
}

export async function logCommand(robotId: number, operatorUserId: number, command: string, result: unknown, agentCommandId?: string) {
  const db = await getDb();
  if (db) await db.insert(robotCommands).values({ robotId, operatorUserId, command, agentCommandId, result: JSON.stringify(result) });
  const live = ensureLive(robotId);
  live.events.unshift({ id: crypto.randomUUID(), type: "command", message: command, result: JSON.stringify(result), at: Date.now() });
  live.events = live.events.slice(0, 50);
}

export function validateCommand(command: string): AllowedCommand {
  const normalized = command.trim().toUpperCase() as AllowedCommand;
  if (!ALLOWED_COMMANDS.includes(normalized)) throw new Error("Command is not on the BottleBot safety allow-list");
  return normalized;
}

export async function getHistory(robotId: number, ownerUserId: number) {
  const state = await getRobotState(robotId, ownerUserId);
  if (!state) throw new Error("Robot not found");
  const db = await getDb();
  if (!db) return state.events;
  return db.select().from(robotCommands).where(eq(robotCommands.robotId, robotId)).orderBy(desc(robotCommands.id)).limit(30);
}
