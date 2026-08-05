import {
  Prisma,
  type DailyTask,
  type TaskAttempt,
  type TaskTemplate,
} from "@prisma/client";
import { performance } from "node:perf_hooks";
import type { AppConfig } from "../config.js";
import {
  activeElapsedSeconds,
  consecutiveScoredDays,
  dailyGoalBonusAmount,
  dailyTaskStatusAfterCompletion,
  isTemplateEligibleBySchedule,
  lifetimeStarsAfterTaskRefund,
  remainingSeconds,
  taskReward,
} from "../domain/task-rules.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";

type AttemptWithTask = TaskAttempt & { dailyTask: DailyTask };
type CompleteTaskTiming = { stage: string; ms: number };
type CompleteTaskOptions = {
  now?: Date;
  onTiming?: (timing: CompleteTaskTiming) => void;
};

async function normalizeSystemTaskSnapshot(
  tx: Prisma.TransactionClient,
  dailyTask: DailyTask,
): Promise<DailyTask> {
  const template = await tx.taskTemplate.findUnique({
    where: { id: dailyTask.templateId },
    select: {
      systemManaged: true,
      experienceKind: true,
      title: true,
      category: true,
      iconKey: true,
    },
  });
  if (
    !template?.systemManaged ||
    (dailyTask.experienceKindSnapshot === template.experienceKind &&
      dailyTask.titleSnapshot === template.title)
  ) {
    return dailyTask;
  }
  return tx.dailyTask.update({
    where: { id: dailyTask.id },
    data: {
      experienceKindSnapshot: template.experienceKind,
      titleSnapshot: template.title,
      categorySnapshot: template.category,
      iconKeySnapshot: template.iconKey,
    },
  });
}

async function ensureHanziReviewTemplate(childId: string): Promise<void> {
  const settings = await prisma.hanziLearningSettings.findUnique({
    where: { childId },
    select: { reviewTaskStars: true },
  });
  if (!settings) return;
  await prisma.taskTemplate.upsert({
    where: { systemKey: `hanzi-review:${childId}` },
    create: {
      childId,
      systemKey: `hanzi-review:${childId}`,
      title: "复习汉字",
      category: "CHINESE",
      iconKey: "chinese",
      mode: "UNTIMED",
      experienceKind: "HANZI_REVIEW",
      suggestedSeconds: 600,
      timeLimitSeconds: null,
      baseStars: settings.reviewTaskStars,
      earlyBonusEnabled: false,
      earlyThresholdSeconds: null,
      earlyBonusStars: null,
      repeatableDaily: false,
      scheduleKind: "DAILY",
      weekdays: [],
      oneTimeDate: null,
      sortOrder: 6,
      isEnabled: true,
      aiSchedulingEnabled: false,
      targetSessionsPerWeek: null,
      minimumGapDays: null,
      systemManaged: true,
      learningPracticeKind: "REVIEW",
    },
    update: {
      title: "复习汉字",
      category: "CHINESE",
      iconKey: "chinese",
      mode: "UNTIMED",
      experienceKind: "HANZI_REVIEW",
      suggestedSeconds: 600,
      timeLimitSeconds: null,
      baseStars: settings.reviewTaskStars,
      earlyBonusEnabled: false,
      earlyThresholdSeconds: null,
      earlyBonusStars: null,
      repeatableDaily: false,
      scheduleKind: "DAILY",
      weekdays: [],
      oneTimeDate: null,
      sortOrder: 6,
      isEnabled: true,
      aiSchedulingEnabled: false,
      targetSessionsPerWeek: null,
      minimumGapDays: null,
      systemManaged: true,
      learningPracticeKind: "REVIEW",
    },
  });
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function findActiveDailyGoalBonus(
  client: Prisma.TransactionClient | typeof prisma,
  childId: string,
  businessDateKey: string,
) {
  const bonusLedgers = await client.starLedger.findMany({
    where: {
      childId,
      type: "DAILY_GOAL_BONUS",
      idempotencyKey: { startsWith: `daily-goal:${childId}:${businessDateKey}` },
    },
    orderBy: { createdAt: "desc" },
    select: { amount: true, referenceId: true },
  });
  const referenceIds = bonusLedgers.flatMap((ledger) =>
    ledger.referenceId ? [ledger.referenceId] : [],
  );
  if (referenceIds.length === 0) return null;

  const refundLedgers = await client.starLedger.findMany({
    where: {
      childId,
      type: "TASK_REWARD_REVERSAL",
      referenceId: { in: referenceIds },
    },
    select: { referenceId: true },
  });
  const refundedAttemptIds = new Set(
    refundLedgers.flatMap((ledger) => ledger.referenceId ? [ledger.referenceId] : []),
  );
  return bonusLedgers.find(
    (ledger) => ledger.referenceId && !refundedAttemptIds.has(ledger.referenceId),
  ) ?? null;
}

async function settlePreviousDay(
  childId: string,
  today: Date,
  now: Date,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const slot = await tx.activeTaskSlot.findUnique({
      where: { childId },
      include: { attempt: { include: { dailyTask: true } } },
    });

    if (slot && slot.attempt.dailyTask.taskDate < today) {
      const attempt = slot.attempt;
      const elapsedSeconds = activeElapsedSeconds(attempt, now);
      await tx.taskAttempt.update({
        where: { id: attempt.id },
        data: {
          status:
            attempt.dailyTask.modeSnapshot === "TIMED"
              ? "TIMED_OUT"
              : "DAY_ENDED",
          endedAt: now,
          elapsedSeconds,
          remainingSeconds:
            attempt.dailyTask.modeSnapshot === "TIMED"
              ? Math.max(
                  0,
                  (attempt.dailyTask.timeLimitSecondsSnapshot ?? 0) -
                    elapsedSeconds,
                )
              : null,
        },
      });
      await tx.activeTaskSlot.delete({ where: { childId } });
    }

    await tx.dailyTask.updateMany({
      where: {
        childId,
        taskDate: { lt: today },
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
      data: { status: "EXPIRED", expiredAt: now },
    });
  });
}

