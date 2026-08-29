import { describe, expect, it } from "vitest";
import { diagnoseAndSelfHeal } from "./nvidia";

describe("Autonomous AI Self-Healing Diagnostics", () => {
  it("provides fallback self-healing analysis when offline or without API key", async () => {
    const result = await diagnoseAndSelfHeal({
      status: "fault",
      telemetry: { fault: "Arduino USB serial port (/dev/ttyACM0) unavailable" },
      recentAlerts: [{ type: "hardware_fault", message: "Serial disconnect" }],
    });

    expect(result).toHaveProperty("diagnosis");
    expect(result).toHaveProperty("userRecommendation");
    expect(result).toHaveProperty("selfHealAction");
  });
});
