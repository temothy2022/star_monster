import type { AppConfig } from "../config.js";
import { prisma } from "../lib/prisma.js";
import {
  addBusinessDays,
  businessDateAt,
  businessDateKey,
  businessMinuteOfDayAt,
  startOfBusinessWeek,
} from "../lib/time.js";
import {
  buildMotivationalLeaderboard,
} from "../domain/child-leaderboard.js";

export async function getChildLeaderboardSettings(
  childId: string,
  today: Date,
) {
  const stored = await prisma.childLeaderboardSettings.findUnique({
    where: { childId },
  });
  const adjustmentIsCurrent =
    stored?.dailyAdjustmentDate != null &&
    businessDateKey(stored.dailyAdjustmentDate) === businessDateKey(today);
  return {
    competitorGrowthPercent: stored?.competitorGrowthPercent ?? 100,
    dailyCompetitorStarDelta: adjustmentIsCurrent
      ? stored.dailyCompetitorStarDelta
      : 0,
    dailyAdjustmentDate: adjustmentIsCurrent
      ? businessDateKey(stored.dailyAdjustmentDate!)
      : null,
  };
}

export async function getFootprints(
  childId: string,
  config: AppConfig,
  selectedDateInput?: string,
  now = new Date(),
) {
  const today = businessDateAt(now, config.APP_TIME_ZONE);
  const weekStart = startOfBusinessWeek(today);
  const weekEnd = addBusinessDays(weekStart, 6);
  const requestedDate = selectedDateInput
    ? new Date(`${selectedDateInput}T00:00:00.000Z`)
    : today;
  const selectedDate =
    Number.isNaN(requestedDate.getTime()) ||
    requestedDate < weekStart ||
    requestedDate > weekEnd ||
    requestedDate > today
      ? today
      : requestedDate;

  const todayKey = businessDateKey(today);
  const weekStartKey = businessDateKey(weekStart);
  const currentMinute = businessMinuteOfDayAt(now, config.APP_TIME_ZONE);
  const [tasks, child, leaderboardSettings] = await Promise.all([
    prisma.dailyTask.findMany({
      where: {
        childId,
        taskDate: { gte: weekStart, lte: weekEnd },
      },
      include: {
        attempts: {
          where: { status: "COMPLETED" },
          orderBy: { endedAt: "desc" },
        },
        template: {
          select: { isEnabled: true, archivedAt: true },
        },
      },
      orderBy: [{ taskDate: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.childProfile.findUniqueOrThrow({
      where: { id: childId },
      select: { dailyStarGoal: true, nickname: true, petType: true },
    }),
    getChildLeaderboardSettings(childId, today),
  ]);

  const totals = new Map<string, number>();
  for (const task of tasks) {
    const key = businessDateKey(task.taskDate);
    const taskStars = task.attempts.reduce(
      (sum, attempt) =>
        sum + attempt.baseStarsAwarded + attempt.bonusStarsAwarded,
      0,
    );
    totals.set(key, (totals.get(key) ?? 0) + taskStars);
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addBusinessDays(weekStart, index);
    const key = businessDateKey(date);
    return {
      date: key,
      isFuture: date > today,
      stars: date > today ? null : (totals.get(key) ?? 0),
    };
  });

  const selectedKey = businessDateKey(selectedDate);
  const details = tasks
    .filter((task) => businessDateKey(task.taskDate) === selectedKey)
    .flatMap((task) =>
      task.attempts.map((attempt) => ({
        completionId: attempt.id,
        dailyTaskId: task.id,
        title: task.titleSnapshot,
        category: task.categorySnapshot,
        iconKey: task.iconKeySnapshot,
        baseStars: attempt.baseStarsAwarded,
        bonusStars: attempt.bonusStarsAwarded,
        totalStars:
          attempt.baseStarsAwarded + attempt.bonusStarsAwarded,
        completedAt: attempt.endedAt,
      })),
    );

  const summarizePeriod = (from: Date, to: Date) => {
    const periodTasks = tasks.filter((task) =>
      task.taskDate >= from &&
      task.taskDate <= to &&
      (task.attempts.length > 0 ||
        (task.template.isEnabled && !task.template.archivedAt)),
    );
    const completedTaskSnapshots = periodTasks.filter(
      (task) => task.attempts.length > 0,
    ).length;
    const completedAttempts = periodTasks.flatMap((task) => task.attempts);
    const maxAvailableStars = periodTasks.reduce((sum, task) => {
      const earnedStars = task.attempts.reduce(
        (taskSum, attempt) =>
          taskSum + attempt.baseStarsAwarded + attempt.bonusStarsAwarded,
        0,
      );
      const configuredMaximum =
        task.baseStarsSnapshot +
        (task.earlyBonusEnabledSnapshot
          ? (task.earlyBonusStarsSnapshot ?? 0)
          : 0);
      return sum + Math.max(earnedStars, configuredMaximum);
    }, 0);
    return {
      stars: completedAttempts.reduce(
        (sum, attempt) =>
          sum + attempt.baseStarsAwarded + attempt.bonusStarsAwarded,
        0,
      ),
      completedTasks: completedAttempts.length,
      maxAvailableStars,
      completionRate:
        periodTasks.length > 0
          ? completedTaskSnapshots / periodTasks.length
          : 0,
    };
  };

  const dailyStats = summarizePeriod(today, today);
  const weeklyStats = summarizePeriod(weekStart, today);
  const elapsedWeekDays =
    Math.floor((today.getTime() - weekStart.getTime()) / 86_400_000) + 1;
  const weeklyScoreDays = Array.from({ length: elapsedWeekDays }, (_, index) => {
    const date = addBusinessDays(weekStart, index);
    return {
      seed: businessDateKey(date),
      elapsedMinutes:
        index === elapsedWeekDays - 1 ? currentMinute : 24 * 60,
    };
  });

  return {
    weekStart: businessDateKey(weekStart),
    weekEnd: businessDateKey(weekEnd),
    selectedDate: selectedKey,
    days,
    tasks: details,
    leaderboards: {
      daily: buildMotivationalLeaderboard({
        childId,
        ...dailyStats,
        nickname: child.nickname,
        petType: child.petType,
        goalStars: child.dailyStarGoal,
        dailyGoalStars: child.dailyStarGoal,
        seed: weekStartKey,
        scoreDays: [{ seed: todayKey, elapsedMinutes: currentMinute }],
        competitorGrowthPercent: leaderboardSettings.competitorGrowthPercent,
        competitorStarDelta: leaderboardSettings.dailyCompetitorStarDelta,
      }),
      weekly: buildMotivationalLeaderboard({
        childId,
        ...weeklyStats,
        nickname: child.nickname,
        petType: child.petType,
        goalStars: child.dailyStarGoal * elapsedWeekDays,
        dailyGoalStars: child.dailyStarGoal,
        seed: weekStartKey,
        scoreDays: weeklyScoreDays,
        competitorGrowthPercent: leaderboardSettings.competitorGrowthPercent,
        competitorStarDelta: leaderboardSettings.dailyCompetitorStarDelta,
      }),
    },
  };
}