async function eligibleTaskTemplates(
  childId: string,
  businessDate: Date,
): Promise<TaskTemplate[]> {
  await ensureHanziReviewTemplate(childId);
  const templates = await prisma.taskTemplate.findMany({
    where: {
      childId,
      isEnabled: true,
      archivedAt: null,
    },
  });

  const due = templates.filter((template) =>
    isTemplateEligibleBySchedule(template, businessDate),
  );
  if (due.length === 0) return [];

  const needsPoemLearning = due.some(
    (template) => template.experienceKind === "POEM_LEARNING",
  );
  const needsPoemReview = due.some(
    (template) => template.experienceKind === "POEM_REVIEW",
  );
  const needsHanziReview = due.some(
    (template) => template.experienceKind === "HANZI_REVIEW",
  );
  const [newPoem, dueReview, dueHanziReview] = await Promise.all([
    needsPoemLearning
      ? prisma.poem.findFirst({
          where: {
            isEnabled: true,
            progress: { none: { childId } },
          },
          select: { id: true },
        })
      : null,
    needsPoemReview
      ? prisma.poemLearningProgress.findFirst({
          where: {
            childId,
            status: "LEARNING",
            nextReviewDate: { lte: businessDate },
            poem: { isEnabled: true },
          },
          select: { id: true },
        })
      : null,
    needsHanziReview
      ? prisma.hanziLearningProgress.findFirst({
          where: {
            childId,
            status: "LEARNING",
            nextReviewDate: { lte: businessDate },
            character: { isEnabled: true },
          },
          select: { id: true },
        })
      : null,
  ]);

  return due.filter((template) => {
    if (template.experienceKind === "POEM_LEARNING") return Boolean(newPoem);
    if (template.experienceKind === "POEM_REVIEW") return Boolean(dueReview);
    if (template.experienceKind === "HANZI_REVIEW") return Boolean(dueHanziReview);
    return true;
  });
}

export async function generateDailyTasks(
  childId: string,
  businessDate: Date,
): Promise<TaskTemplate[]> {
  const due = await eligibleTaskTemplates(childId, businessDate);
  if (due.length === 0) return due;

  await prisma.dailyTask.createMany({
    skipDuplicates: true,
    data: due.map((template) => ({
      childId,
      templateId: template.id,
      taskDate: businessDate,
      sortOrder: template.sortOrder,
      titleSnapshot: template.title,
      categorySnapshot: template.category,
      iconKeySnapshot: template.iconKey,
      modeSnapshot: template.mode,
      experienceKindSnapshot: template.experienceKind,
      suggestedSecondsSnapshot: template.suggestedSeconds,
      timeLimitSecondsSnapshot: template.timeLimitSeconds,
      baseStarsSnapshot: template.baseStars,
      earlyBonusEnabledSnapshot: template.earlyBonusEnabled,
      earlyThresholdSecsSnapshot: template.earlyThresholdSeconds,
      earlyBonusStarsSnapshot: template.earlyBonusStars,
      repeatableDailySnapshot: template.repeatableDaily,
    })),
  });
  return due;
}

/**
 * DailyTask rows are snapshots, so changing or archiving a template does not
 * automatically remove a snapshot that was generated earlier in the day.
 * Reconcile pending snapshots whenever the child task list is prepared. This
 * keeps the child view in sync while preserving completed/in-progress history.
 */
