import { describe, expect, it } from "vitest";
import { shouldRefreshChildSession } from "../src/services/auth-service.js";

describe("child session refresh throttling", () => {
  const now = new Date("2026-08-11T08:00:00.000Z");

  it("does not write the session again during parallel dashboard reads", () => {
    expect(shouldRefreshChildSession(
      new Date("2026-08-11T07:58:00.000Z"),
      now,
    )).toBe(false);
  });

  it("refreshes the sliding session after five minutes", () => {
    expect(shouldRefreshChildSession(
      new Date("2026-08-11T07:55:00.000Z"),
      now,
    )).toBe(true);
  });
});
