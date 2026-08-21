import {
  applyMemoryRecall,
  firstMemoryReviewDate,
  MEMORY_REVIEW_OFFSETS,
  MEMORY_REVIEW_STAGE_COUNT,
  type MemoryRecallRating,
} from "./memory-review-rules.js";

export const POEM_REVIEW_OFFSETS = MEMORY_REVIEW_OFFSETS;
export const POEM_REVIEW_STAGE_COUNT = MEMORY_REVIEW_STAGE_COUNT;

export function firstPoemReviewDate(anchorDate: Date): Date {
  return firstMemoryReviewDate(anchorDate);
}

export function applyPoemRecall(
  stage: number,
  rating: MemoryRecallRating,
  completedDate: Date,
) {
  return applyMemoryRecall({ currentStage: stage, rating, completedDate });
}