async function reconcileTodayTaskSnapshots(
  childId: string,
  today: Date,
  now: Date,
  dueTemplates: TaskTemplate[],
): Promise<void> {
  const dailyTasks = await prisma.dailyTask.findMany({
    where: { childId, taskDate: today, status: "PENDING" },
    select: { id: true, templateId: true },
  });

  if (dailyTasks.length === 0) return;

  const dueTemplateIds = new Set(dueTemplates.map((template) => template.id));
  const staleIds = dailyTasks
    .filter((dailyTask) => !dueTemplateIds.has(dailyTask.templateId))
    .map((dailyTask) => dailyTask.id);

  if (staleIds.length === 0) return;

  await prisma.dailyTask.updateMany({
    where: { id: { in: staleIds }, status: "PENDING" },
    data: { status: "EXPIRED", expiredAt: now },
  });
}

async function normalizeTodaySystemSnapshots(
  childId: string,
  today: Date,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const tasks = await tx.dailyTask.findMany({
      where: {
        childId,
        taskDate: today,
        status: { not: "EXPIRED" },
        template: { systemManaged: true },
      },
      include: {
        template: {
          select: {
            experienceKind: true,
            title: true,
            category: true,
            iconKey: true,
          },
        },
      },
    });
    for (const task of tasks) {
      if (
        task.experienceKindSnapshot === task.template.experienceKind &&
        task.titleSnapshot === task.template.title
      ) {
        continue;
      }
      await tx.dailyTask.update({
        where: { id: task.id },
        data: {
          experienceKindSnapshot: task.template.experienceKind,
          titleSnapshot: task.template.title,
          categorySnapshot: task.template.category,
          iconKeySnapshot: task.template.iconKey,
        },
      });
    }
  });
}

async function settleTimedOutAttempt(
  childId: string,
  now: Date,
): Promise<AttemptWithTask | null> {
  const slot = await prisma.activeTaskSlot.findUnique({
    where: { childId },
    include: { attempt: { include: { dailyTask: true } } },
  });
  if (!slot) return null;

  const attempt = slot.attempt;
  const task = attempt.dailyTask;
  if (
    attempt.status !== "RUNNING" ||
    task.modeSnapshot !== "TIMED" ||
    remainingSeconds(attempt, task.timeLimitSecondsSnapshot ?? 0, now) > 0
  ) {
    return null;
  }

  const elapsedSeconds = activeElapsedSeconds(attempt, now);
  await prisma.$transaction([
    prisma.taskAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "TIMED_OUT",
        endedAt: now,
        elapsedSeconds,
        remainingSeconds: 0,
      },
    }),
    prisma.dailyTask.update({
      where: { id: task.id },
      data: { status: "PENDING" },
    }),
    prisma.activeTaskSlot.delete({ where: { childId } }),
  ]);

  return { ...attempt, status: "TIMED_OUT", endedAt: now };
}

export async function prepareDailyTasks(
  childId: string,
  config: AppConfig,
  now = new Date(),
): Promise<{ timedOutAttemptId: string | null }> {
  const today = businessDateAt(now, config.APP_TIME_ZONE);
  await settlePreviousDay(childId, today, now);
  const dueTemplates = await generateDailyTasks(childId, today);
  await reconcileTodayTaskSnapshots(childId, today, now, dueTemplates);
  await normalizeTodaySystemSnapshots(childId, today);
  const timedOutAttempt = await settleTimedOutAttempt(childId, now);
  return { timedOutAttemptId: timedOutAttempt?.id ?? null };
}

