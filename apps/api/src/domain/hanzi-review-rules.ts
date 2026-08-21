import {
  applyMemoryRecall,
  firstMemoryReviewDate,
  MEMORY_REVIEW_OFFSETS,
  MEMORY_REVIEW_STAGE_COUNT,
  type MemoryRecallRating,
} from "./memory-review-rules.js";

export const HANZI_REVIEW_OFFSETS = MEMORY_REVIEW_OFFSETS;
export const HANZI_REVIEW_STAGE_COUNT = MEMORY_REVIEW_STAGE_COUNT;

export function firstHanziReviewDate(anchorDate: Date): Date {
  return firstMemoryReviewDate(anchorDate);
}

export function applyHanziRecall(
  stage: number,
  rating: MemoryRecallRating,
  completedDate: Date,
) {
  return applyMemoryRecall({ currentStage: stage, rating, completedDate });
}
