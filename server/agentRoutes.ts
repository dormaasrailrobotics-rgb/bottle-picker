import type { Express, Request, Response } from "express";
import { acknowledgeAgentCommand, authenticateAgent, pairAgent, receiveFrame, receiveHeartbeat, recordAlert, takeCommands } from "./bottlebot";

function bearer(req: Request) {
  const value = req.header("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}
function jsonBody(req: Request) {
  return (req.body && typeof req.body === "object") ? req.body as Record<string, unknown> : {};
}

export function registerAgentRoutes(app: Express) {
  app.post("/api/agent/pair", async (req, res) => {
    try {
      const body = jsonBody(req);
      const result = await pairAgent(String(body.code || ""), body.name ? String(body.name) : undefined);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Pairing failed" });
    }
  });

  app.post("/api/agent/heartbeat", async (req, res) => {
    const auth = await authenticateAgent(bearer(req));
    if (!auth) return res.status(401).json({ ok: false, error: "Invalid agent token" });
    const state = await receiveHeartbeat(auth.robot.id, jsonBody(req), req.ip);
    res.json({ ok: true, robotId: auth.robot.id, status: state.status, serverTime: Date.now() });
  });

  app.get("/api/agent/commands", async (req, res) => {
    const auth = await authenticateAgent(bearer(req));
    if (!auth) return res.status(401).json({ ok: false, error: "Invalid agent token" });
    res.json({ ok: true, commands: takeCommands(auth.robot.id) });
  });

  app.post("/api/agent/ack", async (req, res) => {
    const auth = await authenticateAgent(bearer(req));
    if (!auth) return res.status(401).json({ ok: false, error: "Invalid agent token" });
    const body = jsonBody(req);
    res.json(await acknowledgeAgentCommand(auth.robot.id, String(body.commandId || ""), body.result));
  });

  app.post("/api/agent/frame", async (req, res) => {
    const auth = await authenticateAgent(bearer(req));
    if (!auth) return res.status(401).json({ ok: false, error: "Invalid agent token" });
    const body = jsonBody(req);
    const frame = String(body.jpegBase64 || "");
    if (!frame || frame.length > 8_000_000) return res.status(413).json({ ok: false, error: "Invalid frame" });
    const detections = Array.isArray(body.detections) ? body.detections : undefined;
    res.json(await receiveFrame(auth.robot.id, frame, detections));
  });

  app.post("/api/agent/event", async (req, res) => {
    const auth = await authenticateAgent(bearer(req));
    if (!auth) return res.status(401).json({ ok: false, error: "Invalid agent token" });
    const body = jsonBody(req);
    const type = String(body.type || "");
    if (!["emergency_stop", "hardware_fault"].includes(type)) return res.status(400).json({ ok: false, error: "Unsupported event type" });
    await recordAlert(auth.robot.id, type as "emergency_stop" | "hardware_fault", String(body.message || type));
    res.json({ ok: true });
  });
}

export function registerHealthRoute(app: Express) {
  app.get("/api/health", (_req: Request, res: Response) => res.json({ ok: true, service: "bottlebot-command-center", time: Date.now() }));
}
