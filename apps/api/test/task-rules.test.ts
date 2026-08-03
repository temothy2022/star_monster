import { describe, expect, it } from "vitest";
import {
  activeElapsedSeconds,
  consecutiveScoredDays,
  dailyGoalBonusAmount,
  dailyTaskStatusAfterCompletion,
  isScheduledForDate,
  isTemplateEligibleBySchedule,
  lifetimeStarsAfterTaskRefund,
  remainingSeconds,
  taskReward,
} from "../src/domain/task-rules.js";

describe("每日目标达成奖", () => {
  it("达到目标时返回家长设置的额外星星", () => {
    expect(dailyGoalBonusAmount({
      enabled: true,
      goalStars: 12,
      bonusStars: 3,
      taskStarsEarned: 12,
      alreadyAwarded: false,
    })).toBe(3);
  });

  it("未达标或当天已经发放过时不再奖励", () => {
    expect(dailyGoalBonusAmount({
      enabled: true,
      goalStars: 12,
      bonusStars: 3,
      taskStarsEarned: 11,
      alreadyAwarded: false,
    })).toBe(0);
    expect(dailyGoalBonusAmount({
      enabled: true,
      goalStars: 12,
      bonusStars: 3,
      taskStarsEarned: 18,
      alreadyAwarded: true,
    })).toBe(0);
  });
});

describe("任务奖励退款", () => {
  it("从历史累计星星中扣除本次退款的全部奖励", () => {
    expect(lifetimeStarsAfterTaskRefund(102, 2)).toBe(100);
    expect(lifetimeStarsAfterTaskRefund(105, 5)).toBe(100);
  });

  it("异常旧数据下也不会让历史累计星星变为负数", () => {
    expect(lifetimeStarsAfterTaskRefund(1, 2)).toBe(0);
  });
});

describe("任务计划规则", () => {
  const monday = new Date("2026-07-20T00:00:00.000Z");
  const sunday = new Date("2026-07-26T00:00:00.000Z");

  it("工作日只在周一至周五出现", () => {
    const template = {
      scheduleKind: "WORKDAYS" as const,
      weekdays: [],
      oneTimeDate: null,
    };
    expect(isScheduledForDate(template, monday)).toBe(true);
    expect(isScheduledForDate(template, sunday)).toBe(false);
  });

  it("指定星期按 0=周日、1=周一 匹配", () => {
    const template = {
      scheduleKind: "SELECTED_WEEKDAYS" as const,
      weekdays: [0, 2, 4],
      oneTimeDate: null,
    };
    expect(isScheduledForDate(template, monday)).toBe(false);
    expect(isScheduledForDate(template, sunday)).toBe(true);
  });

  it("一次性任务只在设置日期出现", () => {
    const template = {
      scheduleKind: "ONE_TIME" as const,
      weekdays: [],
      oneTimeDate: new Date("2026-07-20T00:00:00.000Z"),
    };
    expect(isScheduledForDate(template, monday)).toBe(true);
    expect(isScheduledForDate(template, sunday)).toBe(false);
  });

  it("古诗复习忽略新诗学习星期，每天都检查是否有到期内容", () => {
    const template = {
      experienceKind: "POEM_REVIEW" as const,
      scheduleKind: "SELECTED_WEEKDAYS" as const,
      weekdays: [2, 4],
      oneTimeDate: null,
    };
    expect(isTemplateEligibleBySchedule(template, monday)).toBe(true);
    expect(isTemplateEligibleBySchedule(template, sunday)).toBe(true);
  });

  it("汉字复习也不受新字任务星期限制", () => {
    const template = {
      experienceKind: "HANZI_REVIEW" as const,
      scheduleKind: "SELECTED_WEEKDAYS" as const,
      weekdays: [2, 4],
      oneTimeDate: null,
    };
    expect(isTemplateEligibleBySchedule(template, monday)).toBe(true);
    expect(isTemplateEligibleBySchedule(template, sunday)).toBe(true);
  });

  it("其他任务仍严格遵守原有星期设置", () => {
    const template = {
      experienceKind: "POEM_LEARNING" as const,
      scheduleKind: "SELECTED_WEEKDAYS" as const,
      weekdays: [2, 4],
      oneTimeDate: null,
    };
    expect(isTemplateEligibleBySchedule(template, monday)).toBe(false);
  });
});

describe("当天可重复任务", () => {
  it("普通任务完成后关闭，可重复任务完成后重新开放", () => {
    expect(dailyTaskStatusAfterCompletion(false)).toBe("COMPLETED");
    expect(dailyTaskStatusAfterCompletion(true)).toBe("PENDING");
  });
});

describe("连续得分天数", () => {
  const today = new Date("2026-07-23T00:00:00.000Z");

  it("当天已得分时从当天连续向前统计", () => {
    expect(
      consecutiveScoredDays(
        ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"],
        today,
      ),
    ).toBe(4);
  });

  it("当天尚未得分时保留截至昨天的连续记录", () => {
    expect(
      consecutiveScoredDays(["2026-07-20", "2026-07-21", "2026-07-22"], today),
    ).toBe(3);
  });

  it("过去出现零得分日后从头计算", () => {
    expect(
      consecutiveScoredDays(["2026-07-19", "2026-07-21", "2026-07-22"], today),
    ).toBe(2);
  });
});

describe("任务计时规则", () => {
  it("暂停期间不累计执行时间", () => {
    const attempt = {
      startedAt: new Date("2026-07-23T10:00:00.000Z"),
      pausedAt: new Date("2026-07-23T10:02:00.000Z"),
      totalPausedSeconds: 0,
      status: "PAUSED" as const,
    };
    const now = new Date("2026-07-23T10:20:00.000Z");
    expect(activeElapsedSeconds(attempt, now)).toBe(120);
    expect(remainingSeconds(attempt, 600, now)).toBe(480);
  });

  it("达到提前阈值时发放基础奖励和加成", () => {
    expect(
      taskReward({
        mode: "TIMED",
        baseStars: 2,
        earlyBonusEnabled: true,
        earlyThresholdSeconds: 180,
        earlyBonusStars: 1,
        remainingSeconds: 180,
      }),
    ).toEqual({ baseStars: 2, bonusStars: 1, totalStars: 3 });
  });

  it("恢复后会扣除累计暂停时长", () => {
    const attempt = {
      startedAt: new Date("2026-07-23T10:00:00.000Z"),
      pausedAt: null,
      totalPausedSeconds: 300,
      status: "RUNNING" as const,
    };
    const now = new Date("2026-07-23T10:10:00.000Z");
    expect(activeElapsedSeconds(attempt, now)).toBe(300);
    expect(remainingSeconds(attempt, 600, now)).toBe(300);
  });

  it("普通任务不会误发提前加成", () => {
    expect(
      taskReward({
        mode: "UNTIMED",
        baseStars: 2,
        earlyBonusEnabled: true,
        earlyThresholdSeconds: 180,
        earlyBonusStars: 1,
        remainingSeconds: 300,
      }),
    ).toEqual({ baseStars: 2, bonusStars: 0, totalStars: 2 });
  });
});
