import { useEffect, useRef } from "react";

const DEFAULT_INTERVAL_MS = 4_000;

/**
 * Keeps the currently visible child screen in sync with changes made from
 * another browser or the parent admin. Focus/visibility refreshes make iPad
 * app switching immediate; the interval covers two browsers left open at once.
 */
export function useLiveRefresh(
  refresh: (signal: AbortSignal) => void | Promise<void>,
  {
    enabled = true,
    intervalMs = DEFAULT_INTERVAL_MS,
  }: {
    enabled?: boolean;
    intervalMs?: number;
  } = {},
) {
  const refreshRef = useRef(refresh);
  const refreshingRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    const controller = new AbortController();
    let timer: number | null = null;
    const schedule = () => {
      if (disposed) return;
      if (timer !== null) window.clearTimeout(timer);
      const jitter = Math.round(intervalMs * (Math.random() * 0.16 - 0.08));
      timer = window.setTimeout(() => {
        timer = null;
        void run();
      }, Math.max(1_000, intervalMs + jitter));
    };
    const run = async (force = false) => {
      if (
        disposed ||
        refreshingRef.current ||
        document.visibilityState === "hidden" ||
        !navigator.onLine ||
        (!force && Date.now() - lastRefreshAtRef.current < intervalMs * 0.75)
      ) {
        schedule();
        return;
      }

      refreshingRef.current = true;
      try {
        await refreshRef.current(controller.signal);
      } finally {
        lastRefreshAtRef.current = Date.now();
        refreshingRef.current = false;
        schedule();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void run(true);
    };
    const handleFocus = () => void run(true);
    const handleOnline = () => void run(true);

    schedule();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, intervalMs]);
}
