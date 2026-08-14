import { describe, expect, it } from "vitest";
import {
  selectDailyHanziCharacters,
  selectPrioritizedHanziCharacters,
} from "../src/domain/hanzi-selection.js";

const characters = Array.from({ length: 30 }, (_, index) => ({
  id: `hanzi-${String(index + 1).padStart(2, "0")}`,
  sortOrder: index + 1,
}));

describe("daily hanzi selection", () => {
  it("keeps the same child's selection stable for the same day", () => {
    const first = selectDailyHanziCharacters(
      characters,
      5,
      "child-a:2026-07-30",
    );
    const repeated = selectDailyHanziCharacters(
      [...characters].reverse(),
      5,
      "child-a:2026-07-30",
    );

    expect(repeated).toEqual(first);
    expect(new Set(first.map((item) => item.id)).size).toBe(5);
  });

  it("does not simply select the first characters by library order", () => {
    const selected = selectDailyHanziCharacters(
      characters,
      5,
      "child-a:2026-07-30",
    );

    expect(selected.map((item) => item.id)).not.toEqual(
      characters.slice(0, 5).map((item) => item.id),
    );
  });

  it("changes the order for another day or another child", () => {
    const baseline = selectDailyHanziCharacters(
      characters,
      10,
      "child-a:2026-07-30",
    );
    const nextDay = selectDailyHanziCharacters(
      characters,
      10,
      "child-a:2026-07-31",
    );
    const anotherChild = selectDailyHanziCharacters(
      characters,
      10,
      "child-b:2026-07-30",
    );

    expect(nextDay).not.toEqual(baseline);
    expect(anotherChild).not.toEqual(baseline);
  });

  it("puts school targets first and keeps their configured order", () => {
    const selected = selectPrioritizedHanziCharacters(
      characters,
      ["hanzi-09", "hanzi-03", "hanzi-14"],
      5,
      "child-a:2026-07-30",
    );

    expect(selected.slice(0, 3).map((item) => item.id)).toEqual([
      "hanzi-09",
      "hanzi-03",
      "hanzi-14",
    ]);
    expect(new Set(selected.map((item) => item.id)).size).toBe(5);
  });

  it("ignores stale school targets and fills the remaining slots", () => {
    const selected = selectPrioritizedHanziCharacters(
      characters,
      ["removed-character", "hanzi-04"],
      3,
      "child-a:2026-07-30",
    );

    expect(selected[0]?.id).toBe("hanzi-04");
    expect(selected).toHaveLength(3);
    expect(selected.some((item) => item.id === "removed-character")).toBe(false);
  });
});
