import type { TaskCategory, WishCategory } from "@prisma/client";
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  type TaskCategoryValue,
  WISH_CATEGORIES,
  WISH_CATEGORY_LABELS,
} from "../domain/constants.js";
import { prisma } from "../lib/prisma.js";
import {
  addBusinessDays,
  businessDateAt,
  businessDateKey,
} from "../lib/time.js";

type GrowthRange = {
  from: Date;
  to: Date;
  days: number;
};
type WishCategoryValue = (typeof WISH_CATEGORIES)[number];

function clampRate(completed: number, scheduled: number) {
  return scheduled > 0 ? Math.min(1, completed / scheduled) : 0;
}

function normalizedTaskCategory(category: TaskCategory): TaskCategoryValue {
  if (category === "READING") return "CHINESE";
  if (category === "PE") return "EXERCISE";
  if (category === "ORGANIZING") return "CHORES";
  if (category === "MUSIC") return "OTHER";
  return category;
}

function normalizedWishCategory(category: WishCategory): WishCategoryValue {
  return category === "GAMES" ? "TELEVISION" : category;
}

function rangeDateKeys(from: Date, to: Date) {
  const keys: string[] = [];
  for (let date = from; date <= to; date = addBusinessDays(date, 1)) {
    keys.push(businessDateKey(date));
  }
  return keys;
}

function ledgerDateKey(createdAt: Date, timeZone: string) {
  return businessDateKey(businessDateAt(createdAt, timeZone));
}

export function growthAnalyticsRange(
  days: number,
  now: Date,
  timeZone: string,
): GrowthRange {
  const to = businessDateAt(now, timeZone);
  return { from: addBusinessDays(to, -(days - 1)), to, days };
}

