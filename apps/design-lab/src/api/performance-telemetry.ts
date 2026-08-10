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
let metricRetryDelayMs = 5_000;

const METRIC_BATCH_SIZE = 30;
const MAX_PENDING_METRICS = 80;
const NORMAL_FLUSH_DELAY_MS = 8_000;
const MAX_RETRY_DELAY_MS = 60_000;
const FAST_READ_SAMPLE_RATE = 0.05;

const MAIN_READ_PATHS = new Set([
  "/api/child/tasks/today",
  "/api/child/pet",
  "/api/child/planets",
  "/api/child/wishes",
  "/api/child/footprints",
]);

const IMPORTANT_MUTATIONS = new Set([
  "start_task",
  "pause_task",
  "resume_task",
  "abandon_task",
  "complete_task",
  "start_hanzi_session",
  "complete_hanzi_task",
  "start_poem_session",
  "complete_poem_task",
  "complete_poem_learning",
  "start_clock_session",
  "complete_clock_task",
  "start_make_ten_session",
  "complete_make_ten_task",
  "redeem_wish",
  "feed_pet",
  "give_pet_water",
  "clean_pet_waste",
  "start_pet_trip",
  "reveal_postcard",
  "purchase_pet_room_theme",
  "select_pet_room_theme",
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
      /^\/api\/child\/(hanzi|poems|clock|make-ten)\/sessions\/[^/]+\/([^/]+)$/,
      "/api/child/$1/sessions/:id/$2",
    )
    .replace(
      /^\/api\/child\/wishes\/[^/]+\/redeem$/,
      "/api/child/wishes/:id/redeem",
    )
    .replace(
      /^\/api\/child\/pet\/(feed|drink)$/,
      "/api/child/pet/$1",
    )
    .replace(
      /^\/api\/child\/pet\/waste\/[^/]+\/clean$/,
      "/api/child/pet/waste/:id/clean",
    )
    .replace(
      /^\/api\/child\/pet\/trips\/[^/]+\/reveal$/,
      "/api/child/pet/trips/:id/reveal",
    )
    .replace(
      /^\/api\/child\/pet\/room-themes\/[^/]+\/(purchase|select)$/,
      "/api/child/pet/room-themes/:key/$1",
    )
    .replace(
      /^\/api\/child\/planets\/[^/]+\/(celebrated|notified)$/,
      "/api/child/planets/:planet/$1",
    );
}

function operationFor(path: string) {
  const operations: Record<string, string> = {
    "/api/child/tasks/today": "load_tasks",
    "/api/child/pet": "load_pet_growth",
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
    "/api/child/clock/sessions/start": "start_clock_session",
    "/api/child/hanzi/sessions/:id/review": "save_hanzi_review",
    "/api/child/hanzi/sessions/:id/learn": "save_hanzi_character",
    "/api/child/hanzi/sessions/:id/answer": "save_hanzi_answer",
    "/api/child/hanzi/sessions/:id/finish": "complete_hanzi_task",
    "/api/child/hanzi/sessions/:id/finalize": "complete_hanzi_task",
    "/api/child/poems/sessions/:id/finish": "complete_poem_task",
    "/api/child/poems/sessions/:id/learn": "complete_poem_learning",
    "/api/child/clock/sessions/:id/answer": "save_clock_answer",
    "/api/child/clock/sessions/:id/finish": "complete_clock_task",
    "/api/child/make-ten/sessions/start": "start_make_ten_session",
    "/api/child/make-ten/sessions/:id/answer": "save_make_ten_answer",
    "/api/child/make-ten/sessions/:id/finish": "complete_make_ten_task",
    "/api/child/poems/sessions/:id/review": "save_poem_review",
    "/api/child/wishes/:id/redeem": "redeem_wish",
    "/api/child/pet/feed": "feed_pet",
    "/api/child/pet/drink": "give_pet_water",
    "/api/child/pet/waste/:id/clean": "clean_pet_waste",
    "/api/child/pet/trips": "start_pet_trip",
    "/api/child/pet/trips/:id/reveal": "reveal_postcard",
    "/api/child/pet/room-themes/:key/purchase": "purchase_pet_room_theme",
    "/api/child/pet/room-themes/:key/select": "select_pet_room_theme",
    "/api/child/planets/:planet/celebrated": "celebrate_planet",
    "/api/child/planets/:planet/notified": "acknowledge_planet",
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

function scheduleMetricFlush(delayMs = NORMAL_FLUSH_DELAY_MS) {
  if (metricFlushTimer !== null) return;
  metricFlushTimer = window.setTimeout(() => {
    metricFlushTimer = null;
    void flushPerformanceMetrics();
  }, delayMs);
}

async function flushPerformanceMetrics() {
  if (
    metricFlushInProgress ||
    pendingMetrics.length === 0 ||
    !navigator.onLine
  ) {
    return;
  }
  metricFlushInProgress = true;
  const metrics = pendingMetrics.splice(0, METRIC_BATCH_SIZE);

  try {
    const response = await fetch("/api/child/telemetry/performance", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics }),
      keepalive: true,
    });
    if (response.status === 401) {
      pendingMetrics.length = 0;
      metricRetryDelayMs = 5_000;
      return;
    }
    if (!response.ok) throw new Error("Performance telemetry was rejected");
    metricRetryDelayMs = 5_000;
  } catch {
    pendingMetrics.unshift(...metrics);
    if (pendingMetrics.length > MAX_PENDING_METRICS) {
      pendingMetrics.splice(0, pendingMetrics.length - MAX_PENDING_METRICS);
    }
    metricRetryDelayMs = Math.min(metricRetryDelayMs * 2, MAX_RETRY_DELAY_MS);
  } finally {
    metricFlushInProgress = false;
    if (pendingMetrics.length > 0 && navigator.onLine) {
      scheduleMetricFlush(metricRetryDelayMs);
    }
  }
}

