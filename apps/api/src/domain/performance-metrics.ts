export type PerformanceMetricRecord = {
  id: string;
  childId?: string;
  childNickname?: string | null;
  familyName?: string | null;
  kind: string;
  operation: string;
  path: string;
  status: number | null;
  requestId: string | null;
  totalMs: number;
  serverMs: number | null;
  clientOverheadMs: number | null;
  apiTotalMs: number | null;
  nonApiMs: number | null;
  effectiveType: string | null;
  connectionRttMs: number | null;
  downlinkMbps: number | null;
  createdAt: Date;
};

export type PerformanceDiagnosis = "server" | "network" | "frontend" | "mixed";

const SLOW_EVENT_MS = 1_000;

function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  if (!present.length) return null;
  return Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 10) / 10;
}

function isLegacyAbsoluteStartupMetric(metric: PerformanceMetricRecord) {
  return (
    metric.kind === "startup" &&
    metric.operation === "startup_tasks_ready" &&
    metric.totalMs >= 30_000 &&
    (metric.apiTotalMs === null || (metric.apiTotalMs ?? 0) < 5_000) &&
    (metric.serverMs === null || (metric.serverMs ?? 0) < 1_000) &&
    (metric.clientOverheadMs === null ||
      (metric.clientOverheadMs ?? 0) < 1_000) &&
    (metric.nonApiMs ?? 0) >= metric.totalMs * 0.9
  );
}

export function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

export function diagnosePerformanceMetric(
  metric: PerformanceMetricRecord,
): PerformanceDiagnosis {
  const serverMs = metric.serverMs ?? 0;
  const networkMs = metric.clientOverheadMs ?? 0;
  const frontendMs = metric.nonApiMs ?? 0;

  if (serverMs >= Math.max(500, metric.totalMs * 0.5)) return "server";
  if (networkMs >= Math.max(500, metric.totalMs * 0.5)) return "network";
  if (frontendMs >= Math.max(350, metric.totalMs * 0.35)) return "frontend";
  return "mixed";
}

function dateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function summarizeOperation(operation: string, metrics: PerformanceMetricRecord[]) {
  return {
    operation,
    samples: metrics.length,
    averageMs: average(metrics.map((metric) => metric.totalMs)),
    p95Ms: percentile(metrics.map((metric) => metric.totalMs), 95),
    slowCount: metrics.filter((metric) => metric.totalMs >= SLOW_EVENT_MS).length,
    serverAverageMs: average(metrics.map((metric) => metric.serverMs)),
    networkAverageMs: average(metrics.map((metric) => metric.clientOverheadMs)),
    frontendAverageMs: average(metrics.map((metric) => metric.nonApiMs)),
  };
}

export function buildPerformanceDashboard(
  records: PerformanceMetricRecord[],
  days: number,
  timeZone: string,
) {
  const usableRecords = records.filter(
    (metric) => !isLegacyAbsoluteStartupMetric(metric),
  );
  const navigation = usableRecords.filter((metric) => metric.kind === "navigation");
  const completions = usableRecords.filter(
    (metric) => metric.kind === "api" && metric.operation.startsWith("complete_"),
  );
  const diagnostics = usableRecords.filter(
    (metric) =>
      metric.kind === "route" ||
      metric.kind === "startup" ||
      metric.kind === "runtime",
  );
  const experienceEvents = [...navigation, ...completions, ...diagnostics];
  const slowEvents = experienceEvents.filter(
    (metric) =>
      metric.totalMs >= SLOW_EVENT_MS ||
      metric.status === 0 ||
      (metric.status ?? 200) >= 400,
  );
  const pageSlowCount = navigation.filter((metric) => metric.totalMs >= SLOW_EVENT_MS).length;
  const diagnosis = { server: 0, network: 0, frontend: 0, mixed: 0 };

  for (const metric of slowEvents) {
    diagnosis[diagnosePerformanceMetric(metric)] += 1;
  }

  const byOperation = new Map<string, PerformanceMetricRecord[]>();
  for (const metric of experienceEvents) {
    const group = byOperation.get(metric.operation) ?? [];
    group.push(metric);
    byOperation.set(metric.operation, group);
  }

  const byDate = new Map<string, PerformanceMetricRecord[]>();
  for (const metric of navigation) {
    const key = dateKey(metric.createdAt, timeZone);
    const group = byDate.get(key) ?? [];
    group.push(metric);
    byDate.set(key, group);
  }

  return {
    days,
    childCount: new Set(
      records.map((metric) => metric.childId).filter((childId): childId is string => Boolean(childId)),
    ).size,
    collectedFrom: records.at(-1)?.createdAt ?? null,
    collectedTo: records[0]?.createdAt ?? null,
    summary: {
      pageOpenCount: navigation.length,
      slowPageCount: pageSlowCount,
      slowPageRate: navigation.length
        ? Math.round((pageSlowCount / navigation.length) * 1_000) / 10
        : 0,
      pageOpenAverageMs: average(navigation.map((metric) => metric.totalMs)),
      pageOpenP95Ms: percentile(navigation.map((metric) => metric.totalMs), 95),
      serverAverageMs: average(navigation.map((metric) => metric.serverMs)),
      networkAverageMs: average(navigation.map((metric) => metric.clientOverheadMs)),
      frontendAverageMs: average(navigation.map((metric) => metric.nonApiMs)),
      completionAverageMs: average(completions.map((metric) => metric.totalMs)),
      completionP95Ms: percentile(completions.map((metric) => metric.totalMs), 95),
      completionCount: completions.length,
    },
    diagnosis,
    operations: [...byOperation.entries()]
      .map(([operation, metrics]) => summarizeOperation(operation, metrics))
      .sort((left, right) => (right.p95Ms ?? 0) - (left.p95Ms ?? 0)),
    trend: [...byDate.entries()]
      .map(([date, metrics]) => ({
        date,
        samples: metrics.length,
        averageMs: average(metrics.map((metric) => metric.totalMs)),
        p95Ms: percentile(metrics.map((metric) => metric.totalMs), 95),
        slowCount: metrics.filter((metric) => metric.totalMs >= SLOW_EVENT_MS).length,
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    recentSlowEvents: slowEvents.slice(0, 50).map((metric) => ({
      ...metric,
      diagnosis: diagnosePerformanceMetric(metric),
    })),
  };
}