export async function getTodayTaskExperience(
  childId: string,
  config: AppConfig,
  now = new Date(),
) {
  const today = businessDateAt(now, config.APP_TIME_ZONE);
  const todayKey = today.toISOString().slice(0, 10);
  const { timedOutAttemptId } = await prepareDailyTasks(childId, config, now);

  const streakLookback = new Date(today);
  streakLookback.setUTCDate(streakLookback.getUTCDate() - 400);

  const [child, tasks, activeSlot, scoredDays, completedStars] = await Promise.all([
    prisma.childProfile.findUniqueOrThrow({
      where: { id: childId },
      select: { dailyStarGoal: true, starBalance: true },
    }),
    prisma.dailyTask.findMany({
      where: { childId, taskDate: today, status: { not: "EXPIRED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        childId: true,
        templateId: true,
        taskDate: true,
        status: true,
        sortOrder: true,
        titleSnapshot: true,
        categorySnapshot: true,
        iconKeySnapshot: true,
        modeSnapshot: true,
        experienceKindSnapshot: true,
        suggestedSecondsSnapshot: true,
        timeLimitSecondsSnapshot: true,
        baseStarsSnapshot: true,
        earlyBonusEnabledSnapshot: true,
        earlyThresholdSecsSnapshot: true,
        earlyBonusStarsSnapshot: true,
        repeatableDailySnapshot: true,
        completedAt: true,
        completionDurationSeconds: true,
        expiredAt: true,
        createdAt: true,
        updatedAt: true,
        attempts: {
          where: { status: "COMPLETED" },
          orderBy: { endedAt: "desc" },
          take: 1,
          select: {
            baseStarsAwarded: true,
            bonusStarsAwarded: true,
          },
        },
        _count: {
          select: {
            attempts: { where: { status: "COMPLETED" } },
          },
        },
      },
    }),
    prisma.activeTaskSlot.findUnique({
      where: { childId },
      include: { attempt: { include: { dailyTask: true } } },
    }),
    prisma.dailyTask.findMany({
      where: {
        childId,
        taskDate: { gte: streakLookback, lte: today },
        attempts: {
          some: {
            status: "COMPLETED",
            OR: [
              { baseStarsAwarded: { gt: 0 } },
              { bonusStarsAwarded: { gt: 0 } },
            ],
          },
        },
      },
      select: { taskDate: true },
      distinct: ["taskDate"],
    }),
    prisma.taskAttempt.aggregate({
      where: {
        childId,
        status: "COMPLETED",
        dailyTask: { taskDate: today },
      },
      _sum: { baseStarsAwarded: true, bonusStarsAwarded: true },
    }),
  ]);

  const taskStarsEarnedToday =
    (completedStars._sum.baseStarsAwarded ?? 0) +
    (completedStars._sum.bonusStarsAwarded ?? 0);
  const dailyGoalBonus = await findActiveDailyGoalBonus(prisma, childId, todayKey);
  const dailyGoalBonusStars = dailyGoalBonus?.amount ?? 0;
  const earnedToday = taskStarsEarnedToday + dailyGoalBonusStars;
  const serializedTasks = tasks.map(({ _count, ...task }) => ({
    ...task,
    completedAttemptCount: _count.attempts,
  }));

  const activeAttempt = activeSlot?.attempt;
  const activeRemaining =
    activeAttempt?.dailyTask.modeSnapshot === "TIMED"
      ? remainingSeconds(
          activeAttempt,
          activeAttempt.dailyTask.timeLimitSecondsSnapshot ?? 0,
          now,
        )
      : null;

  return {
    date: todayKey,
    earnedToday,
    dailyGoalBonusStars,
    streakDays: consecutiveScoredDays(
      scoredDays.map((item) => item.taskDate.toISOString().slice(0, 10)),
      today,
    ),
    dailyStarGoal: child.dailyStarGoal,
    starBalance: child.starBalance,
    tasks: serializedTasks,
    active: activeAttempt
      ? {
          ...activeAttempt,
          elapsedSeconds: activeElapsedSeconds(activeAttempt, now),
          remainingSeconds: activeRemaining,
        }
      : null,
    timedOutAttemptId,
  };
}

export async function startTask(
  childId: string,
  dailyTaskId: string,
  config: AppConfig,
  now = new Date(),
): Promise<{ attempt: AttemptWithTask; alreadyActive: boolean }> {
  const today = businessDateAt(now, config.APP_TIME_ZONE);
  await settlePreviousDay(childId, today, now);
  await settleTimedOutAttempt(childId, now);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existingSlot = await tx.activeTaskSlot.findUnique({
          where: { childId },
          include: { attempt: { include: { dailyTask: true } } },
        });
        if (existingSlot) {
          const dailyTask = await normalizeSystemTaskSnapshot(
            tx,
            existingSlot.attempt.dailyTask,
          );
          return {
            attempt: { ...existingSlot.attempt, dailyTask },
            alreadyActive: true,
          };
        }

        const loadedTask = await tx.dailyTask.findFirst({
          where: { id: dailyTaskId, childId, taskDate: today },
        });
        if (!loadedTask) {
          throw new HttpError(404, "TASK_NOT_FOUND", "没有找到今天的这个任务");
        }
        const task = await normalizeSystemTaskSnapshot(tx, loadedTask);
        if (task.status === "COMPLETED") {
          throw new HttpError(409, "TASK_ALREADY_COMPLETED", "这个任务已经完成");
        }
        if (task.status !== "PENDING") {
          throw new HttpError(409, "TASK_NOT_STARTABLE", "这个任务目前不能开始");
        }

        const latest = await tx.taskAttempt.findFirst({
          where: { dailyTaskId },
          orderBy: { attemptNumber: "desc" },
          select: { attemptNumber: true },
        });
        const attempt = await tx.taskAttempt.create({
          data: {
            childId,
            dailyTaskId,
            attemptNumber: (latest?.attemptNumber ?? 0) + 1,
            startedAt: now,
          },
          include: { dailyTask: true },
        });
        await tx.activeTaskSlot.create({
          data: { childId, attemptId: attempt.id },
        });
        await tx.dailyTask.update({
          where: { id: task.id },
          data: { status: "IN_PROGRESS" },
        });
        return { attempt, alreadyActive: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const slot = await prisma.activeTaskSlot.findUnique({
        where: { childId },
        include: { attempt: { include: { dailyTask: true } } },
      });
      if (slot) return { attempt: slot.attempt, alreadyActive: true };
    }
    throw error;
  }
}

