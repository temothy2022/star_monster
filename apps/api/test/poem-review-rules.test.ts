import { describe, expect, it } from "vitest";
import {
  firstPoemReviewDate,
  applyPoemRecall,
  POEM_REVIEW_STAGE_COUNT,
} from "../src/domain/poem-review-rules.js";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("poem review schedule", () => {
  it("starts on the day after learning", () => {
    expect(firstPoemReviewDate(date("2026-07-29"))).toEqual(date("2026-07-30"));
  });

  it("uses independent recall to grow the interval", () => {
    const result = applyPoemRecall(3, "EASY", date("2026-07-02"));
    expect(result.reviewStage).toBe(4);
    expect(result.nextReviewDate).toEqual(date("2026-08-01"));
    expect(result.independent).toBe(true);
  });

  it("keeps maintenance reviews after mastery instead of stopping forever", () => {
    const result = applyPoemRecall(POEM_REVIEW_STAGE_COUNT, "EASY", date("2026-07-02"));
    expect(result.reviewStage).toBe(POEM_REVIEW_STAGE_COUNT);
    expect(result.mastered).toBe(true);
    expect(result.nextReviewDate).toEqual(date("2026-10-30"));
  });

  it("brings a prompted poem back sooner", () => {
    const result = applyPoemRecall(4, "HINTED", date("2026-07-02"));
    expect(result.reviewStage).toBe(3);
    expect(result.independent).toBe(false);
    expect(result.nextReviewDate).toEqual(date("2026-07-07"));
  });

  it("keeps an existing in-progress stage instead of restarting it", () => {
    const result = applyPoemRecall(3, "EFFORTFUL", date("2026-07-02"));
    expect(result.reviewStage).toBe(4);
    expect(result.nextReviewDate).toEqual(date("2026-07-20"));
  });
});
