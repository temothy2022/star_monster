export type PerformanceMetricRecord = {
  id: string;
  childId?: string;
  childNickname?: string | null;
  familyName?: string | null;
  kind: string;
  operation: string;
  path: string;
  method?: string | null;
  status: number | null;
  requestId: string | null;
  totalMs: number;
  serverMs: number | null;
  clientOverheadMs: number | null;
  apiTotalMs: number | null;
  nonApiMs: number | null;
  ttfbMs?: number | null;
  downloadMs?: number | null;
  transferSize?: number | null;
  visibilityState?: string | null;
  online?: boolean | null;
  effectiveType: string | null;
  connectionRttMs: number | null;
  downlinkMbps: number | null;
  createdAt: Date;
};

export type PerformanceDiagnosis = "server" | "network" | "frontend" | "mixed";

const SLOW_EVENT_MS = 1_000;

function average(values: Array<number | null | undefined>) {
  const present = values.filter(
    (value): value is number => value !== null && value !== undefined,
  );
  if (!present.length) return null;
  return (
    Math.round(
      (present.reduce((sum, value) => sum + value, 0) / present.length) * 10,
    ) / 10
  );
}

function isFailure(metric: PerformanceMetricRecord) {
  return metric.status === 0 || (metric.status ?? 200) >= 400;
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

function isExpectedAuthenticationMetric(metric: PerformanceMetricRecord) {
  return (
    metric.kind === "api" &&
    metric.status === 401 &&
    (metric.path === "/api/child/me" ||
      metric.path.startsWith("/api/child/auth/"))
  );
}

export function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  );
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
    kind: metrics[0]?.kind ?? "unknown",
    samples: metrics.length,
    averageMs: average(metrics.map((metric) => metric.totalMs)),
    p50Ms: percentile(metrics.map((metric) => metric.totalMs), 50),
    p95Ms: percentile(metrics.map((metric) => metric.totalMs), 95),
    slowCount: metrics.filter((metric) => metric.totalMs >= SLOW_EVENT_MS).length,
    failureCount: metrics.filter(isFailure).length,
    serverAverageMs: average(metrics.map((metric) => metric.serverMs)),
    networkAverageMs: average(
      metrics.map((metric) => metric.clientOverheadMs),
    ),
    frontendAverageMs: average(metrics.map((metric) => metric.nonApiMs)),
  };
}

function summarizeOperations(metrics: PerformanceMetricRecord[]) {
  const byOperation = new Map<string, PerformanceMetricRecord[]>();
  for (const metric of metrics) {
    const group = byOperation.get(metric.operation) ?? [];
    group.push(metric);
    byOperation.set(metric.operation, group);
  }
  return [...byOperation.entries()]
    .map(([operation, group]) => summarizeOperation(operation, group))
    .sort((left, right) => {
      if (right.failureCount !== left.failureCount) {
        return right.failureCount - left.failureCount;
      }
      return (right.p95Ms ?? 0) - (left.p95Ms ?? 0);
    });
}

