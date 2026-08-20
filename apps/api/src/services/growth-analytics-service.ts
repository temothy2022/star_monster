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
  startOfBusinessWeek,
} from "../lib/time.js";

type GrowthRange = {
  from: Date;
  to: Date;
  days: number;
};
type WishCategoryValue = (typeof WISH_CATEGORIES)[number];
type SpendingCategoryValue = WishCategoryValue | "PET_CARE" | "PET_TRAVEL" | "PET_ROOM_THEME";

type TaskCategoryIdentity = {
  key: string;
  baseCategory: TaskCategoryValue;
  label: string;
  color: string | null;
};

type TaskCategorySummary = TaskCategoryIdentity & {
  category: string;
  scheduledTasks: number;
  completedTasks: number;
  completedAttempts: number;
  failedAttempts: number;
  starsEarned: number;
  plannedSeconds: number;
  observedSeconds: number;
  observedAttempts: number;
  closedAttempts: number;
  timedAttempts: number;
};

const PET_SPENDING_CATEGORY_LABELS: Record<Exclude<SpendingCategoryValue, WishCategoryValue>, string> = {
  PET_CARE: "星宠照顾",
  PET_TRAVEL: "星宠旅行",
  PET_ROOM_THEME: "小屋背景",
};

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

function taskCategoryIdentity(task: {
  categorySnapshot: TaskCategory;
  customCategoryIdSnapshot: string | null;
  categoryLabelSnapshot: string | null;
  categoryColorSnapshot: string | null;
}): TaskCategoryIdentity {
  const baseCategory = normalizedTaskCategory(task.categorySnapshot);
  if (task.customCategoryIdSnapshot) {
    return {
      key: `CUSTOM:${task.customCategoryIdSnapshot}`,
      baseCategory,
      label: task.categoryLabelSnapshot?.trim() || "自定义分类",
      color: task.categoryColorSnapshot,
    };
  }
  return {
    key: baseCategory,
    baseCategory,
    label: TASK_CATEGORY_LABELS[baseCategory],
    color: task.categoryColorSnapshot,
  };
}

function isClosedEffortAttempt(status: string) {
  return !["RUNNING", "PAUSED", "ROLLED_BACK"].includes(status);
}

