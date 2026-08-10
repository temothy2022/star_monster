import type { PlanetKey, StarLedgerType } from "@prisma/client";
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

const PLANET_NAMES: Record<PlanetKey, string> = {
  MERCURY: "水星",
  VENUS: "金星",
  EARTH: "地球",
  MARS: "火星",
  JUPITER: "木星",
  SATURN: "土星",
  URANUS: "天王星",
  NEPTUNE: "海王星",
};

type FootprintRewardLedger = {
  id: string;
  type: StarLedgerType;
  amount: number;
  referenceId: string | null;
  createdAt: Date;
};

export function buildFootprintRewardDetails(
  ledgers: readonly FootprintRewardLedger[],
  planetProgress: readonly { id: string; planet: PlanetKey }[],
  selectedDateKey: string,
  timeZone: string,
) {
  const planetByProgressId = new Map(
    planetProgress.map((progress) => [progress.id, progress.planet]),
  );

  return ledgers.flatMap((ledger) => {
    const earnedDateKey = businessDateKey(
      businessDateAt(ledger.createdAt, timeZone),
    );
    if (
      earnedDateKey !== selectedDateKey ||
      ledger.amount <= 0 ||
      !["DAILY_GOAL_BONUS", "PLANET_BONUS", "PET_RED_PACKET_REWARD"].includes(ledger.type)
    ) return [];

    const planet = ledger.referenceId
      ? (planetByProgressId.get(ledger.referenceId) ?? null)
      : null;
    const title = ledger.type === "DAILY_GOAL_BONUS"
      ? "完成每日目标"
      : ledger.type === "PET_RED_PACKET_REWARD"
        ? "打开星宠红包"
        : planet
          ? `点亮${PLANET_NAMES[planet]}`
          : "点亮星球";

    return [{
      rewardId: ledger.id,
      type: ledger.type,
      title,
      totalStars: ledger.amount,
      earnedAt: ledger.createdAt,
      planet,
    }];
  });
}

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
  const [
    tasks,
    child,
    leaderboardSettings,
    rewardLedgers,
    planetProgress,
  ] = await Promise.all([
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
      select: {
        dailyStarGoal: true,
        dailyGoalBonusEnabled: true,
        dailyGoalBonusStars: true,
        nickname: true,
        petType: true,
      },
    }),
    getChildLeaderboardSettings(childId, today),
    prisma.starLedger.findMany({
      where: {
        childId,
        createdAt: {
          gte: addBusinessDays(weekStart, -1),
          lt: addBusinessDays(today, 2),
        },
        type: { in: ["DAILY_GOAL_BONUS", "PLANET_BONUS", "PET_RED_PACKET_REWARD"] },
      },
      select: {
        id: true,
        type: true,
        amount: true,
        referenceId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.planetProgress.findMany({
      where: { childId },
      select: { id: true, planet: true },
    }),
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

  const rewardTotals = new Map<string, number>();
  for (const ledger of rewardLedgers) {
    const key = businessDateKey(
      businessDateAt(ledger.createdAt, config.APP_TIME_ZONE),
    );
    if (key < weekStartKey || key > todayKey) continue;
    rewardTotals.set(key, (rewardTotals.get(key) ?? 0) + ledger.amount);
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addBusinessDays(weekStart, index);
    const key = businessDateKey(date);
    return {
      date: key,
      isFuture: date > today,
      stars: date > today
        ? null
        : (totals.get(key) ?? 0) + (rewardTotals.get(key) ?? 0),
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
  const rewards = buildFootprintRewardDetails(
    rewardLedgers,
    planetProgress,
    selectedKey,
    config.APP_TIME_ZONE,
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
  const dailyRewardStars = rewardTotals.get(todayKey) ?? 0;
  const weeklyRewardStars = Array.from(rewardTotals.entries())
    .filter(([date]) => date >= weekStartKey && date <= todayKey)
    .reduce((sum, [, stars]) => sum + stars, 0);
  dailyStats.stars += dailyRewardStars;
  weeklyStats.stars += weeklyRewardStars;
  const dailyGoalBonusPotential = child.dailyGoalBonusEnabled
    ? child.dailyGoalBonusStars
    : 0;
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
    rewards,
    leaderboards: {
      daily: buildMotivationalLeaderboard({
        childId,
        ...dailyStats,
        nickname: child.nickname,
        petType: child.petType,
        goalStars: child.dailyStarGoal,
        dailyGoalStars: child.dailyStarGoal,
        maxAvailableStars: dailyStats.maxAvailableStars + dailyGoalBonusPotential,
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
        maxAvailableStars:
          weeklyStats.maxAvailableStars + dailyGoalBonusPotential * elapsedWeekDays,
        seed: weekStartKey,
        scoreDays: weeklyScoreDays,
        competitorGrowthPercent: leaderboardSettings.competitorGrowthPercent,
        competitorStarDelta: leaderboardSettings.dailyCompetitorStarDelta,
      }),
    },
  };
}
