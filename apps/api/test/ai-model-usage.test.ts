import { describe, expect, it } from "vitest";
import {
  buildAiModelUsageDashboard,
  type AiModelCallRecord,
} from "../src/domain/ai-model-usage.js";

function call(overrides: Partial<AiModelCallRecord> = {}): AiModelCallRecord {
  return {
    provider: "DEEPSEEK",
    operation: "json-generation",
    model: "deepseek-v4-flash",
    status: "SUCCESS",
    durationMs: 500,
    promptTokens: 100,
    completionTokens: 40,
    totalTokens: 140,
    createdAt: new Date("2026-08-12T04:00:00.000Z"),
    ...overrides,
  };
}

describe("AI model usage dashboard", () => {
  it("aggregates providers, failures, operations, and daily trend", () => {
    const result = buildAiModelUsageDashboard(
      [
        call(),
        call({
          provider: "MINIMAX",
          operation: "speech-generation",
          model: "speech-2.8-turbo",
          status: "ERROR",
          totalTokens: null,
          createdAt: new Date("2026-08-12T05:00:00.000Z"),
        }),
      ],
      7,
      new Date("2026-08-13T04:00:00.000Z"),
    );

    expect(result.totals).toMatchObject({ calls: 2, success: 1, failed: 1, totalTokens: 140, successRate: 50 });
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "DEEPSEEK", calls: 1, success: 1 }),
      expect.objectContaining({ provider: "MINIMAX", calls: 1, failed: 1 }),
    ]));
    expect(result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "json-generation", calls: 1 }),
      expect.objectContaining({ operation: "speech-generation", calls: 1 }),
    ]));
    expect(result.trend.find((row) => row.date === "2026-08-12")).toMatchObject({ deepseek: 1, minimax: 1, calls: 2 });
  });

  it("keeps an empty date range chart usable", () => {
    const result = buildAiModelUsageDashboard([], 3, new Date("2026-08-13T04:00:00.000Z"));
    expect(result.totals.calls).toBe(0);
    expect(result.trend).toHaveLength(3);
    expect(result.trend.every((row) => row.calls === 0)).toBe(true);
  });
});
