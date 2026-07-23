import {
  Prisma,
  type DailyTask,
  type TaskAttempt,
} from "@prisma/client";
import type { AppConfig } from "../config.js";
import {
  activeElapsedSeconds,
  consecutiveScoredDays,
  isScheduledForDate,
  remainingSeconds,
  taskReward,
} from "../domain/task-rules.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";

type AttemptWithTask = TaskAttempt & { dailyTask: DailyTask };

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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

export async function generateDailyTasks(
  childId: string,
  businessDate: Date,
): Promise<void> {
  const templates = await prisma.taskTemplate.findMany({
    where: {
      childId,
      isEnabled: true,
      archivedAt: null,
    },
  });

  const due = templates.filter((template) =>
    isScheduledForDate(template, businessDate),
  );
  if (due.length === 0) return;

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
      suggestedSecondsSnapshot: template.suggestedSeconds,
      timeLimitSecondsSnapshot: template.timeLimitSeconds,
      baseStarsSnapshot: template.baseStars,
      earlyBonusEnabledSnapshot: template.earlyBonusEnabled,
      earlyThresholdSecsSnapshot: template.earlyThresholdSeconds,
      earlyBonusStarsSnapshot: template.earlyBonusStars,
    })),
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
  await generateDailyTasks(childId, today);
  const timedOutAttempt = await settleTimedOutAttempt(childId, now);
  return { timedOutAttemptId: timedOutAttempt?.id ?? null };
}

export async function getTodayTaskExperience(
  childId: string,
  config: AppConfig,
  now = new Date(),
) {
  const today = businessDateAt(now, config.APP_TIME_ZONE);
  const { timedOutAttemptId } = await prepareDailyTasks(childId, config, now);

  const streakLookback = new Date(today);
  streakLookback.setUTCDate(streakLookback.getUTCDate() - 400);

  const [child, tasks, activeSlot, scoredDays] = await Promise.all([
    prisma.childProfile.findUniqueOrThrow({ where: { id: childId } }),
    prisma.dailyTask.findMany({
      where: { childId, taskDate: today },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        attempts: {
          where: { status: "COMPLETED" },
          orderBy: { endedAt: "desc" },
          take: 1,
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
        status: "COMPLETED",
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
  ]);

  const earnedToday = tasks.reduce((sum, task) => {
    const completedAttempt = task.attempts[0];
    return (
      sum +
      (completedAttempt
        ? completedAttempt.baseStarsAwarded + completedAttempt.bonusStarsAwarded
        : 0)
    );
  }, 0);

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
    date: today.toISOString().slice(0, 10),
    earnedToday,
    streakDays: consecutiveScoredDays(
      scoredDays.map((item) => item.taskDate.toISOString().slice(0, 10)),
      today,
    ),
    dailyStarGoal: child.dailyStarGoal,
    starBalance: child.starBalance,
    tasks,
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
          return { attempt: existingSlot.attempt, alreadyActive: true };
        }

        const task = await tx.dailyTask.findFirst({
          where: { id: dailyTaskId, childId, taskDate: today },
        });
        if (!task) {
          throw new HttpError(404, "TASK_NOT_FOUND", "没有找到今天的这个任务");
        }
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
  now = new Date(),
) {
  const existing = await prisma.taskAttempt.findFirst({
    where: { id: attemptId, childId },
    include: { dailyTask: true },
  });
  if (!existing) {
    throw new HttpError(404, "ATTEMPT_NOT_FOUND", "没有找到这次任务");
  }
  if (existing.status === "COMPLETED") {
    return {
      attempt: existing,
      reward: {
        baseStars: existing.baseStarsAwarded,
        bonusStars: existing.bonusStarsAwarded,
        totalStars:
          existing.baseStarsAwarded + existing.bonusStarsAwarded,
      },
      alreadyCompleted: true,
    };
  }

  const attempt = await requireActiveAttempt(childId, attemptId);
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

  const reward = taskReward({
    mode: attempt.dailyTask.modeSnapshot,
    baseStars: attempt.dailyTask.baseStarsSnapshot,
    earlyBonusEnabled: attempt.dailyTask.earlyBonusEnabledSnapshot,
    earlyThresholdSeconds:
      attempt.dailyTask.earlyThresholdSecsSnapshot,
    earlyBonusStars: attempt.dailyTask.earlyBonusStarsSnapshot,
    remainingSeconds: remaining,
  });

  const completed = await prisma.$transaction(
    async (tx) => {
      const currentSlot = await tx.activeTaskSlot.findUnique({
        where: { childId },
      });
      if (!currentSlot || currentSlot.attemptId !== attempt.id) {
        throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
      }

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
      await tx.dailyTask.update({
        where: { id: attempt.dailyTaskId },
        data: { status: "COMPLETED", completedAt: now },
      });
      const child = await tx.childProfile.update({
        where: { id: childId },
        data: {
          starBalance: { increment: reward.totalStars },
          lifetimeStarsEarned: { increment: reward.totalStars },
        },
      });
      await tx.starLedger.create({
        data: {
          childId,
          taskAttemptId: attempt.id,
          type: "TASK_REWARD",
          amount: reward.totalStars,
          balanceAfter: child.starBalance,
          reason: `${attempt.dailyTask.titleSnapshot} 任务奖励`,
          referenceId: attempt.dailyTaskId,
          idempotencyKey: `task:${attempt.id}:reward`,
        },
      });
      await tx.activeTaskSlot.delete({ where: { childId } });
      return updatedAttempt;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return {
    attempt: { ...completed, dailyTask: attempt.dailyTask },
    reward,
    alreadyCompleted: false,
  };
}
