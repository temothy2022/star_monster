import { describe, expect, it } from "vitest";
import {
  buildPerformanceDashboard,
  diagnosePerformanceMetric,
  type PerformanceMetricRecord,
} from "../src/domain/performance-metrics.js";

function metric(
  overrides: Partial<PerformanceMetricRecord> = {},
): PerformanceMetricRecord {
  return {
    id: "metric-1",
    kind: "navigation",
    operation: "open_planets",
    path: "/api/child/planets",
    status: 200,
    requestId: "request-1",
    totalMs: 1_200,
    serverMs: 800,
    clientOverheadMs: 100,
    apiTotalMs: 900,
    nonApiMs: 300,
    effectiveType: "4g",
    connectionRttMs: 50,
    downlinkMbps: 10,
    createdAt: new Date("2026-07-29T02:00:00.000Z"),
    ...overrides,
  };
}

describe("performance metrics", () => {
  it("classifies the dominant source of delay", () => {
    expect(diagnosePerformanceMetric(metric())).toBe("server");
    expect(
      diagnosePerformanceMetric(metric({ serverMs: 100, clientOverheadMs: 800 })),
    ).toBe("network");
    expect(
      diagnosePerformanceMetric(
        metric({ serverMs: 200, clientOverheadMs: 100, nonApiMs: 700 }),
      ),
    ).toBe("frontend");
  });

  it("builds page metrics without using sampled API reads in the page ratio", () => {
    const result = buildPerformanceDashboard(
      [
        metric(),
        metric({
          id: "metric-2",
          totalMs: 400,
          serverMs: 100,
          createdAt: new Date("2026-07-29T03:00:00.000Z"),
        }),
        metric({
          id: "metric-3",
          kind: "api",
          operation: "load_planets",
          totalMs: 1_500,
          createdAt: new Date("2026-07-29T04:00:00.000Z"),
        }),
      ],
      7,
      "Asia/Shanghai",
    );

    expect(result.summary.pageOpenCount).toBe(2);
    expect(result.summary.slowPageCount).toBe(1);
    expect(result.summary.slowPageRate).toBe(50);
    expect(result.summary.pageOpenP95Ms).toBe(1_200);
  });

  it("includes runtime failures in diagnostics even when their duration is zero", () => {
    const runtimeFailure = metric({
      id: "runtime-1",
      kind: "runtime",
      operation: "chunk_load_failed",
      path: "/assets/TimedTaskPages-old.js",
      status: 0,
      totalMs: 0,
      serverMs: null,
      clientOverheadMs: null,
      apiTotalMs: null,
      nonApiMs: null,
    });

    const result = buildPerformanceDashboard(
      [runtimeFailure],
      7,
      "Asia/Shanghai",
    );

    expect(result.operations).toEqual([
      expect.objectContaining({
        operation: "chunk_load_failed",
        samples: 1,
      }),
    ]);
    expect(result.recentSlowEvents).toEqual([
      expect.objectContaining({
        operation: "chunk_load_failed",
        status: 0,
      }),
    ]);
  });
});