async function requireActiveAttempt(
  childId: string,
  attemptId: string,
): Promise<AttemptWithTask> {
  const slot = await prisma.activeTaskSlot.findUnique({
    where: { childId },
    include: { attempt: { include: { dailyTask: true } } },
  });
  if (!slot || slot.attemptId !== attemptId) {
    throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
  }
  return slot.attempt;
}

export async function pauseTask(
  childId: string,
  attemptId: string,
  now = new Date(),
): Promise<AttemptWithTask> {
  const attempt = await requireActiveAttempt(childId, attemptId);
  if (attempt.status === "PAUSED") return attempt;
  if (attempt.status !== "RUNNING") {
    throw new HttpError(409, "ATTEMPT_NOT_RUNNING", "当前任务不能暂停");
  }

  if (
    attempt.dailyTask.modeSnapshot === "TIMED" &&
    remainingSeconds(
      attempt,
      attempt.dailyTask.timeLimitSecondsSnapshot ?? 0,
      now,
    ) === 0
  ) {
    await settleTimedOutAttempt(childId, now);
    throw new HttpError(409, "TASK_TIMED_OUT", "本次挑战已经超时");
  }

  const elapsedSeconds = activeElapsedSeconds(attempt, now);
  const currentRemaining =
    attempt.dailyTask.modeSnapshot === "TIMED"
      ? Math.max(
          0,
          (attempt.dailyTask.timeLimitSecondsSnapshot ?? 0) - elapsedSeconds,
        )
      : null;
  const [updated] = await prisma.$transaction([
    prisma.taskAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "PAUSED",
        pausedAt: now,
        elapsedSeconds,
        remainingSeconds: currentRemaining,
      },
    }),
    prisma.dailyTask.update({
      where: { id: attempt.dailyTaskId },
      data: { status: "PAUSED" },
    }),
  ]);
  return { ...updated, dailyTask: attempt.dailyTask };
}

export async function resumeTask(
  childId: string,
  attemptId: string,
  now = new Date(),
): Promise<AttemptWithTask> {
  const attempt = await requireActiveAttempt(childId, attemptId);
  if (attempt.status === "RUNNING") return attempt;
  if (attempt.status !== "PAUSED" || !attempt.pausedAt) {
    throw new HttpError(409, "ATTEMPT_NOT_PAUSED", "当前任务没有暂停");
  }

  const pausedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - attempt.pausedAt.getTime()) / 1000),
  );
  const [updated] = await prisma.$transaction([
    prisma.taskAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "RUNNING",
        pausedAt: null,
        totalPausedSeconds: { increment: pausedSeconds },
      },
    }),
    prisma.dailyTask.update({
      where: { id: attempt.dailyTaskId },
      data: { status: "IN_PROGRESS" },
    }),
  ]);
  return { ...updated, dailyTask: attempt.dailyTask };
}

export async function abandonTask(
  childId: string,
  attemptId: string,
  now = new Date(),
): Promise<AttemptWithTask> {
  const attempt = await requireActiveAttempt(childId, attemptId);
  const elapsedSeconds = activeElapsedSeconds(attempt, now);
  const remaining =
    attempt.dailyTask.modeSnapshot === "TIMED"
      ? Math.max(
          0,
          (attempt.dailyTask.timeLimitSecondsSnapshot ?? 0) - elapsedSeconds,
        )
      : null;

  const [updated] = await prisma.$transaction([
    prisma.taskAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "ABANDONED",
        endedAt: now,
        elapsedSeconds,
        remainingSeconds: remaining,
      },
    }),
    prisma.dailyTask.update({
      where: { id: attempt.dailyTaskId },
      data: { status: "PENDING" },
    }),
    prisma.activeTaskSlot.delete({ where: { childId } }),
  ]);
  return { ...updated, dailyTask: attempt.dailyTask };
}

