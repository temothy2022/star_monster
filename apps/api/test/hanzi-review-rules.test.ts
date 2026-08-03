import { describe, expect, it } from "vitest";
import {
  firstHanziReviewDate,
  HANZI_REVIEW_STAGE_COUNT,
  nextHanziReviewDate,
  retryHanziReviewDate,
} from "../src/domain/hanzi-review-rules.js";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("汉字复习计划", () => {
  it("首次复习安排在学习后的第一个工作日", () => {
    expect(firstHanziReviewDate(date("2026-08-03"))).toEqual(date("2026-08-04"));
  });

  it("按 1、2、4、7、15、30 天逐阶段安排", () => {
    const anchor = date("2026-08-03");
    expect(nextHanziReviewDate(anchor, 1, date("2026-08-04"))).toEqual(date("2026-08-05"));
    expect(nextHanziReviewDate(anchor, 2, date("2026-08-05"))).toEqual(date("2026-08-07"));
    expect(nextHanziReviewDate(anchor, 3, date("2026-08-07"))).toEqual(date("2026-08-10"));
    expect(nextHanziReviewDate(anchor, HANZI_REVIEW_STAGE_COUNT, date("2026-09-01"))).toBeNull();
  });

  it("逾期答对时至少安排到下一个工作日", () => {
    expect(nextHanziReviewDate(date("2026-08-03"), 1, date("2026-08-20"))).toEqual(date("2026-08-21"));
  });

  it("答错后重新进入短周期", () => {
    expect(retryHanziReviewDate(date("2026-08-03"), 0, false)).toEqual(date("2026-08-04"));
    expect(retryHanziReviewDate(date("2026-08-03"), 3, true)).toEqual(date("2026-08-06"));
  });
});
