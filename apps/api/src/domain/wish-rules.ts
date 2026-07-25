import type { WishRecurrenceKind } from "@prisma/client";
import { addBusinessDays, startOfBusinessWeek } from "../lib/time.js";

export const ONE_TIME_VISIBLE_AFTER_COMPLETION_DAYS = 7;

export function recurrenceDays(
  kind: WishRecurrenceKind,
  intervalDays: number | null,
): number {
  if (kind === "DAILY") return 1;
  if (kind === "WEEKLY") return 7;
  return Math.max(1, intervalDays ?? 1);
}

export function nextRecurringWishDate(
  completionBusinessDate: Date,
  kind: WishRecurrenceKind,
  intervalDays: number | null,
): Date {
  if (kind === "WEEKLY") {
    return addBusinessDays(startOfBusinessWeek(completionBusinessDate), 7);
  }
  return addBusinessDays(
    completionBusinessDate,
    recurrenceDays(kind, intervalDays),
  );
}

export function oneTimeWishHiddenAt(completedAt: Date): Date {
  return new Date(
    completedAt.getTime() +
      ONE_TIME_VISIBLE_AFTER_COMPLETION_DAYS * 24 * 60 * 60 * 1000,
  );
}
