import { describe, expect, it } from "vitest";
import {
  firstPoemReviewDate,
  nextPoemReviewDate,
  POEM_REVIEW_STAGE_COUNT,
} from "../src/domain/poem-review-rules.js";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("poem review schedule", () => {
  it("starts two days after learning", () => {
    expect(firstPoemReviewDate(date("2026-07-29"))).toEqual(date("2026-07-31"));
  });

  it("uses the six absolute review offsets", () => {
    const anchor = date("2026-07-01");
    const expected = ["2026-07-05", "2026-07-08", "2026-07-16", "2026-07-31", "2026-08-30"];

    expected.forEach((value, index) => {
      expect(nextPoemReviewDate(anchor, index + 1, date("2026-07-03"))).toEqual(
        date(value),
      );
    });
    expect(
      nextPoemReviewDate(anchor, POEM_REVIEW_STAGE_COUNT, date("2026-08-30")),
    ).toBeNull();
  });

  it("never schedules another review on the same overdue day", () => {
    expect(
      nextPoemReviewDate(
        date("2026-07-01"),
        1,
        date("2026-07-20"),
      ),
    ).toEqual(date("2026-07-21"));
  });
});
