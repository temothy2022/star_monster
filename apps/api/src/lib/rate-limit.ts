import { HttpError } from "./http-error.js";

type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();

export function enforceRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  code?: string;
  message?: string;
}): void {
  const now = Date.now();
  const current = counters.get(input.key);
  if (!current || current.resetAt <= now) {
    counters.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return;
  }

  current.count += 1;
  if (current.count > input.limit) {
    throw new HttpError(
      429,
      input.code ?? "TOO_MANY_ATTEMPTS",
      input.message ?? "尝试次数太多，请稍后再试",
    );
  }

  if (counters.size > 10_000) {
    for (const [key, counter] of counters) {
      if (counter.resetAt <= now) counters.delete(key);
    }
  }
}
