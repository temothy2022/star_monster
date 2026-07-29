type ApiPerformanceMetric = {
  path: string;
  normalizedPath: string;
  operation: string;
  method: string;
  status: number;
  requestId: string | null;
  startedAt: number;
  totalMs: number;
  serverMs: number | null;
  clientOverheadMs: number | null;
  ttfbMs: number | null;
  downloadMs: number | null;
  transferSize: number | null;
};

type NetworkInformation = {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
};

const navigationStartedAt = new Map<string, number>();
const latestApiMetrics = new Map<string, ApiPerformanceMetric>();
const pendingMetrics: Array<Record<string, unknown>> = [];
const moduleLoadedAt = now();
let startupReported = false;
let metricFlushTimer: number | null = null;
let metricFlushInProgress = false;

const MAIN_READ_PATHS = new Set([
  "/api/child/tasks/today",
  "/api/child/planets",
  "/api/child/wishes",
  "/api/child/footprints",
]);

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function roundDuration(value: number | null) {
  return value === null ? null : Math.round(value * 10) / 10;
}

export function normalizeApiPath(path: string) {
  const pathname = path.split("?")[0];
  return pathname
    .replace(
      /^\/api\/child\/attempts\/[^/]+\/(pause|resume|abandon|complete)$/,
      "/api/child/attempts/:id/$1",
    )
    .replace(
      /^\/api\/child\/tasks\/[^/]+\/start$/,
      "/api/child/tasks/:id/start",
    )
    .replace(
      /^\/api\/child\/(hanzi|poems)\/sessions\/[^/]+\/([^/]+)$/,
      "/api/child/$1/sessions/:id/$2",
    )
    .replace(
      /^\/api\/child\/wishes\/[^/]+\/redeem$/,
      "/api/child/wishes/:id/redeem",
    );
}

function operationFor(path: string) {
  const operations: Record<string, string> = {
    "/api/child/tasks/today": "load_tasks",
    "/api/child/planets": "load_planets",
    "/api/child/wishes": "load_wishes",
    "/api/child/footprints": "load_footprints",
    "/api/child/tasks/:id/start": "start_task",
    "/api/child/attempts/:id/pause": "pause_task",
    "/api/child/attempts/:id/resume": "resume_task",
    "/api/child/attempts/:id/abandon": "abandon_task",
    "/api/child/attempts/:id/complete": "complete_task",
    "/api/child/hanzi/sessions/start": "start_hanzi_session",
    "/api/child/poems/sessions/start": "start_poem_session",
    "/api/child/hanzi/sessions/:id/review": "save_hanzi_review",
    "/api/child/hanzi/sessions/:id/learn": "save_hanzi_character",
    "/api/child/hanzi/sessions/:id/answer": "save_hanzi_answer",
    "/api/child/hanzi/sessions/:id/finish": "complete_hanzi_task",
    "/api/child/poems/sessions/:id/finish": "complete_poem_task",
    "/api/child/poems/sessions/:id/learn": "complete_poem_learning",
  };
  return operations[path] ?? "child_api_request";
}

function getResourceTiming(path: string, startedAt: number) {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByName !== "function"
  ) {
    return null;
  }

  const url = new URL(path, window.location.href).href;
  const entries = performance.getEntriesByName(url, "resource") as PerformanceResourceTiming[];
  const entry = entries
    .map((candidate) => ({
      candidate,
      distance: Math.abs(candidate.startTime - startedAt),
    }))
    .filter(({ distance }) => distance <= 250)
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
  if (!entry) return null;

  return {
    totalMs:
      entry.responseEnd > 0
        ? Math.max(0, entry.responseEnd - entry.startTime)
        : null,
    ttfbMs:
      entry.responseStart > 0
        ? Math.max(0, entry.responseStart - entry.startTime)
        : null,
    downloadMs:
      entry.responseEnd > 0 && entry.responseStart > 0
        ? Math.max(0, entry.responseEnd - entry.responseStart)
        : null,
    transferSize: entry.transferSize || null,
  };
}

function clientContext() {
  const connection = (
    navigator as Navigator & { connection?: NetworkInformation }
  ).connection;
  return {
    route: window.location.hash || null,
    visibilityState: document.visibilityState,
    online: navigator.onLine,
    connection: connection
      ? {
          effectiveType: connection.effectiveType ?? null,
          rtt: connection.rtt ?? null,
          downlink: connection.downlink ?? null,
        }
      : undefined,
  };
}

