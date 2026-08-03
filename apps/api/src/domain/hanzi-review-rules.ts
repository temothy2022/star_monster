import { addBusinessDays } from "../lib/time.js";

// The product schedules one review task per calendar day. Sub-day intervals
// from the classic curve are therefore represented by the next available day.
export const HANZI_REVIEW_OFFSETS = [1, 2, 4, 7, 15, 30] as const;
export const HANZI_REVIEW_STAGE_COUNT = HANZI_REVIEW_OFFSETS.length;

export function firstHanziReviewDate(anchorDate: Date): Date {
  return addBusinessDays(anchorDate, HANZI_REVIEW_OFFSETS[0]);
}

export function nextHanziReviewDate(
  anchorDate: Date,
  completedStage: number,
  completedDate: Date,
): Date | null {
  if (completedStage >= HANZI_REVIEW_STAGE_COUNT) return null;
  const scheduledDate = addBusinessDays(
    anchorDate,
    HANZI_REVIEW_OFFSETS[completedStage],
  );
  const tomorrow = addBusinessDays(completedDate, 1);
  return scheduledDate > completedDate ? scheduledDate : tomorrow;
}

export function retryHanziReviewDate(today: Date, stage: number, difficult: boolean): Date {
  const base = HANZI_REVIEW_OFFSETS[Math.min(Math.max(stage, 0), HANZI_REVIEW_STAGE_COUNT - 1)] ?? 1;
  return addBusinessDays(today, difficult ? Math.max(1, Math.floor(base / 2)) : base);
}
