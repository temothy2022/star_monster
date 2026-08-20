import { describe, expect, it } from "vitest";
import { moveTaskWeekday, taskCalendarDays } from "./task-week-schedule";

const template = {
  scheduleKind: "DAILY" as const,
  weekdays: [],
  oneTimeDate: null,
};

describe("taskCalendarDays", () => {
  it("shows daily tasks from Monday through Sunday", () => {
    expect(taskCalendarDays(template as never)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("keeps workday tasks on Monday through Friday", () => {
    expect(taskCalendarDays({ ...template, scheduleKind: "WORKDAYS" } as never))
      .toEqual([1, 2, 3, 4, 5]);
  });

  it("includes weekend occurrences for selected and one-time schedules", () => {
    expect(taskCalendarDays({ ...template, scheduleKind: "SELECTED_WEEKDAYS", weekdays: [0, 3, 6] } as never))
      .toEqual([0, 3, 6]);
    expect(taskCalendarDays({ ...template, scheduleKind: "ONE_TIME", oneTimeDate: "2026-08-23" } as never))
      .toEqual([0]);
  });
});

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