function scheduleMetricFlush(delayMs = 3_000) {
  if (metricFlushTimer !== null) return;
  metricFlushTimer = window.setTimeout(() => {
    metricFlushTimer = null;
    void flushPerformanceMetrics();
  }, delayMs);
}

async function flushPerformanceMetrics() {
  if (metricFlushInProgress || pendingMetrics.length === 0) return;
  metricFlushInProgress = true;
  const metrics = pendingMetrics.splice(0, 30);

  try {
    const response = await fetch("/api/child/telemetry/performance", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics }),
      keepalive: true,
    });
    if (!response.ok) throw new Error("Performance telemetry was rejected");
  } catch {
    pendingMetrics.unshift(...metrics);
    if (pendingMetrics.length > 100) {
      pendingMetrics.splice(0, pendingMetrics.length - 100);
    }
  } finally {
    metricFlushInProgress = false;
    if (pendingMetrics.length > 0) scheduleMetricFlush(5_000);
  }
}

function sendPerformanceMetric(payload: Record<string, unknown>) {
  pendingMetrics.push({ ...payload, ...clientContext() });
  if (pendingMetrics.length >= 10) {
    if (metricFlushTimer !== null) {
      window.clearTimeout(metricFlushTimer);
      metricFlushTimer = null;
    }
    void flushPerformanceMetrics();
    return;
  }
  scheduleMetricFlush();
}

function resourceMetric(
  operation: string,
  entry: PerformanceResourceTiming | PerformanceNavigationTiming,
) {
  const startedAt = entry.requestStart || entry.startTime;
  const responseStartedAt = entry.responseStart;
  sendPerformanceMetric({
    kind: "startup",
    operation,
    path: new URL(entry.name, window.location.href).pathname,
    totalMs: roundDuration(entry.responseEnd - entry.startTime),
    clientOverheadMs: roundDuration(entry.responseEnd - startedAt),
    ttfbMs: roundDuration(
      responseStartedAt > 0 ? responseStartedAt - startedAt : null,
    ),
    downloadMs: roundDuration(
      entry.responseEnd > 0 && responseStartedAt > 0
        ? entry.responseEnd - responseStartedAt
        : null,
    ),
    transferSize: entry.transferSize || null,
  });
}

function shouldReportApi(metric: ApiPerformanceMetric) {
  const isCompletion = metric.operation.startsWith("complete_");
  const isSlow = metric.totalMs >= 400;
  const failed = metric.status === 0 || metric.status >= 400;
  const sampledMainRead =
    MAIN_READ_PATHS.has(metric.normalizedPath) && Math.random() < 0.02;
  return isCompletion || isSlow || failed || sampledMainRead;
}

export function recordApiPerformance(input: {
  path: string;
  method: string;
  status: number;
  requestId: string | null;
  startedAt: number;
  totalMs: number;
  serverMs: number | null;
}) {
  if (input.path.startsWith("/api/child/telemetry/")) return;

  const normalizedPath = normalizeApiPath(input.path);
  const resource = getResourceTiming(input.path, input.startedAt);
  const browserAfterResponseMs =
    resource?.totalMs === null || resource?.totalMs === undefined
      ? null
      : Math.max(0, input.totalMs - resource.totalMs);
  const metric: ApiPerformanceMetric = {
    ...input,
    normalizedPath,
    operation: operationFor(normalizedPath),
    clientOverheadMs:
      input.serverMs === null
        ? null
        : Math.max(
            0,
            (resource?.totalMs ?? input.totalMs) - input.serverMs,
          ),
    ttfbMs: resource?.ttfbMs ?? null,
    downloadMs: resource?.downloadMs ?? null,
    transferSize: resource?.transferSize ?? null,
  };

  latestApiMetrics.set(normalizedPath, metric);
  if (!shouldReportApi(metric)) return;

  sendPerformanceMetric({
    kind: "api",
    operation: metric.operation,
    path: metric.normalizedPath,
    method: metric.method,
    status: metric.status,
    requestId: metric.requestId,
    totalMs: roundDuration(metric.totalMs),
    serverMs: roundDuration(metric.serverMs),
    clientOverheadMs: roundDuration(metric.clientOverheadMs),
    apiTotalMs: roundDuration(resource?.totalMs ?? metric.totalMs),
    nonApiMs: roundDuration(browserAfterResponseMs),
    ttfbMs: roundDuration(metric.ttfbMs),
    downloadMs: roundDuration(metric.downloadMs),
    transferSize: metric.transferSize,
  });
}

