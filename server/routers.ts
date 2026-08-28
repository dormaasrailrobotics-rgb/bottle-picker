import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  ALLOWED_COMMANDS, createPairing, getHistory, getRobotState, listRobots, logCommand,
  validateCommand, enqueueCommand,
} from "./bottlebot";
import { getDb } from "./db";
import { robotAlerts } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { askAboutCamera, chatWithRobot } from "./nvidia";

const commandInput = z.object({ robotId: z.number().int().positive(), command: z.string().min(1).max(120), label: z.string().max(80).optional() });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  ai: router({
    chat: protectedProcedure.input(z.object({ robotId: z.number().int().positive(), message: z.string().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
      const state = await getRobotState(input.robotId, ctx.user.id);
      if (!state) throw new Error("Robot not found");
      const response = await chatWithRobot(input.message);
      let queued = null;
      if (response.command) {
        const command = validateCommand(response.command);
        if (["ESTOP", "STOP", "UNLOCK"].includes(command) || !state.safetyLocked) {
          queued = await enqueueCommand(input.robotId, command, command === "PICK" ? String(state.detections?.[0]?.label || "") : undefined);
          await logCommand(input.robotId, ctx.user.id, command, { ok: true, queued: true, source: "nvidia" }, queued.id);
        } else {
          await logCommand(input.robotId, ctx.user.id, command, { ok: false, error: "Safety lock is active", source: "nvidia" });
        }
      }
      return { ...response, queued };
    }),
    cameraQuestion: protectedProcedure.input(z.object({ robotId: z.number().int().positive(), prompt: z.string().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
      const state = await getRobotState(input.robotId, ctx.user.id);
      if (!state || !state.cameraJpeg) throw new Error("No live camera frame is available from this robot");
      return { answer: await askAboutCamera(state.cameraJpeg, input.prompt) };
    }),
  }),
  robot: router({
    list: protectedProcedure.query(({ ctx }) => listRobots(ctx.user.id)),
    state: protectedProcedure.input(z.object({ robotId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const state = await getRobotState(input.robotId, ctx.user.id);
      if (!state) throw new Error("Robot not found");
      return state;
    }),
    history: protectedProcedure.input(z.object({ robotId: z.number().int().positive() })).query(({ ctx, input }) => getHistory(input.robotId, ctx.user.id)),
    createPairing: protectedProcedure.input(z.object({ name: z.string().min(2).max(120) })).mutation(({ ctx, input }) => createPairing(ctx.user.id, input.name)),
    command: protectedProcedure.input(commandInput).mutation(async ({ ctx, input }) => {
      const command = validateCommand(input.command);
      const state = await getRobotState(input.robotId, ctx.user.id);
      if (!state) throw new Error("Robot not found");
      if (command !== "ESTOP" && command !== "STOP" && command !== "UNLOCK" && state.safetyLocked) {
        const result = { ok: false, error: "Safety lock is active" };
        await logCommand(input.robotId, ctx.user.id, command, result);
        return result;
      }
      const queued = await enqueueCommand(input.robotId, command, input.label);
      const result = { ok: true, queued: true, command, label: input.label, commandId: queued.id, acknowledgement: "Awaiting Raspberry Pi agent" };
      await logCommand(input.robotId, ctx.user.id, command, result, queued.id);
      return result;
    }),
    allowedCommands: protectedProcedure.query(() => ALLOWED_COMMANDS),
    alerts: protectedProcedure.input(z.object({ robotId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const state = await getRobotState(input.robotId, ctx.user.id);
      if (!state) throw new Error("Robot not found");
      const db = await getDb();
      if (!db) return [];
      return db.select().from(robotAlerts).where(eq(robotAlerts.robotId, input.robotId)).orderBy(desc(robotAlerts.id)).limit(30);
    }),
    acknowledgeAlert: adminProcedure.input(z.object({ alertId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (db) await db.update(robotAlerts).set({ acknowledgedAt: new Date() }).where(eq(robotAlerts.id, input.alertId));
      return { ok: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
