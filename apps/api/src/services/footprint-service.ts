import type { AppConfig } from "../config.js";
import { prisma } from "../lib/prisma.js";
import {
  addBusinessDays,
  businessDateAt,
  businessDateKey,
  startOfBusinessWeek,
} from "../lib/time.js";

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

  const tasks = await prisma.dailyTask.findMany({
    where: {
      childId,
      taskDate: { gte: weekStart, lte: weekEnd },
      status: "COMPLETED",
    },
    include: {
      attempts: {
        where: { status: "COMPLETED" },
        orderBy: { endedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ taskDate: "asc" }, { sortOrder: "asc" }],
  });

  const totals = new Map<string, number>();
  for (const task of tasks) {
    const attempt = task.attempts[0];
    if (!attempt) continue;
    const key = businessDateKey(task.taskDate);
    totals.set(
      key,
      (totals.get(key) ?? 0) +
        attempt.baseStarsAwarded +
        attempt.bonusStarsAwarded,
    );
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
    .map((task) => {
      const attempt = task.attempts[0]!;
      return {
        dailyTaskId: task.id,
        title: task.titleSnapshot,
        category: task.categorySnapshot,
        iconKey: task.iconKeySnapshot,
        baseStars: attempt.baseStarsAwarded,
        bonusStars: attempt.bonusStarsAwarded,
        totalStars:
          attempt.baseStarsAwarded + attempt.bonusStarsAwarded,
        completedAt: attempt.endedAt,
      };
    });

  return {
    weekStart: businessDateKey(weekStart),
    weekEnd: businessDateKey(weekEnd),
    selectedDate: selectedKey,
    days,
    tasks: details,
  };
}
