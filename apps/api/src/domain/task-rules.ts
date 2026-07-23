import type {
  AttemptStatus,
  ScheduleKind,
  TaskAttempt,
  TaskMode,
} from "@prisma/client";
import { differenceInWholeSeconds } from "../lib/time.js";

type SchedulableTemplate = {
  scheduleKind: ScheduleKind;
  weekdays: number[];
  oneTimeDate: Date | null;
};

type AttemptTiming = Pick<
  TaskAttempt,
  "startedAt" | "pausedAt" | "totalPausedSeconds" | "status"
>;

export function isScheduledForDate(
  template: SchedulableTemplate,
  businessDate: Date,
): boolean {
  const weekday = businessDate.getUTCDay();

  switch (template.scheduleKind) {
    case "DAILY":
      return true;
    case "WORKDAYS":
      return weekday >= 1 && weekday <= 5;
    case "SELECTED_WEEKDAYS":
      return template.weekdays.includes(weekday);
    case "ONE_TIME":
      return (
        template.oneTimeDate?.toISOString().slice(0, 10) ===
        businessDate.toISOString().slice(0, 10)
      );
  }
}

export function activeElapsedSeconds(
  attempt: AttemptTiming,
  now: Date,
): number {
  const effectiveEnd =
    attempt.status === "PAUSED" && attempt.pausedAt ? attempt.pausedAt : now;
  return Math.max(
    0,
    differenceInWholeSeconds(effectiveEnd, attempt.startedAt) -
      attempt.totalPausedSeconds,
  );
}

export function remainingSeconds(
  attempt: AttemptTiming,
  timeLimitSeconds: number,
  now: Date,
): number {
  return Math.max(0, timeLimitSeconds - activeElapsedSeconds(attempt, now));
}

export function taskReward(input: {
  mode: TaskMode;
  baseStars: number;
  earlyBonusEnabled: boolean;
  earlyThresholdSeconds: number | null;
  earlyBonusStars: number | null;
  remainingSeconds: number | null;
}): { baseStars: number; bonusStars: number; totalStars: number } {
  const qualifiesForBonus =
    input.mode === "TIMED" &&
    input.earlyBonusEnabled &&
    input.earlyThresholdSeconds !== null &&
    input.earlyBonusStars !== null &&
    input.remainingSeconds !== null &&
    input.remainingSeconds >= input.earlyThresholdSeconds;
  const bonusStars = qualifiesForBonus ? input.earlyBonusStars! : 0;
  return {
    baseStars: input.baseStars,
    bonusStars,
    totalStars: input.baseStars + bonusStars,
  };
}

export function consecutiveScoredDays(
  scoredDateKeys: Iterable<string>,
  today: Date,
): number {
  const scored = new Set(scoredDateKeys);
  const cursor = new Date(today);
  const todayKey = cursor.toISOString().slice(0, 10);

  // 当天尚未结束且还没有得分时，保留截至昨天的连续记录。
  if (!scored.has(todayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (scored.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export const ACTIVE_ATTEMPT_STATUSES: AttemptStatus[] = ["RUNNING", "PAUSED"];
