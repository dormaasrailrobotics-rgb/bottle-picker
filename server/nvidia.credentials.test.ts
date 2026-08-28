import { describe, expect, it } from "vitest";

describe("NVIDIA NIM credential", () => {
  it("authenticates against the models endpoint if key present", async () => {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) {
      expect(key).toBeUndefined();
      return;
    }
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await response.text();
    expect(response.ok, `NVIDIA returned ${response.status}: ${body.slice(0, 300)}`).toBe(true);
  }, 20_000);
});
