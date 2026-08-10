import { describe, expect, it } from "vitest";
import {
  selectDailyReview,
  selectNearestReviews,
} from "../src/domain/dashboard-review.js";

function candidate(id: string, date: string) {
  return { id, nextReviewDate: new Date(`${date}T00:00:00.000Z`) };
}

describe("task dashboard review selection", () => {
  it("orders reviews by absolute distance from today", () => {
    const today = new Date("2026-08-10T00:00:00.000Z");
    expect(selectNearestReviews([
      candidate("old", "2026-07-01"),
      candidate("tomorrow", "2026-08-11"),
      candidate("yesterday", "2026-08-09"),
      candidate("next-week", "2026-08-17"),
      candidate("today", "2026-08-10"),
    ], today, 4).map((item) => item.id)).toEqual([
      "today",
      "yesterday",
      "tomorrow",
      "next-week",
    ]);
  });

  it("rotates the selected poem on consecutive days", () => {
    const candidates = [
      candidate("a", "2026-08-08"),
      candidate("b", "2026-08-09"),
      candidate("c", "2026-08-10"),
      candidate("d", "2026-08-11"),
    ];
    const today = selectDailyReview(candidates, new Date("2026-08-10T00:00:00.000Z"));
    const tomorrow = selectDailyReview(candidates, new Date("2026-08-11T00:00:00.000Z"));
    expect(today).not.toBeNull();
    expect(tomorrow).not.toBeNull();
    expect(tomorrow?.id).not.toBe(today?.id);
  });
});
