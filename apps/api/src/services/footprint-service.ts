import type { AppConfig } from "../config.js";
import { prisma } from "../lib/prisma.js";
import {
  addBusinessDays,
  businessDateAt,
  businessDateKey,
  startOfBusinessWeek,
} from "../lib/time.js";
import {
  buildChildLeaderboard,
  type LeaderboardCandidate,
} from "../domain/child-leaderboard.js";

type LeaderboardCandidates = {
  daily: LeaderboardCandidate[];
  weekly: LeaderboardCandidate[];
};

let leaderboardCache:
  | {
      key: string;
      expiresAt: number;
      candidates: LeaderboardCandidates;
    }
  | undefined;

async function getLeaderboardCandidates(
  weekStart: Date,
  weekEnd: Date,
  todayKey: string,
): Promise<LeaderboardCandidates> {
  const cacheKey = `${businessDateKey(weekStart)}:${todayKey}`;
  if (
    leaderboardCache?.key === cacheKey &&
    leaderboardCache.expiresAt > Date.now()
  ) {
    return leaderboardCache.candidates;
  }

  const [children, attempts] = await Promise.all([
    prisma.childProfile.findMany({
      where: {
        status: "ACTIVE",
        family: { status: "ACTIVE" },
        onboardingCompletedAt: { not: null },
      },
      select: { id: true, petType: true },
    }),
    prisma.taskAttempt.findMany({
      where: {
        status: "COMPLETED",
        child: {
          status: "ACTIVE",
          onboardingCompletedAt: { not: null },
          family: { status: "ACTIVE" },
        },
        dailyTask: { taskDate: { gte: weekStart, lte: weekEnd } },
      },
      select: {
        childId: true,
        baseStarsAwarded: true,
        bonusStarsAwarded: true,
        dailyTask: { select: { taskDate: true } },
      },
    }),
  ]);

  const candidateByChildId = new Map<
    string,
    {
      childId: string;
      petType: LeaderboardCandidate["petType"];
      dailyStars: number;
      dailyTasks: number;
      weeklyStars: number;
      weeklyTasks: number;
    }
  >(
    children.map((child) => [
      child.id,
      {
        childId: child.id,
        petType: child.petType,
        dailyStars: 0,
        dailyTasks: 0,
        weeklyStars: 0,
        weeklyTasks: 0,
      },
    ]),
  );

  for (const attempt of attempts) {
    const candidate = candidateByChildId.get(attempt.childId);
    if (!candidate) continue;
    const stars = attempt.baseStarsAwarded + attempt.bonusStarsAwarded;
    candidate.weeklyStars += stars;
    candidate.weeklyTasks += 1;
    if (businessDateKey(attempt.dailyTask.taskDate) === todayKey) {
      candidate.dailyStars += stars;
      candidate.dailyTasks += 1;
    }
  }

  const candidates = {
    daily: Array.from(candidateByChildId.values()).map((candidate) => ({
      childId: candidate.childId,
      petType: candidate.petType,
      stars: candidate.dailyStars,
      completedTasks: candidate.dailyTasks,
    })),
    weekly: Array.from(candidateByChildId.values()).map((candidate) => ({
      childId: candidate.childId,
      petType: candidate.petType,
      stars: candidate.weeklyStars,
      completedTasks: candidate.weeklyTasks,
    })),
  } satisfies LeaderboardCandidates;

  leaderboardCache = {
    key: cacheKey,
    expiresAt: Date.now() + 3_000,
    candidates,
  };
  return candidates;
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
  const [tasks, leaderboardCandidates] = await Promise.all([
    prisma.dailyTask.findMany({
      where: {
        childId,
        taskDate: { gte: weekStart, lte: weekEnd },
        attempts: { some: { status: "COMPLETED" } },
      },
      include: {
        attempts: {
          where: { status: "COMPLETED" },
          orderBy: { endedAt: "desc" },
        },
      },
      orderBy: [{ taskDate: "asc" }, { sortOrder: "asc" }],
    }),
    getLeaderboardCandidates(weekStart, weekEnd, todayKey),
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

  return {
    weekStart: businessDateKey(weekStart),
    weekEnd: businessDateKey(weekEnd),
    selectedDate: selectedKey,
    days,
    tasks: details,
    leaderboards: {
      daily: buildChildLeaderboard(leaderboardCandidates.daily, childId),
      weekly: buildChildLeaderboard(leaderboardCandidates.weekly, childId),
    },
  };
}