export async function completeTask(
  childId: string,
  attemptId: string,
  options: Date | CompleteTaskOptions = {},
) {
  const now = options instanceof Date ? options : options.now ?? new Date();
  const onTiming = options instanceof Date ? undefined : options.onTiming;
  const mark = (stage: string, startedAt: number) => {
    onTiming?.({ stage, ms: Math.round(performance.now() - startedAt) });
  };

  let stageStartedAt = performance.now();
  const existing = await prisma.taskAttempt.findFirst({
    where: { id: attemptId, childId },
    include: { dailyTask: true },
  });
  mark("load-attempt", stageStartedAt);
  if (!existing) {
    throw new HttpError(404, "ATTEMPT_NOT_FOUND", "没有找到这次任务");
  }
  if (existing.status === "COMPLETED") {
    stageStartedAt = performance.now();
    const dailyGoalBonus = await prisma.starLedger.findFirst({
      where: {
        childId,
        type: "DAILY_GOAL_BONUS",
        referenceId: existing.id,
      },
      select: { amount: true },
    });
    mark("load-existing-daily-goal-bonus", stageStartedAt);
    const dailyGoalBonusStars = dailyGoalBonus?.amount ?? 0;
    return {
      attempt: existing,
      reward: {
        baseStars: existing.baseStarsAwarded,
        bonusStars: existing.bonusStarsAwarded,
        dailyGoalBonusStars,
        totalStars:
          existing.baseStarsAwarded +
          existing.bonusStarsAwarded +
          dailyGoalBonusStars,
      },
      alreadyCompleted: true,
    };
  }
  if (
    existing.dailyTask.experienceKindSnapshot === "HANZI_LEARNING" ||
    existing.dailyTask.experienceKindSnapshot === "HANZI_REVIEW"
  ) {
    stageStartedAt = performance.now();
    const learningSession = await prisma.hanziLearningSession.findUnique({
      where: { taskAttemptId: existing.id },
      select: { phase: true },
    });
    mark("load-hanzi-session", stageStartedAt);
    if (learningSession?.phase !== "COMPLETED") {
      throw new HttpError(
        409,
        "HANZI_SESSION_INCOMPLETE",
        "请先完成全部汉字学习内容",
      );
    }
  }
  if (existing.dailyTask.experienceKindSnapshot === "CLOCK_LEARNING") {
    stageStartedAt = performance.now();
    const clockSession = await prisma.clockLearningSession.findUnique({
      where: { taskAttemptId: existing.id },
      select: { completedAt: true, currentIndex: true, totalQuestions: true },
    });
    mark("load-clock-session", stageStartedAt);
    if (
      !clockSession?.completedAt ||
      clockSession.currentIndex < clockSession.totalQuestions
    ) {
      throw new HttpError(
        409,
        "CLOCK_SESSION_INCOMPLETE",
        "请先完成全部时钟题目",
      );
    }
  }
  let learningOutcomeAllowsReward = true;
  if (existing.dailyTask.experienceKindSnapshot === "MAKE_TEN") {
    stageStartedAt = performance.now();
    const makeTenSession = await prisma.makeTenLearningSession.findUnique({
      where: { taskAttemptId: existing.id },
      select: {
        completedAt: true,
        currentIndex: true,
        totalQuestions: true,
        passed: true,
      },
    });
    mark("load-make-ten-session", stageStartedAt);
    if (
      !makeTenSession?.completedAt ||
      makeTenSession.currentIndex < makeTenSession.totalQuestions ||
      makeTenSession.passed === null
    ) {
      throw new HttpError(
        409,
        "MAKE_TEN_SESSION_INCOMPLETE",
        "请先完成全部凑十题目",
      );
    }
    learningOutcomeAllowsReward = makeTenSession.passed;
  }
  if (
    existing.dailyTask.experienceKindSnapshot === "POEM_LEARNING" ||
    existing.dailyTask.experienceKindSnapshot === "POEM_REVIEW"
  ) {
    stageStartedAt = performance.now();
    const poemSession = await prisma.poemLearningSession.findUnique({
      where: { taskAttemptId: existing.id },
      select: { completedAt: true },
    });
    mark("load-poem-session", stageStartedAt);
    if (!poemSession?.completedAt) {
      throw new HttpError(
        409,
        "POEM_SESSION_INCOMPLETE",
        "请先完成全部古诗学习内容",
      );
    }
  }

  stageStartedAt = performance.now();
  const attempt = await requireActiveAttempt(childId, attemptId);
  mark("load-active-attempt", stageStartedAt);
  const elapsedSeconds = activeElapsedSeconds(attempt, now);
  const remaining =
    attempt.dailyTask.modeSnapshot === "TIMED"
      ? Math.max(
          0,
          (attempt.dailyTask.timeLimitSecondsSnapshot ?? 0) - elapsedSeconds,
        )
      : null;

  if (attempt.dailyTask.modeSnapshot === "TIMED" && remaining === 0) {
    await settleTimedOutAttempt(childId, now);
    throw new HttpError(409, "TASK_TIMED_OUT", "本次挑战已经超时");
  }

  const reward = learningOutcomeAllowsReward
    ? taskReward({
        mode: attempt.dailyTask.modeSnapshot,
        baseStars: attempt.dailyTask.baseStarsSnapshot,
        earlyBonusEnabled: attempt.dailyTask.earlyBonusEnabledSnapshot,
        earlyThresholdSeconds: attempt.dailyTask.earlyThresholdSecsSnapshot,
        earlyBonusStars: attempt.dailyTask.earlyBonusStarsSnapshot,
        remainingSeconds: remaining,
      })
    : { baseStars: 0, bonusStars: 0, totalStars: 0 };

  stageStartedAt = performance.now();
  const completion = await prisma.$transaction(
    async (tx) => {
      const transactionStartedAt = performance.now();
      let transactionStageStartedAt = performance.now();
      const currentSlot = await tx.activeTaskSlot.findUnique({
        where: { childId },
      });
      mark("transaction-load-slot", transactionStageStartedAt);
      if (!currentSlot || currentSlot.attemptId !== attempt.id) {
        throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
      }

      transactionStageStartedAt = performance.now();
      const updatedAttempt = await tx.taskAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "COMPLETED",
          endedAt: now,
          elapsedSeconds,
          remainingSeconds: remaining,
          baseStarsAwarded: reward.baseStars,
          bonusStarsAwarded: reward.bonusStars,
        },
      });
      mark("transaction-update-attempt", transactionStageStartedAt);
      transactionStageStartedAt = performance.now();
      await tx.dailyTask.update({
        where: { id: attempt.dailyTaskId },
        data: {
          status: dailyTaskStatusAfterCompletion(
            attempt.dailyTask.repeatableDailySnapshot,
          ),
          completedAt: now,
          completionDurationSeconds: elapsedSeconds,
        },
      });
      mark("transaction-update-daily-task", transactionStageStartedAt);
      transactionStageStartedAt = performance.now();
      const childSettings = await tx.childProfile.findUniqueOrThrow({
        where: { id: childId },
        select: {
          dailyStarGoal: true,
          dailyGoalBonusEnabled: true,
          dailyGoalBonusStars: true,
        },
      });
      mark("transaction-load-child-settings", transactionStageStartedAt);
      transactionStageStartedAt = performance.now();
      if (reward.totalStars > 0) {
        const childAfterTaskReward = await tx.childProfile.update({
          where: { id: childId },
          data: {
            starBalance: { increment: reward.totalStars },
            lifetimeStarsEarned: { increment: reward.totalStars },
          },
        });
        mark("transaction-update-child-task-reward", transactionStageStartedAt);
        transactionStageStartedAt = performance.now();
        await tx.starLedger.create({
          data: {
            childId,
            taskAttemptId: attempt.id,
            type: "TASK_REWARD",
            amount: reward.totalStars,
            balanceAfter: childAfterTaskReward.starBalance,
            reason: `${attempt.dailyTask.titleSnapshot} 任务奖励`,
            referenceId: attempt.dailyTaskId,
            idempotencyKey: `task:${attempt.id}:reward`,
          },
        });
        mark("transaction-create-task-ledger", transactionStageStartedAt);
      }

      transactionStageStartedAt = performance.now();
      const completedTaskReward = await tx.taskAttempt.aggregate({
        where: {
          childId,
          status: "COMPLETED",
          dailyTask: { taskDate: attempt.dailyTask.taskDate },
        },
        _sum: {
          baseStarsAwarded: true,
          bonusStarsAwarded: true,
        },
      });
      mark("transaction-aggregate-day-reward", transactionStageStartedAt);
      const taskStarsEarnedToday =
        (completedTaskReward._sum.baseStarsAwarded ?? 0) +
        (completedTaskReward._sum.bonusStarsAwarded ?? 0);
      const dailyGoalKey =
        attempt.dailyTask.taskDate.toISOString().slice(0, 10);
      let dailyGoalBonusStars = 0;

      if (reward.totalStars > 0 && childSettings.dailyGoalBonusEnabled) {
        transactionStageStartedAt = performance.now();
        const existingGoalBonus = await findActiveDailyGoalBonus(
          tx,
          childId,
          dailyGoalKey,
        );
        mark("transaction-load-daily-goal-ledger", transactionStageStartedAt);
        const bonusToAward = dailyGoalBonusAmount({
          enabled: childSettings.dailyGoalBonusEnabled,
          goalStars: childSettings.dailyStarGoal,
          bonusStars: childSettings.dailyGoalBonusStars,
          taskStarsEarned: taskStarsEarnedToday,
          alreadyAwarded: Boolean(existingGoalBonus),
        });

        if (bonusToAward > 0) {
          transactionStageStartedAt = performance.now();
          const childAfterGoalBonus = await tx.childProfile.update({
            where: { id: childId },
            data: {
              starBalance: { increment: bonusToAward },
              lifetimeStarsEarned: {
                increment: bonusToAward,
              },
            },
          });
          mark("transaction-update-child-daily-goal", transactionStageStartedAt);
          transactionStageStartedAt = performance.now();
          await tx.starLedger.create({
            data: {
              childId,
              type: "DAILY_GOAL_BONUS",
              amount: bonusToAward,
              balanceAfter: childAfterGoalBonus.starBalance,
              reason: `达成每日 ${childSettings.dailyStarGoal} 颗星目标`,
              referenceId: attempt.id,
              idempotencyKey: `daily-goal:${childId}:${dailyGoalKey}:${attempt.id}`,
            },
          });
          mark("transaction-create-daily-goal-ledger", transactionStageStartedAt);
          dailyGoalBonusStars = bonusToAward;
        }
      }

      transactionStageStartedAt = performance.now();
      await tx.activeTaskSlot.delete({ where: { childId } });
      mark("transaction-delete-active-slot", transactionStageStartedAt);
      mark("transaction-callback-total", transactionStartedAt);
      return { updatedAttempt, dailyGoalBonusStars };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  mark("transaction-total", stageStartedAt);

  return {
    attempt: { ...completion.updatedAttempt, dailyTask: attempt.dailyTask },
    reward: {
      ...reward,
      dailyGoalBonusStars: completion.dailyGoalBonusStars,
      totalStars: reward.totalStars + completion.dailyGoalBonusStars,
    },
    alreadyCompleted: false,
  };
}