function buildRecommendations(input: {
  navigation: PerformanceMetricRecord[];
  api: PerformanceMetricRecord[];
  media: PerformanceMetricRecord[];
  runtime: PerformanceMetricRecord[];
}) {
  const recommendations: Array<{
    level: "good" | "watch" | "action";
    title: string;
    detail: string;
  }> = [];
  const pageP95 = percentile(input.navigation.map((item) => item.totalMs), 95);
  const serverAverage = average(input.navigation.map((item) => item.serverMs));
  const networkAverage = average(
    input.navigation.map((item) => item.clientOverheadMs),
  );
  const frontendAverage = average(input.navigation.map((item) => item.nonApiMs));
  const apiFailures = input.api.filter(isFailure).length;
  const mediaFailures = input.media.filter(isFailure).length;

  if (input.navigation.length < 20) {
    recommendations.push({
      level: "watch",
      title: "页面样本仍较少",
      detail: "建议至少积累 20 次页面打开后，再根据 P95 判断长期趋势。",
    });
  }
  if ((pageP95 ?? 0) >= 1_500) {
    const dominant = [
      { label: "服务端", value: serverAverage ?? 0 },
      { label: "网络", value: networkAverage ?? 0 },
      { label: "前端", value: frontendAverage ?? 0 },
    ].sort((left, right) => right.value - left.value)[0];
    recommendations.push({
      level: "action",
      title: `页面 P95 偏高，优先检查${dominant.label}`,
      detail: `当前页面 P95 为 ${Math.round(pageP95 ?? 0)} ms，${dominant.label}平均耗时在三段中最高。`,
    });
  }
  if (apiFailures > 0) {
    recommendations.push({
      level: "action",
      title: "存在接口失败",
      detail: `当前范围记录到 ${apiFailures} 次接口失败，请按操作和请求编号检查服务端日志。`,
    });
  }
  if (mediaFailures > 0) {
    recommendations.push({
      level: "action",
      title: "存在图片或音频降级",
      detail: `当前范围记录到 ${mediaFailures} 次媒体失败或回退，需核对资源地址和缓存命中。`,
    });
  }
  if (input.runtime.length > 0) {
    recommendations.push({
      level: "action",
      title: "存在页面运行错误",
      detail: `发现 ${input.runtime.length} 次资源块加载或渲染失败，发布版本与浏览器缓存需要重点核对。`,
    });
  }
  if (
    recommendations.length === 0 ||
    (recommendations.length === 1 && recommendations[0]?.level === "watch")
  ) {
    recommendations.push({
      level: "good",
      title: "当前没有明确性能异常",
      detail: "继续观察页面 P95、接口失败和媒体回退趋势即可。",
    });
  }
  return recommendations;
}