export async function getGrowthAnalyticsForRange(
  childId: string,
  range: GrowthRange,
  timeZone: string,
) {
  const fromKey = businessDateKey(range.from);
  const toKey = businessDateKey(range.to);
  const broadCreatedAtRange = {
    gte: addBusinessDays(range.from, -1),
    lt: addBusinessDays(range.to, 2),
  };

  const [dailyTasks, ledgers, redemptions] = await Promise.all([
    prisma.dailyTask.findMany({
      where: {
        childId,
        taskDate: { gte: range.from, lte: range.to },
      },
      orderBy: [{ taskDate: "asc" }, { sortOrder: "asc" }],
      select: {
        templateId: true,
        taskDate: true,
        titleSnapshot: true,
        categorySnapshot: true,
        repeatableDailySnapshot: true,
        attempts: {
          select: {
            status: true,
            elapsedSeconds: true,
            baseStarsAwarded: true,
            bonusStarsAwarded: true,
          },
        },
      },
    }),
    prisma.starLedger.findMany({
      where: { childId, createdAt: broadCreatedAtRange },
      select: { type: true, amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.wishRedemption.findMany({
      where: {
        childId,
        status: "COMPLETED",
        completedAt: broadCreatedAtRange,
      },
      select: {
        titleSnapshot: true,
        categorySnapshot: true,
        costStarsSnapshot: true,
        completedAt: true,
      },
      orderBy: { completedAt: "asc" },
    }),
  ]);

  const dailyByDate = new Map(
    rangeDateKeys(range.from, range.to).map((date) => [
      date,
      {
        date,
        scheduledTasks: 0,
        completedTasks: 0,
        completedAttempts: 0,
        failedAttempts: 0,
        abandonedAttempts: 0,
        taskStarsEarned: 0,
        bonusStarsEarned: 0,
        rewardStarsReversed: 0,
        starsSpent: 0,
        starsRefunded: 0,
      },
    ]),
  );
  const taskById = new Map<
    string,
    {
      templateId: string;
      title: string;
      category: TaskCategoryValue;
      repeatableDaily: boolean;
      scheduledDays: number;
      completedDays: number;
      completedAttempts: number;
      failedAttempts: number;
      abandonedAttempts: number;
      starsEarned: number;
      completedElapsedSeconds: number;
    }
  >();
  const categoryByKey = new Map(
    TASK_CATEGORIES.map((category) => [
      category,
      {
        category,
        label: TASK_CATEGORY_LABELS[category],
        scheduledTasks: 0,
        completedTasks: 0,
        completedAttempts: 0,
        failedAttempts: 0,
        starsEarned: 0,
      },
    ]),
  );

  for (const task of dailyTasks) {
    const dateKey = businessDateKey(task.taskDate);
    const daily = dailyByDate.get(dateKey);
    if (!daily) continue;
    const normalizedCategory = normalizedTaskCategory(task.categorySnapshot);
    const completedAttempts = task.attempts.filter(
      (attempt) => attempt.status === "COMPLETED",
    );
    const failedAttempts = task.attempts.filter(
      (attempt) => attempt.status === "FAILED" || attempt.status === "TIMED_OUT",
    ).length;
    const abandonedAttempts = task.attempts.filter(
      (attempt) => attempt.status === "ABANDONED" || attempt.status === "DAY_ENDED",
    ).length;
    const completed = completedAttempts.length > 0;
    const starsEarned = completedAttempts.reduce(
      (sum, attempt) =>
        sum + attempt.baseStarsAwarded + attempt.bonusStarsAwarded,
      0,
    );
    const elapsedSeconds = completedAttempts.reduce(
      (sum, attempt) => sum + (attempt.elapsedSeconds ?? 0),
      0,
    );

    daily.scheduledTasks += 1;
    daily.completedTasks += completed ? 1 : 0;
    daily.completedAttempts += completedAttempts.length;
    daily.failedAttempts += failedAttempts;
    daily.abandonedAttempts += abandonedAttempts;

    const taskSummary = taskById.get(task.templateId) ?? {
      templateId: task.templateId,
      title: task.titleSnapshot,
      category: normalizedCategory,
      repeatableDaily: task.repeatableDailySnapshot,
      scheduledDays: 0,
      completedDays: 0,
      completedAttempts: 0,
      failedAttempts: 0,
      abandonedAttempts: 0,
      starsEarned: 0,
      completedElapsedSeconds: 0,
    };
    taskSummary.title = task.titleSnapshot;
    taskSummary.category = normalizedCategory;
    taskSummary.repeatableDaily = task.repeatableDailySnapshot;
    taskSummary.scheduledDays += 1;
    taskSummary.completedDays += completed ? 1 : 0;
    taskSummary.completedAttempts += completedAttempts.length;
    taskSummary.failedAttempts += failedAttempts;
    taskSummary.abandonedAttempts += abandonedAttempts;
    taskSummary.starsEarned += starsEarned;
    taskSummary.completedElapsedSeconds += elapsedSeconds;
    taskById.set(task.templateId, taskSummary);

    const categorySummary = categoryByKey.get(normalizedCategory);
    if (categorySummary) {
      categorySummary.scheduledTasks += 1;
      categorySummary.completedTasks += completed ? 1 : 0;
      categorySummary.completedAttempts += completedAttempts.length;
      categorySummary.failedAttempts += failedAttempts;
      categorySummary.starsEarned += starsEarned;
    }
  }

  for (const ledger of ledgers) {
    const dateKey = ledgerDateKey(ledger.createdAt, timeZone);
    if (dateKey < fromKey || dateKey > toKey) continue;
    const daily = dailyByDate.get(dateKey);
    if (!daily) continue;
    if (ledger.type === "TASK_REWARD") daily.taskStarsEarned += Math.max(0, ledger.amount);
    if (ledger.type === "DAILY_GOAL_BONUS" || ledger.type === "PLANET_BONUS") {
      daily.bonusStarsEarned += Math.max(0, ledger.amount);
    }
    if (ledger.type === "TASK_REWARD_REVERSAL") {
      daily.rewardStarsReversed += Math.abs(ledger.amount);
    }
    if (["WISH_SPEND", "PET_CARE_SPEND", "PET_TRAVEL_SPEND"].includes(ledger.type)) {
      daily.starsSpent += Math.abs(ledger.amount);
    }
    if (["WISH_REFUND", "PET_REFUND"].includes(ledger.type)) {
      daily.starsRefunded += Math.max(0, ledger.amount);
    }
  }

  const spendingByCategory = new Map(
    WISH_CATEGORIES.map((category) => [
      category,
      {
        category,
        label: WISH_CATEGORY_LABELS[category],
        redemptionCount: 0,
        starsSpent: 0,
      },
    ]),
  );
  const spendingByTitle = new Map<
    string,
    { title: string; category: WishCategoryValue; redemptionCount: number; starsSpent: number }
  >();
  for (const redemption of redemptions) {
    if (!redemption.completedAt) continue;
    const dateKey = ledgerDateKey(redemption.completedAt, timeZone);
    if (dateKey < fromKey || dateKey > toKey) continue;
    const normalizedCategory = normalizedWishCategory(
      redemption.categorySnapshot,
    );
    const category = spendingByCategory.get(normalizedCategory);
    if (category) {
      category.redemptionCount += 1;
      category.starsSpent += redemption.costStarsSnapshot;
    }
    const title = spendingByTitle.get(redemption.titleSnapshot) ?? {
      title: redemption.titleSnapshot,
      category: normalizedCategory,
      redemptionCount: 0,
      starsSpent: 0,
    };
    title.redemptionCount += 1;
    title.starsSpent += redemption.costStarsSnapshot;
    spendingByTitle.set(redemption.titleSnapshot, title);
  }

  const daily = Array.from(dailyByDate.values());
  const tasks = Array.from(taskById.values())
    .map((task) => {
      const { completedElapsedSeconds, ...summary } = task;
      return {
        ...summary,
        categoryLabel: TASK_CATEGORY_LABELS[task.category],
        completionRate: clampRate(task.completedDays, task.scheduledDays),
        averageMinutes: task.completedAttempts
          ? Math.round((completedElapsedSeconds / task.completedAttempts / 60) * 10) / 10
          : null,
      };
    })
    .sort(
      (left, right) =>
        right.scheduledDays - left.scheduledDays ||
        right.completionRate - left.completionRate ||
        left.title.localeCompare(right.title, "zh-CN"),
    );
  const categories = Array.from(categoryByKey.values())
    .filter((category) => category.scheduledTasks > 0)
    .map((category) => ({
      ...category,
      completionRate: clampRate(
        category.completedTasks,
        category.scheduledTasks,
      ),
    }))
    .sort((left, right) => right.scheduledTasks - left.scheduledTasks);
  const starsSpent = daily.reduce((sum, item) => sum + item.starsSpent, 0);
  const spending = Array.from(spendingByCategory.values())
    .filter((item) => item.redemptionCount > 0)
    .map((item) => ({
      ...item,
      share: starsSpent > 0 ? item.starsSpent / starsSpent : 0,
    }))
    .sort((left, right) => right.starsSpent - left.starsSpent);
  const spendingItems = Array.from(spendingByTitle.values()).sort(
    (left, right) => right.starsSpent - left.starsSpent,
  );
  const scheduledTasks = dailyTasks.length;
  const completedTasks = daily.reduce(
    (sum, item) => sum + item.completedTasks,
    0,
  );
  const activeDays = daily.filter(
    (item) => item.completedAttempts > 0 || item.starsSpent > 0,
  ).length;
  const taskStarsEarned = daily.reduce(
    (sum, item) => sum + item.taskStarsEarned,
    0,
  );
  const bonusStarsEarned = daily.reduce(
    (sum, item) => sum + item.bonusStarsEarned,
    0,
  );
  const rewardStarsReversed = daily.reduce(
    (sum, item) => sum + item.rewardStarsReversed,
    0,
  );
  const starsRefunded = daily.reduce(
    (sum, item) => sum + item.starsRefunded,
    0,
  );
  const insightCandidates = tasks.filter((task) => task.scheduledDays >= 2);
  const strongTasks = [...insightCandidates]
    .filter((task) => task.completionRate >= 0.8)
    .sort(
      (left, right) =>
        right.completionRate - left.completionRate ||
        right.scheduledDays - left.scheduledDays,
    )
    .slice(0, 3)
    .map((task) => task.templateId);
  const focusTasks = [...insightCandidates]
    .filter(
      (task) =>
        task.completionRate < 0.8 ||
        task.failedAttempts + task.abandonedAttempts > 0,
    )
    .sort(
      (left, right) =>
        left.completionRate - right.completionRate ||
        right.failedAttempts + right.abandonedAttempts -
          (left.failedAttempts + left.abandonedAttempts),
    )
    .slice(0, 3)
    .map((task) => task.templateId);

  return {
    range: { days: range.days, from: fromKey, to: toKey },
    summary: {
      scheduledTasks,
      completedTasks,
      completionRate: clampRate(completedTasks, scheduledTasks),
      activeDays,
      taskStarsEarned,
      bonusStarsEarned,
      rewardStarsReversed,
      starsSpent,
      starsRefunded,
      netStars:
        taskStarsEarned +
        bonusStarsEarned -
        rewardStarsReversed -
        starsSpent +
        starsRefunded,
    },
    daily,
    categories,
    tasks,
    spending,
    spendingItems,
    insights: {
      strongTaskIds: strongTasks,
      focusTaskIds: focusTasks,
      preferredWishCategory: spending[0]?.category ?? null,
    },
  };
}

export function getGrowthAnalytics(
  childId: string,
  days: number,
  now: Date,
  timeZone: string,
) {
  return getGrowthAnalyticsForRange(
    childId,
    growthAnalyticsRange(days, now, timeZone),
    timeZone,
  );
}
