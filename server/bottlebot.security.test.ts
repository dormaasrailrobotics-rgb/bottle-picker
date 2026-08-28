import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { pairAgent } from "./bottlebot";

describe("BottleBot hosted security", () => {
  it("rejects unauthenticated robot listing", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.robot.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects invalid or expired pairing codes before issuing a token", async () => {
    await expect(pairAgent("BB-NOT-VALID")).rejects.toThrow("invalid or expired");
  });
});