/**
 * Reverses the latest completed attempt for a daily task without deleting
 * history. The task can then be started again and the ledger records the
 * balance correction as a separate entry.
 */
export async function rollbackCompletedTask(
  childId: string,
  dailyTaskId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const dailyTask = await tx.dailyTask.findFirst({
        where: { id: dailyTaskId, childId },
        select: {
          id: true,
          titleSnapshot: true,
          attempts: {
            where: { status: "COMPLETED" },
            orderBy: [{ endedAt: "desc" }, { attemptNumber: "desc" }],
            take: 1,
            select: {
              id: true,
              attemptNumber: true,
              baseStarsAwarded: true,
              bonusStarsAwarded: true,
            },
          },
        },
      });
      if (!dailyTask) {
        throw new HttpError(404, "TASK_NOT_FOUND", "没有找到这条任务记录");
      }

      const attempt = dailyTask.attempts[0];
      if (!attempt) {
        throw new HttpError(409, "TASK_NOT_COMPLETED", "这条任务没有可回退的完成记录");
      }

      const rewardLedger = await tx.starLedger.findUnique({
        where: { taskAttemptId: attempt.id },
        select: { amount: true },
      });
      const taskRewardStars = rewardLedger?.amount ??
        attempt.baseStarsAwarded + attempt.bonusStarsAwarded;
      if (taskRewardStars <= 0) {
        throw new HttpError(409, "TASK_REWARD_NOT_FOUND", "没有找到这次任务对应的奖励记录");
      }

      const dailyGoalLedger = await tx.starLedger.findFirst({
        where: {
          childId,
          type: "DAILY_GOAL_BONUS",
          referenceId: attempt.id,
        },
        select: { amount: true },
      });
      const dailyGoalBonusStars = Math.max(0, dailyGoalLedger?.amount ?? 0);
      const reversedStars = taskRewardStars + dailyGoalBonusStars;
      const child = await tx.childProfile.findUniqueOrThrow({
        where: { id: childId },
        select: { starBalance: true, lifetimeStarsEarned: true },
      });
      if (child.starBalance < reversedStars) {
        throw new HttpError(
          409,
          "INSUFFICIENT_STAR_BALANCE_FOR_ROLLBACK",
          `当前星星余额不足以退回 ${reversedStars} 颗星，请先处理余额或兑换记录`,
        );
      }

      const updatedChild = await tx.childProfile.update({
        where: { id: childId },
        data: {
          starBalance: { decrement: reversedStars },
          lifetimeStarsEarned: lifetimeStarsAfterTaskRefund(
            child.lifetimeStarsEarned,
            reversedStars,
          ),
        },
        select: { starBalance: true, lifetimeStarsEarned: true },
      });
      await tx.starLedger.create({
        data: {
          childId,
          type: "TASK_REWARD_REVERSAL",
          amount: -reversedStars,
          balanceAfter: updatedChild.starBalance,
          reason: dailyGoalBonusStars > 0
            ? `${dailyTask.titleSnapshot} 任务奖励回退（含每日达标奖）`
            : `${dailyTask.titleSnapshot} 任务奖励回退`,
          referenceId: attempt.id,
          idempotencyKey: `task:${attempt.id}:reward-reversal`,
        },
      });
      await tx.taskAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "ROLLED_BACK",
          baseStarsAwarded: 0,
          bonusStarsAwarded: 0,
        },
      });
      await tx.dailyTask.update({
        where: { id: dailyTask.id },
        data: {
          status: "PENDING",
          completedAt: null,
          completionDurationSeconds: null,
        },
      });

      return {
        dailyTaskId: dailyTask.id,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        taskRewardStars,
        dailyGoalBonusStars,
        reversedStars,
        balanceAfter: updatedChild.starBalance,
        lifetimeStarsEarnedAfter: updatedChild.lifetimeStarsEarned,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
