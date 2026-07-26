import { useEffect, useRef } from "react";

const DEFAULT_INTERVAL_MS = 4_000;

/**
 * Keeps the currently visible child screen in sync with changes made from
 * another browser or the parent admin. Focus/visibility refreshes make iPad
 * app switching immediate; the interval covers two browsers left open at once.
 */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
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

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    const run = async () => {
      if (
        disposed ||
        refreshingRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      refreshingRef.current = true;
      try {
        await refreshRef.current();
      } finally {
        refreshingRef.current = false;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void run();
    };

    const timer = window.setInterval(() => void run(), intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, intervalMs]);
}