export function markChildNavigation(route: string) {
  navigationStartedAt.set(route, now());
}

export function reportChildRouteRendered(route: string) {
  const startedAt = navigationStartedAt.get(route);
  if (startedAt === undefined) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sendPerformanceMetric({
        kind: "route",
        operation: `render_${route}`,
        path: window.location.hash || `#${route}`,
        totalMs: roundDuration(Math.max(0, now() - startedAt)),
      });
    });
  });
}

export function reportChildAppStartupReady(apiPath: string) {
  if (startupReported || moduleLoadedAt > 30_000) return;
  startupReported = true;

  const navigation = performance.getEntriesByType(
    "navigation",
  )[0] as PerformanceNavigationTiming | undefined;
  if (navigation) resourceMetric("startup_html", navigation);

  const resources = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  const mainScript = resources.find(
    (entry) =>
      entry.initiatorType === "script" &&
      /\/assets\/index-[^/]+\.js(?:$|\?)/.test(entry.name),
  );
  const mainStyles = resources.find(
    (entry) =>
      entry.initiatorType === "link" &&
      /\/assets\/index-[^/]+\.css(?:$|\?)/.test(entry.name),
  );
  if (mainScript) resourceMetric("startup_main_js", mainScript);
  if (mainStyles) resourceMetric("startup_main_css", mainStyles);

  const firstContentfulPaint = performance
    .getEntriesByType("paint")
    .find((entry) => entry.name === "first-contentful-paint");
  if (firstContentfulPaint) {
    sendPerformanceMetric({
      kind: "startup",
      operation: "startup_first_contentful_paint",
      path: "/",
      totalMs: roundDuration(firstContentfulPaint.startTime),
      nonApiMs: roundDuration(firstContentfulPaint.startTime),
    });
  }

  sendPerformanceMetric({
    kind: "startup",
    operation: "startup_module_loaded",
    path: "/",
    totalMs: roundDuration(moduleLoadedAt),
    nonApiMs: roundDuration(moduleLoadedAt),
  });

  const readyAt = now();
  const apiMetric = latestApiMetrics.get(normalizeApiPath(apiPath));
  sendPerformanceMetric({
    kind: "startup",
    operation: "startup_tasks_ready",
    path: normalizeApiPath(apiPath),
    requestId: apiMetric?.requestId ?? null,
    totalMs: roundDuration(readyAt),
    serverMs: roundDuration(apiMetric?.serverMs ?? null),
    clientOverheadMs: roundDuration(apiMetric?.clientOverheadMs ?? null),
    apiTotalMs: roundDuration(apiMetric?.totalMs ?? null),
    nonApiMs: roundDuration(
      apiMetric ? Math.max(0, readyAt - apiMetric.totalMs) : readyAt,
    ),
    ttfbMs: roundDuration(apiMetric?.ttfbMs ?? null),
    downloadMs: roundDuration(apiMetric?.downloadMs ?? null),
    transferSize: apiMetric?.transferSize ?? null,
  });
}

export function reportChildPageReady(route: string, apiPath: string) {
  const startedAt = navigationStartedAt.get(route);
  if (startedAt === undefined) return;
  navigationStartedAt.delete(route);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const totalMs = Math.max(0, now() - startedAt);
      const apiMetric = latestApiMetrics.get(normalizeApiPath(apiPath));
      const relatedApi =
        apiMetric && apiMetric.startedAt >= startedAt ? apiMetric : null;
      const apiTotalMs = relatedApi?.totalMs ?? null;

      sendPerformanceMetric({
        kind: "navigation",
        operation: `open_${route}`,
        path: normalizeApiPath(apiPath),
        requestId: relatedApi?.requestId ?? null,
        totalMs: roundDuration(totalMs),
        serverMs: roundDuration(relatedApi?.serverMs ?? null),
        clientOverheadMs: roundDuration(relatedApi?.clientOverheadMs ?? null),
        apiTotalMs: roundDuration(apiTotalMs),
        nonApiMs: roundDuration(
          apiTotalMs === null ? null : Math.max(0, totalMs - apiTotalMs),
        ),
        ttfbMs: roundDuration(relatedApi?.ttfbMs ?? null),
        downloadMs: roundDuration(relatedApi?.downloadMs ?? null),
        transferSize: relatedApi?.transferSize ?? null,
      });
    });
  });
}
