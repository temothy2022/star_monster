import { addBusinessDays } from "../lib/time.js";

export const MEMORY_REVIEW_OFFSETS = [1, 3, 7, 14, 30, 60, 120] as const;
export const MEMORY_REVIEW_STAGE_COUNT = MEMORY_REVIEW_OFFSETS.length;
export const MEMORY_MASTERY_STAGE = 5;

export type MemoryRecallRating =
  | "EASY"
  | "EFFORTFUL"
  | "HINTED"
  | "FORGOT";

export function firstMemoryReviewDate(anchorDate: Date): Date {
  return addBusinessDays(anchorDate, MEMORY_REVIEW_OFFSETS[0]);
}

export function applyMemoryRecall(input: {
  currentStage: number;
  rating: MemoryRecallRating;
  completedDate: Date;
}) {
  const currentStage = Math.min(
    MEMORY_REVIEW_STAGE_COUNT,
    Math.max(0, input.currentStage),
  );
  let reviewStage = currentStage;
  let delayDays = 1;

  if (input.rating === "EASY") {
    reviewStage = Math.min(MEMORY_REVIEW_STAGE_COUNT, currentStage + 1);
    delayDays = MEMORY_REVIEW_OFFSETS[
      Math.min(reviewStage, MEMORY_REVIEW_STAGE_COUNT - 1)
    ];
  } else if (input.rating === "EFFORTFUL") {
    reviewStage = Math.min(MEMORY_REVIEW_STAGE_COUNT, currentStage + 1);
    const fullDelay = MEMORY_REVIEW_OFFSETS[
      Math.min(reviewStage, MEMORY_REVIEW_STAGE_COUNT - 1)
    ];
    delayDays = Math.max(1, Math.round(fullDelay * 0.6));
  } else if (input.rating === "HINTED") {
    reviewStage = Math.max(0, currentStage - 1);
    const baseDelay = MEMORY_REVIEW_OFFSETS[
      Math.min(reviewStage, MEMORY_REVIEW_STAGE_COUNT - 1)
    ];
    delayDays = Math.max(1, Math.min(7, Math.round(baseDelay * 0.35)));
  } else {
    reviewStage = Math.max(0, currentStage - 2);
    delayDays = 1;
  }

  const independent = input.rating === "EASY" || input.rating === "EFFORTFUL";
  return {
    reviewStage,
    nextReviewDate: addBusinessDays(input.completedDate, delayDays),
    mastered: independent && reviewStage >= MEMORY_MASTERY_STAGE,
    independent,
    difficult: input.rating === "HINTED" || input.rating === "FORGOT",
  };
}

export function recallCounterField(rating: MemoryRecallRating) {
  if (rating === "EASY") return "easyRecallCount" as const;
  if (rating === "EFFORTFUL") return "effortfulRecallCount" as const;
  if (rating === "HINTED") return "hintedRecallCount" as const;
  return "forgottenRecallCount" as const;
}