export function buildPerformanceDashboard(
  records: PerformanceMetricRecord[],
  days: number,
  timeZone: string,
) {
  const usableRecords = records.filter(
    (metric) =>
      !isLegacyAbsoluteStartupMetric(metric) &&
      !isExpectedAuthenticationMetric(metric),
  );
  const navigation = usableRecords.filter((metric) => metric.kind === "navigation");
  const api = usableRecords.filter((metric) => metric.kind === "api");
  const completions = api.filter((metric) =>
    metric.operation.startsWith("complete_"),
  );
  const interactions = api.filter(
    (metric) =>
      (Boolean(metric.method) && metric.method !== "GET") ||
      metric.operation.startsWith("complete_"),
  );
  const media = usableRecords.filter((metric) => metric.kind === "media");
  const startup = usableRecords.filter((metric) => metric.kind === "startup");
  const routeRenders = usableRecords.filter((metric) => metric.kind === "route");
  const runtime = usableRecords.filter((metric) => metric.kind === "runtime");

  // Only navigation and explicit task completion represent waits the child
  // necessarily experienced. Resource diagnostics remain visible separately.
  const experienceEvents = [...navigation, ...completions];
  const slowExperienceEvents = experienceEvents.filter(
    (metric) => metric.totalMs >= SLOW_EVENT_MS || isFailure(metric),
  );
  const failureEvents = [...api, ...media, ...runtime].filter(isFailure);
  const recentSlowEvents = [...slowExperienceEvents, ...failureEvents]
    .filter((metric, index, all) => all.findIndex((item) => item.id === metric.id) === index)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const pageSlowCount = navigation.filter(
    (metric) => metric.totalMs >= SLOW_EVENT_MS,
  ).length;
  const diagnosis = { server: 0, network: 0, frontend: 0, mixed: 0 };
  for (const metric of slowExperienceEvents) {
    diagnosis[diagnosePerformanceMetric(metric)] += 1;
  }

  const byDate = new Map<string, PerformanceMetricRecord[]>();
  for (const metric of navigation) {
    const key = dateKey(metric.createdAt, timeZone);
    const group = byDate.get(key) ?? [];
    group.push(metric);
    byDate.set(key, group);
  }

  const byNetwork = new Map<string, PerformanceMetricRecord[]>();
  for (const metric of navigation) {
    const key = metric.effectiveType || "unknown";
    const group = byNetwork.get(key) ?? [];
    group.push(metric);
    byNetwork.set(key, group);
  }

  const interactionFailureCount = interactions.filter(isFailure).length;
  return {
    days,
    childCount: new Set(
      records
        .map((metric) => metric.childId)
        .filter((childId): childId is string => Boolean(childId)),
    ).size,
    collectedFrom: records.at(-1)?.createdAt ?? null,
    collectedTo: records[0]?.createdAt ?? null,
    dataQuality: {
      receivedCount: records.length,
      usableCount: usableRecords.length,
      ignoredNoiseCount: records.length - usableRecords.length,
      navigationCount: navigation.length,
      apiCount: api.length,
      mediaCount: media.length,
      startupCount: startup.length,
      runtimeFailureCount: runtime.length,
    },
    summary: {
      pageOpenCount: navigation.length,
      slowPageCount: pageSlowCount,
      slowPageRate: navigation.length
        ? Math.round((pageSlowCount / navigation.length) * 1_000) / 10
        : 0,
      pageOpenAverageMs: average(navigation.map((metric) => metric.totalMs)),
      pageOpenP50Ms: percentile(navigation.map((metric) => metric.totalMs), 50),
      pageOpenP95Ms: percentile(navigation.map((metric) => metric.totalMs), 95),
      serverAverageMs: average(navigation.map((metric) => metric.serverMs)),
      networkAverageMs: average(
        navigation.map((metric) => metric.clientOverheadMs),
      ),
      frontendAverageMs: average(navigation.map((metric) => metric.nonApiMs)),
      completionAverageMs: average(completions.map((metric) => metric.totalMs)),
      completionP95Ms: percentile(completions.map((metric) => metric.totalMs), 95),
      completionCount: completions.length,
      interactionCount: interactions.length,
      interactionP95Ms: percentile(interactions.map((metric) => metric.totalMs), 95),
      interactionFailureCount,
      interactionFailureRate: interactions.length
        ? Math.round((interactionFailureCount / interactions.length) * 1_000) / 10
        : 0,
      mediaFailureCount: media.filter(isFailure).length,
      runtimeFailureCount: runtime.length,
    },
    diagnosis,
    operations: summarizeOperations(usableRecords),
    pageOperations: summarizeOperations(navigation),
    interactionOperations: summarizeOperations(interactions),
    diagnosticOperations: summarizeOperations([
      ...startup,
      ...routeRenders,
      ...media,
      ...runtime,
    ]),
    networkBreakdown: [...byNetwork.entries()]
      .map(([network, metrics]) => ({
        network,
        samples: metrics.length,
        averageMs: average(metrics.map((metric) => metric.totalMs)),
        p95Ms: percentile(metrics.map((metric) => metric.totalMs), 95),
        averageRttMs: average(metrics.map((metric) => metric.connectionRttMs)),
        averageDownlinkMbps: average(metrics.map((metric) => metric.downlinkMbps)),
      }))
      .sort((left, right) => right.samples - left.samples),
    trend: [...byDate.entries()]
      .map(([date, metrics]) => {
        const slowCount = metrics.filter(
          (metric) => metric.totalMs >= SLOW_EVENT_MS,
        ).length;
        return {
          date,
          samples: metrics.length,
          averageMs: average(metrics.map((metric) => metric.totalMs)),
          p50Ms: percentile(metrics.map((metric) => metric.totalMs), 50),
          p95Ms: percentile(metrics.map((metric) => metric.totalMs), 95),
          slowCount,
          slowRate: metrics.length
            ? Math.round((slowCount / metrics.length) * 1_000) / 10
            : 0,
        };
      })
      .sort((left, right) => left.date.localeCompare(right.date)),
    recommendations: buildRecommendations({ navigation, api, media, runtime }),
    recentSlowEvents: recentSlowEvents.slice(0, 50).map((metric) => ({
      ...metric,
      diagnosis: diagnosePerformanceMetric(metric),
    })),
  };
}