export function summarizeAttemptEffort(
  attempts: Array<{ status: string; elapsedSeconds: number | null }>,
) {
  const closedAttempts = attempts.filter((attempt) =>
    isClosedEffortAttempt(attempt.status),
  );
  const timedAttempts = closedAttempts.filter(
    (attempt) => attempt.elapsedSeconds !== null && attempt.elapsedSeconds > 0,
  );
  return {
    closedAttempts: closedAttempts.length,
    timedAttempts: timedAttempts.length,
    observedSeconds: timedAttempts.reduce(
      (sum, attempt) => sum + (attempt.elapsedSeconds ?? 0),
      0,
    ),
  };
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
        categoryLabelSnapshot: true,
        categoryColorSnapshot: true,
        customCategoryIdSnapshot: true,
        suggestedSecondsSnapshot: true,
        timeLimitSecondsSnapshot: true,
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
      select: { type: true, amount: true, createdAt: true, reason: true },
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
      categoryKey: string;
      categoryLabel: string;
      repeatableDaily: boolean;
      scheduledDays: number;
      completedDays: number;
      completedAttempts: number;
      failedAttempts: number;
      abandonedAttempts: number;
      starsEarned: number;
      completedElapsedSeconds: number;
      weeklyBreakdown: Map<
        string,
        { weekStart: string; scheduledDays: number; completedDays: number }
      >;
    }
  >();
  const categoryByKey = new Map<string, TaskCategorySummary>(
    TASK_CATEGORIES.map((category) => [
      category,
      {
        key: category,
        category: category as string,
        baseCategory: category,
        label: TASK_CATEGORY_LABELS[category],
        color: null as string | null,
        scheduledTasks: 0,
        completedTasks: 0,
        completedAttempts: 0,
        failedAttempts: 0,
        starsEarned: 0,
        plannedSeconds: 0,
        observedSeconds: 0,
        observedAttempts: 0,
        closedAttempts: 0,
        timedAttempts: 0,
      },
    ]),
  );

  for (const task of dailyTasks) {
    const dateKey = businessDateKey(task.taskDate);
    const daily = dailyByDate.get(dateKey);
    if (!daily) continue;
    const categoryIdentity = taskCategoryIdentity(task);
    const normalizedCategory = categoryIdentity.baseCategory;
    const completedAttempts = task.attempts.filter(
      (attempt) => attempt.status === "COMPLETED",
    );
    const effort = summarizeAttemptEffort(task.attempts);
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
      categoryKey: categoryIdentity.key,
      categoryLabel: categoryIdentity.label,
      repeatableDaily: task.repeatableDailySnapshot,
      scheduledDays: 0,
      completedDays: 0,
      completedAttempts: 0,
      failedAttempts: 0,
      abandonedAttempts: 0,
      starsEarned: 0,
      completedElapsedSeconds: 0,
      weeklyBreakdown: new Map(),
    };
    taskSummary.title = task.titleSnapshot;
    taskSummary.category = normalizedCategory;
    taskSummary.categoryKey = categoryIdentity.key;
    taskSummary.categoryLabel = categoryIdentity.label;
    taskSummary.repeatableDaily = task.repeatableDailySnapshot;
    taskSummary.scheduledDays += 1;
    taskSummary.completedDays += completed ? 1 : 0;
    taskSummary.completedAttempts += completedAttempts.length;
    taskSummary.failedAttempts += failedAttempts;
    taskSummary.abandonedAttempts += abandonedAttempts;
    taskSummary.starsEarned += starsEarned;
    taskSummary.completedElapsedSeconds += elapsedSeconds;
    const weekStart = businessDateKey(startOfBusinessWeek(task.taskDate));
    const weekly = taskSummary.weeklyBreakdown.get(weekStart) ?? {
      weekStart,
      scheduledDays: 0,
      completedDays: 0,
    };
    weekly.scheduledDays += 1;
    weekly.completedDays += completed ? 1 : 0;
    taskSummary.weeklyBreakdown.set(weekStart, weekly);
    taskById.set(task.templateId, taskSummary);

    const categorySummary = categoryByKey.get(categoryIdentity.key) ?? {
      key: categoryIdentity.key,
      category: categoryIdentity.key,
      baseCategory: categoryIdentity.baseCategory,
      label: categoryIdentity.label,
      color: categoryIdentity.color,
      scheduledTasks: 0,
      completedTasks: 0,
      completedAttempts: 0,
      failedAttempts: 0,
      starsEarned: 0,
      plannedSeconds: 0,
      observedSeconds: 0,
      observedAttempts: 0,
      closedAttempts: 0,
      timedAttempts: 0,
    };
    categorySummary.label = categoryIdentity.label;
    categorySummary.color = categoryIdentity.color;
    categorySummary.scheduledTasks += 1;
    categorySummary.completedTasks += completed ? 1 : 0;
    categorySummary.completedAttempts += completedAttempts.length;
    categorySummary.failedAttempts += failedAttempts;
    categorySummary.starsEarned += starsEarned;
    categorySummary.plannedSeconds += task.timeLimitSecondsSnapshot
      ?? task.suggestedSecondsSnapshot
      ?? 600;
    categorySummary.observedSeconds += effort.observedSeconds;
    categorySummary.observedAttempts += effort.timedAttempts;
    categorySummary.closedAttempts += effort.closedAttempts;
    categorySummary.timedAttempts += effort.timedAttempts;
    categoryByKey.set(categoryIdentity.key, categorySummary);
  }

  for (const ledger of ledgers) {
    const dateKey = ledgerDateKey(ledger.createdAt, timeZone);
    if (dateKey < fromKey || dateKey > toKey) continue;
    const daily = dailyByDate.get(dateKey);
    if (!daily) continue;
    if (ledger.type === "TASK_REWARD") daily.taskStarsEarned += Math.max(0, ledger.amount);
    if (ledger.type === "DAILY_GOAL_BONUS" || ledger.type === "PLANET_BONUS" || ledger.type === "PET_RED_PACKET_REWARD") {
      daily.bonusStarsEarned += Math.max(0, ledger.amount);
    }
    if (ledger.type === "TASK_REWARD_REVERSAL") {
      daily.rewardStarsReversed += Math.abs(ledger.amount);
    }
    if (["WISH_SPEND", "PET_CARE_SPEND", "PET_TRAVEL_SPEND", "PET_ROOM_THEME_SPEND"].includes(ledger.type)) {
      daily.starsSpent += Math.abs(ledger.amount);
    }
    if (["WISH_REFUND", "PET_REFUND"].includes(ledger.type)) {
      daily.starsRefunded += Math.max(0, ledger.amount);
    }
  }

  const spendingByCategory = new Map<
    SpendingCategoryValue,
    { category: SpendingCategoryValue; label: string; redemptionCount: number; starsSpent: number }
  >();
  for (const category of WISH_CATEGORIES) {
    spendingByCategory.set(category, {
      category,
      label: WISH_CATEGORY_LABELS[category],
      redemptionCount: 0,
      starsSpent: 0,
    });
  }
  for (const [category, label] of Object.entries(PET_SPENDING_CATEGORY_LABELS)) {
    const petCategory = category as Exclude<SpendingCategoryValue, WishCategoryValue>;
    spendingByCategory.set(petCategory, {
      category: petCategory,
      label,
      redemptionCount: 0,
      starsSpent: 0,
    });
  }
  const spendingByTitle = new Map<
    string,
    { title: string; category: SpendingCategoryValue; redemptionCount: number; starsSpent: number }
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

  for (const ledger of ledgers) {
    const petCategory = ledger.type === "PET_CARE_SPEND"
      ? "PET_CARE"
      : ledger.type === "PET_TRAVEL_SPEND"
        ? "PET_TRAVEL"
        : ledger.type === "PET_ROOM_THEME_SPEND"
          ? "PET_ROOM_THEME"
          : null;
    if (!petCategory) continue;
    const dateKey = ledgerDateKey(ledger.createdAt, timeZone);
    if (dateKey < fromKey || dateKey > toKey) continue;
    const category = spendingByCategory.get(petCategory);
    if (category) {
      category.redemptionCount += 1;
      category.starsSpent += Math.abs(ledger.amount);
    }
    const title = ledger.reason || PET_SPENDING_CATEGORY_LABELS[petCategory];
    const item = spendingByTitle.get(title) ?? {
      title,
      category: petCategory,
      redemptionCount: 0,
      starsSpent: 0,
    };
    item.redemptionCount += 1;
    item.starsSpent += Math.abs(ledger.amount);
    spendingByTitle.set(title, item);
  }

  const daily = Array.from(dailyByDate.values());
  const tasks = Array.from(taskById.values())
    .map((task) => {
      const { completedElapsedSeconds, weeklyBreakdown, ...summary } = task;
      return {
        ...summary,
        weeklyBreakdown: Array.from(weeklyBreakdown.values()).map((week) => ({
          ...week,
          completionRate: clampRate(week.completedDays, week.scheduledDays),
        })),
        categoryLabel: task.categoryLabel,
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
  const totalObservedSeconds = Array.from(categoryByKey.values()).reduce(
    (sum, category) => sum + category.observedSeconds,
    0,
  );
  const weeksInRange = Math.max(1, range.days / 7);
  const categories = Array.from(categoryByKey.values())
    .filter((category) => category.scheduledTasks > 0)
    .map(({ plannedSeconds, observedSeconds, ...category }) => ({
      ...category,
      completionRate: clampRate(category.completedTasks, category.scheduledTasks),
      plannedMinutes: Math.round(plannedSeconds / 6) / 10,
      observedMinutes: Math.round(observedSeconds / 6) / 10,
      weeklyPlannedMinutes: Math.round((plannedSeconds / 60 / weeksInRange) * 10) / 10,
      weeklyObservedMinutes: Math.round((observedSeconds / 60 / weeksInRange) * 10) / 10,
      weeklyObservedSessions: Math.round((category.observedAttempts / weeksInRange) * 10) / 10,
      effortShare: totalObservedSeconds > 0 ? observedSeconds / totalObservedSeconds : 0,
      timeCoverageRate: clampRate(category.timedAttempts, category.closedAttempts),
    }))
    .sort(
      (left, right) =>
        right.weeklyObservedMinutes - left.weeklyObservedMinutes ||
        right.scheduledTasks - left.scheduledTasks,
    );
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
  const preferredWishCategory = spending.find((item) =>
    WISH_CATEGORIES.includes(item.category as WishCategoryValue),
  )?.category as WishCategoryValue | undefined;
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
      preferredWishCategory: preferredWishCategory ?? null,
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
