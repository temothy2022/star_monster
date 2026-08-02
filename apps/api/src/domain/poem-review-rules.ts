import { addBusinessDays } from "../lib/time.js";

// Daily-task adaptation of the Ebbinghaus curve. Sub-day review points are
// intentionally omitted because this product schedules at most one review task per day.
export const POEM_REVIEW_OFFSETS = [1, 2, 4, 7, 15, 30] as const;
export const POEM_REVIEW_STAGE_COUNT = POEM_REVIEW_OFFSETS.length;

export function firstPoemReviewDate(anchorDate: Date): Date {
  return addBusinessDays(anchorDate, POEM_REVIEW_OFFSETS[0]);
}

export function nextPoemReviewDate(
  anchorDate: Date,
  completedStage: number,
  completedDate: Date,
): Date | null {
  if (completedStage >= POEM_REVIEW_STAGE_COUNT) return null;

  const scheduledDate = addBusinessDays(
    anchorDate,
    POEM_REVIEW_OFFSETS[completedStage],
  );
  const tomorrow = addBusinessDays(completedDate, 1);
  return scheduledDate > completedDate ? scheduledDate : tomorrow;
}