function flushPerformanceMetricsWithBeacon() {
  if (!navigator.sendBeacon || pendingMetrics.length === 0) return;
  const metrics = pendingMetrics.slice(0, METRIC_BATCH_SIZE);
  const accepted = navigator.sendBeacon(
    "/api/child/telemetry/performance",
    new Blob([JSON.stringify({ metrics })], { type: "application/json" }),
  );
  if (accepted) pendingMetrics.splice(0, metrics.length);
}

function sendPerformanceMetric(
  payload: Record<string, unknown>,
  { urgent = false }: { urgent?: boolean } = {},
) {
  pendingMetrics.push({ ...payload, ...clientContext() });
  if (pendingMetrics.length > MAX_PENDING_METRICS) {
    pendingMetrics.splice(0, pendingMetrics.length - MAX_PENDING_METRICS);
  }
  if (urgent || pendingMetrics.length >= 15) {
    if (metricFlushTimer !== null) {
      window.clearTimeout(metricFlushTimer);
      metricFlushTimer = null;
    }
    void flushPerformanceMetrics();
    return;
  }
  scheduleMetricFlush();
}

export function reportChildMediaDiagnostic(input: {
  operation: string;
  status: number;
  totalMs: number;
  path?: string;
}) {
  sendPerformanceMetric({
    kind: "media",
    operation: input.operation,
    path: input.path ?? "/hanzi-media",
    status: input.status,
    totalMs: Math.max(0, input.totalMs),
  });
}

export function reportChildRuntimeFailure(input: {
  operation: "chunk_load_failed" | "render_failed";
  path?: string;
}) {
  sendPerformanceMetric(
    {
      kind: "runtime",
      operation: input.operation,
      path: input.path ?? window.location.pathname,
      status: 0,
      totalMs: 0,
    },
    { urgent: true },
  );
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
  const isImportantMutation = IMPORTANT_MUTATIONS.has(metric.operation);
  const isSlow = metric.totalMs >= 500;
  const failed = metric.status === 0 || metric.status >= 400;
  const sampledMainRead =
    MAIN_READ_PATHS.has(metric.normalizedPath) &&
    Math.random() < FAST_READ_SAMPLE_RATE;
  return (
    failed ||
    isSlow ||
    isImportantMutation ||
    sampledMainRead ||
    metric.method !== "GET"
  );
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
  if (
    input.path.startsWith("/api/child/telemetry/") ||
    input.path.startsWith("/api/child/auth/") ||
    (input.path.split("?")[0] === "/api/child/me" && input.status === 401)
  ) return;

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
      const totalMs = Math.max(0, now() - startedAt);
      if (totalMs < 250) return;
      sendPerformanceMetric({
        kind: "route",
        operation: `render_${route}`,
        path: window.location.hash || `#${route}`,
        totalMs: roundDuration(totalMs),
      });
    });
  });
}

export function reportChildAppStartupReady(apiPath: string) {
  if (startupReported) return;
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

  const apiMetric = latestApiMetrics.get(normalizeApiPath(apiPath));
  const readyAt = now();
  const readinessTotalMs = apiMetric
    ? Math.max(0, readyAt - apiMetric.startedAt)
    : Math.max(0, readyAt - moduleLoadedAt);
  const readinessNonApiMs = apiMetric
    ? Math.max(0, readinessTotalMs - apiMetric.totalMs)
    : readinessTotalMs;
  sendPerformanceMetric({
    kind: "startup",
    operation: "startup_tasks_ready",
    path: normalizeApiPath(apiPath),
    requestId: apiMetric?.requestId ?? null,
    totalMs: roundDuration(readinessTotalMs),
    serverMs: roundDuration(apiMetric?.serverMs ?? null),
    clientOverheadMs: roundDuration(apiMetric?.clientOverheadMs ?? null),
    apiTotalMs: roundDuration(apiMetric?.totalMs ?? null),
    nonApiMs: roundDuration(readinessNonApiMs),
    ttfbMs: roundDuration(apiMetric?.ttfbMs ?? null),
    downloadMs: roundDuration(apiMetric?.downloadMs ?? null),
    transferSize: apiMetric?.transferSize ?? null,
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => scheduleMetricFlush(0));
  window.addEventListener("pagehide", flushPerformanceMetricsWithBeacon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPerformanceMetricsWithBeacon();
    } else if (navigator.onLine) {
      scheduleMetricFlush(250);
    }
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
