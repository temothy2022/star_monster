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
    "/api/child/attempts/:id/complete": "complete_task",
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
  const entry = [...entries]
    .reverse()
    .find((candidate) => candidate.startTime >= startedAt - 2);
  if (!entry) return null;

  return {
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

function sendPerformanceMetric(payload: Record<string, unknown>) {
  void fetch("/api/child/telemetry/performance", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ...clientContext() }),
    keepalive: true,
  }).catch(() => undefined);
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
  const metric: ApiPerformanceMetric = {
    ...input,
    normalizedPath,
    operation: operationFor(normalizedPath),
    clientOverheadMs:
      input.serverMs === null
        ? null
        : Math.max(0, input.totalMs - input.serverMs),
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
    ttfbMs: roundDuration(metric.ttfbMs),
    downloadMs: roundDuration(metric.downloadMs),
    transferSize: metric.transferSize,
  });
}

export function markChildNavigation(route: string) {
  navigationStartedAt.set(route, now());
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
