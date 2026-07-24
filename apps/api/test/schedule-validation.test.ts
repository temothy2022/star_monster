import { describe, expect, it } from "vitest";
import type { ScheduleResponse } from "../src/ai/schemas.js";
import { validateSchedulePlan } from "../src/services/schedule-validation.js";

const preferences = {
  maxDailyMinutes: 30,
  maxConsecutiveMinutes: 15,
  minimumBreakMinutes: 5,
};
const slots = [{ weekday: 1, startMinute: 1080, endMinute: 1140 }];
const templates = [
  { id: "reading", estimatedMinutes: 10 },
  { id: "review", estimatedMinutes: 10 },
];

function plan(
  weekPlan: ScheduleResponse["weekPlan"],
): ScheduleResponse {
  return {
    summary: "一周计划",
    weekPlan,
    taskCadence: [...new Set(weekPlan.map((item) => item.templateId))].map(
      (templateId) => ({
        templateId,
        weekdays: [
          ...new Set(
            weekPlan
              .filter((item) => item.templateId === templateId)
              .map((item) => item.weekday),
          ),
        ],
        reasoning: "间隔练习",
      }),
    ),
    parentTips: [],
    warnings: [],
    evidencePrinciples: ["SPACING_AND_RETRIEVAL"],
  };
}

describe("AI schedule validation", () => {
  it("accepts sessions inside availability with a break", () => {
    expect(
      validateSchedulePlan({
        plan: plan([
          {
            templateId: "reading",
            weekday: 1,
            startMinute: 1080,
            durationMinutes: 10,
            sessionType: "NEW_CONTENT",
            note: "读一本",
          },
          {
            templateId: "review",
            weekday: 1,
            startMinute: 1095,
            durationMinutes: 10,
            sessionType: "REVIEW",
            note: "复习",
          },
        ]),
        slots,
        templates,
        preferences,
      }),
    ).toEqual([]);
  });

  it("rejects overlap, unknown tasks and out-of-window sessions", () => {
    const errors = validateSchedulePlan({
      plan: plan([
        {
          templateId: "reading",
          weekday: 1,
          startMinute: 1070,
          durationMinutes: 10,
          sessionType: "GENERAL",
          note: "超出时间",
        },
        {
          templateId: "unknown",
          weekday: 1,
          startMinute: 1075,
          durationMinutes: 10,
          sessionType: "GENERAL",
          note: "未知",
        },
      ]),
      slots,
      templates,
      preferences,
    });
    expect(errors.some((item) => item.includes("超出了"))).toBe(true);
    expect(errors.some((item) => item.includes("不属于"))).toBe(true);
  });

  it("allows target cadence to differ when the available week cannot fit every session", () => {
    const constrainedPlan = plan([
      {
        templateId: "reading",
        weekday: 1,
        startMinute: 1080,
        durationMinutes: 10,
        sessionType: "REVIEW",
        note: "本周可安排的一次阅读",
      },
    ]);
    constrainedPlan.taskCadence[0]!.weekdays = [1, 3, 5];

    expect(
      validateSchedulePlan({
        plan: constrainedPlan,
        slots,
        templates,
        preferences,
      }),
    ).toEqual([]);
  });
});
