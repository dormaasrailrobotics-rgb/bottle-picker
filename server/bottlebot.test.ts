import { describe, expect, it } from "vitest";
import { validateCommand } from "./bottlebot";

describe("BottleBot command safety", () => {
  it("accepts only the explicit hardware command allow-list", () => {
    expect(validateCommand(" stop ")).toBe("STOP");
    expect(validateCommand("open gripper")).toBe("OPEN GRIPPER");
    expect(() => validateCommand("hi")).toThrow("safety allow-list");
    expect(() => validateCommand("run arbitrary code")).toThrow("safety allow-list");
  });
});
