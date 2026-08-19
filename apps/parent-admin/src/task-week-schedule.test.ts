import { describe, expect, it } from "vitest";
import { moveTaskWeekday } from "./task-week-schedule";

describe("moveTaskWeekday", () => {
  it("keeps weekend scheduling when moving one occurrence of a daily task", () => {
    expect(moveTaskWeekday({ scheduleKind: "DAILY", weekdays: [] }, 1, 3))
      .toEqual([0, 2, 3, 4, 5, 6]);
  });

  it("does not add weekend scheduling to a workday task", () => {
    expect(moveTaskWeekday({ scheduleKind: "WORKDAYS", weekdays: [] }, 2, 4))
      .toEqual([1, 3, 4, 5]);
  });

  it("moves only the selected weekday occurrence", () => {
    expect(moveTaskWeekday({ scheduleKind: "SELECTED_WEEKDAYS", weekdays: [1, 3, 5] }, 3, 4))
      .toEqual([1, 4, 5]);
  });
});
