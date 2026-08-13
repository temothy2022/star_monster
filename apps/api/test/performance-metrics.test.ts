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

  it("ignores legacy absolute startup readiness durations", () => {
    const result = buildPerformanceDashboard(
      [
        metric({
          id: "legacy-startup",
          kind: "startup",
          operation: "startup_tasks_ready",
          path: "/api/child/tasks/today",
          totalMs: 108_796,
          apiTotalMs: 16,
          serverMs: 16,
          clientOverheadMs: 9,
          nonApiMs: 108_770,
        }),
      ],
      30,
      "Asia/Shanghai",
    );

    expect(result.operations).toEqual([]);
    expect(result.recentSlowEvents).toEqual([]);
  });

  it("keeps slow startup resources out of user-perceived slow events", () => {
    const result = buildPerformanceDashboard(
      [
        metric({
          id: "startup-js",
          kind: "startup",
          operation: "startup_main_js",
          totalMs: 2_400,
          serverMs: null,
          clientOverheadMs: 2_100,
          nonApiMs: null,
        }),
      ],
      7,
      "Asia/Shanghai",
    );

    expect(result.summary.slowPageCount).toBe(0);
    expect(result.recentSlowEvents).toEqual([]);
    expect(result.diagnosticOperations).toEqual([
      expect.objectContaining({ operation: "startup_main_js", samples: 1 }),
    ]);
  });

  it("summarizes failed child interactions separately", () => {
    const result = buildPerformanceDashboard(
      [
        metric({
          id: "wish-failed",
          kind: "api",
          operation: "redeem_wish",
          method: "POST",
          status: 500,
          totalMs: 320,
          serverMs: 250,
          clientOverheadMs: 70,
          nonApiMs: 0,
        }),
      ],
      7,
      "Asia/Shanghai",
    );

    expect(result.summary.interactionFailureCount).toBe(1);
    expect(result.summary.interactionFailureRate).toBe(100);
    expect(result.interactionOperations).toEqual([
      expect.objectContaining({ operation: "redeem_wish", failureCount: 1 }),
    ]);
    expect(result.recentSlowEvents).toEqual([
      expect.objectContaining({ operation: "redeem_wish", status: 500 }),
    ]);
  });

  it("ignores expected unauthenticated session probes", () => {
    const result = buildPerformanceDashboard(
      [
        metric({
          id: "session-probe",
          kind: "api",
          operation: "child_api_request",
          path: "/api/child/me",
          method: "GET",
          status: 401,
          totalMs: 20,
        }),
      ],
      7,
      "Asia/Shanghai",
    );

    expect(result.dataQuality.usableCount).toBe(0);
    expect(result.dataQuality.ignoredNoiseCount).toBe(1);
    expect(result.recentSlowEvents).toEqual([]);
  });

  it("ignores requests interrupted while the page is hidden or offline", () => {
    const result = buildPerformanceDashboard(
      [
        metric({
          id: "hidden-interruption",
          kind: "api",
          operation: "load_tasks",
          method: "GET",
          status: 0,
          visibilityState: "hidden",
        }),
        metric({
          id: "offline-interruption",
          kind: "api",
          operation: "load_wishes",
          method: "GET",
          status: 0,
          online: false,
        }),
      ],
      7,
      "Asia/Shanghai",
    );

    expect(result.dataQuality.usableCount).toBe(0);
    expect(result.dataQuality.ignoredNoiseCount).toBe(2);
    expect(result.recentSlowEvents).toEqual([]);
  });

  it("does not treat stale task state conflicts as platform failures", () => {
    const result = buildPerformanceDashboard(
      [
        metric({
          id: "already-completed",
          kind: "api",
          operation: "complete_task",
          method: "POST",
          status: 409,
        }),
      ],
      7,
      "Asia/Shanghai",
    );

    expect(result.dataQuality.usableCount).toBe(0);
    expect(result.summary.interactionFailureCount).toBe(0);
  });

  it("ignores page timers that crossed an iPad browser suspension", () => {
    const result = buildPerformanceDashboard(
      [
        metric({
          id: "suspended-navigation",
          kind: "navigation",
          operation: "open_pet-growth",
          totalMs: 132_507,
          apiTotalMs: 34,
          serverMs: 25,
          clientOverheadMs: 9,
          nonApiMs: 132_473,
        }),
      ],
      7,
      "Asia/Shanghai",
    );

    expect(result.dataQuality.usableCount).toBe(0);
    expect(result.dataQuality.ignoredNoiseCount).toBe(1);
    expect(result.summary.slowPageCount).toBe(0);
  });
});
