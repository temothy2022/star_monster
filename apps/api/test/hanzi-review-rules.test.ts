import { describe, expect, it } from "vitest";
import {
  firstHanziReviewDate,
  HANZI_REVIEW_STAGE_COUNT,
  applyHanziRecall,
} from "../src/domain/hanzi-review-rules.js";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("汉字复习计划", () => {
  it("首次复习安排在学习后的第一个工作日", () => {
    expect(firstHanziReviewDate(date("2026-08-03"))).toEqual(date("2026-08-04"));
  });

  it("独立想起会推进阶段并安排下一次维护复习", () => {
    const result = applyHanziRecall(0, "EASY", date("2026-08-04"));
    expect(result.reviewStage).toBe(1);
    expect(result.nextReviewDate).toEqual(date("2026-08-07"));
    expect(result.independent).toBe(true);
  });

  it("费力想起仍推进但缩短间隔", () => {
    const result = applyHanziRecall(2, "EFFORTFUL", date("2026-08-03"));
    expect(result.reviewStage).toBe(3);
    expect(result.nextReviewDate).toEqual(date("2026-08-11"));
  });

  it("提示和遗忘都不会被记为独立掌握", () => {
    const hinted = applyHanziRecall(4, "HINTED", date("2026-08-03"));
    const forgot = applyHanziRecall(4, "FORGOT", date("2026-08-03"));
    expect(hinted.reviewStage).toBe(3);
    expect(hinted.independent).toBe(false);
    expect(forgot.reviewStage).toBe(2);
    expect(forgot.nextReviewDate).toEqual(date("2026-08-04"));
    expect(HANZI_REVIEW_STAGE_COUNT).toBe(7);
  });

  it("兼容旧版已掌握阶段并继续低频维护", () => {
    const result = applyHanziRecall(6, "EASY", date("2026-08-03"));
    expect(result.reviewStage).toBe(7);
    expect(result.mastered).toBe(true);
    expect(result.nextReviewDate).toEqual(date("2026-12-01"));
  });
});
