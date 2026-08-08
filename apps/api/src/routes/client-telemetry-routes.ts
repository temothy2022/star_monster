import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { requireChild } from "../services/auth-service.js";

const nullableDuration = z.number().finite().min(0).max(300_000).nullable().optional();

const telemetrySchema = z.object({
  kind: z.enum([
    "api",
    "navigation",
    "route",
    "startup",
    "media",
    "runtime",
  ]),
  operation: z.string().trim().min(1).max(80),
  path: z.string().trim().min(1).max(160),
  method: z.string().trim().min(1).max(12).optional(),
  status: z.number().int().min(0).max(599).optional(),
  requestId: z.string().trim().max(120).nullable().optional(),
  totalMs: z.number().finite().min(0).max(300_000),
  serverMs: nullableDuration,
  clientOverheadMs: nullableDuration,
  apiTotalMs: nullableDuration,
  nonApiMs: nullableDuration,
  ttfbMs: nullableDuration,
  downloadMs: nullableDuration,
  transferSize: z.number().int().min(0).max(100_000_000).nullable().optional(),
  route: z.string().trim().max(100).nullable().optional(),
  visibilityState: z.enum(["hidden", "visible", "prerender"]).optional(),
  online: z.boolean().optional(),
  connection: z
    .object({
      effectiveType: z.string().trim().max(20).nullable(),
      rtt: z.number().finite().min(0).max(60_000).nullable(),
      downlink: z.number().finite().min(0).max(100_000).nullable(),
    })
    .optional(),
});

const telemetryPayloadSchema = z.union([
  telemetrySchema.transform((metric) => [metric]),
  z
    .object({
      metrics: z.array(telemetrySchema).min(1).max(30),
    })
    .transform(({ metrics }) => metrics),
]);

export async function registerClientTelemetryRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.post("/api/child/telemetry/performance", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const metrics = telemetryPayloadSchema.parse(request.body);
    const records = metrics.map((metric) => ({
        childId: child.id,
        kind: metric.kind,
        operation: metric.operation,
        path: metric.path,
        method: metric.method,
        status: metric.status,
        requestId: metric.requestId,
        totalMs: metric.totalMs,
        serverMs: metric.serverMs,
        clientOverheadMs: metric.clientOverheadMs,
        apiTotalMs: metric.apiTotalMs,
        nonApiMs: metric.nonApiMs,
        ttfbMs: metric.ttfbMs,
        downloadMs: metric.downloadMs,
        transferSize: metric.transferSize,
        route: metric.route,
        visibilityState: metric.visibilityState,
        online: metric.online,
        effectiveType: metric.connection?.effectiveType,
        connectionRttMs: metric.connection?.rtt,
        downlinkMbps: metric.connection?.downlink,
    }));

    await prisma.childPerformanceMetric.createMany({ data: records });

    const slowMetrics = metrics.filter(
      (metric) =>
        metric.totalMs >= 1_000 ||
        (metric.serverMs ?? 0) >= 750 ||
        metric.status === 0 ||
        (metric.status ?? 200) >= 400,
    );
    if (slowMetrics.length > 0) {
      request.log.warn(
        {
          event: "child_client_performance_batch",
          childId: child.id,
          metricCount: metrics.length,
          slowMetricCount: slowMetrics.length,
          slowMetrics,
        },
        "child client performance slow",
      );
    } else {
      request.log.debug(
        {
          event: "child_client_performance_batch",
          childId: child.id,
          metricCount: metrics.length,
        },
        "child client performance",
      );
    }
    return { ok: true };
  });
}
