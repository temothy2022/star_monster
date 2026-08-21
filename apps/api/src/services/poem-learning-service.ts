import {
  Prisma,
  type MemoryRecallRating,
  type PoemLearningProgress,
  type PoemLearningSession,
  type TaskExperienceKind,
} from "@prisma/client";
import type { AppConfig } from "../config.js";
import {
  applyPoemRecall,
  firstPoemReviewDate,
} from "../domain/poem-review-rules.js";
import { recallCounterField } from "../domain/memory-review-rules.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";
import { completeTask } from "./task-service.js";

type StoredReviewOutcome = {
  poemId: string;
  rating: MemoryRecallRating;
  responseMs?: number;
};

function reviewOutcomesFromJson(value: Prisma.JsonValue): StoredReviewOutcome[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      typeof item.poemId !== "string" ||
      !["EASY", "EFFORTFUL", "HINTED", "FORGOT"].includes(String(item.rating))
    ) return [];
    return [{
      poemId: item.poemId,
      rating: item.rating as MemoryRecallRating,
      ...(typeof item.responseMs === "number" ? { responseMs: item.responseMs } : {}),
    }];
  });
}

function recallProgressData(
  progress: PoemLearningProgress,
  rating: MemoryRecallRating,
  responseMs: number | undefined,
  today: Date,
  now: Date,
): Prisma.PoemLearningProgressUpdateInput {
  const result = applyPoemRecall(progress.reviewStage, rating, today);
  const counterField = recallCounterField(rating);
  return {
    status: result.mastered ? "MASTERED" : "LEARNING",
    reviewStage: result.reviewStage,
    nextReviewDate: result.nextReviewDate,
    isDifficult: result.difficult ? true : progress.isDifficult && !result.independent,
    consecutiveWrong: result.independent ? 0 : progress.consecutiveWrong + 1,
    lastRecallRating: rating,
    lastResponseMs: responseMs,
    lastReviewedAt: now,
    [counterField]: { increment: 1 },
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function sessionKindForExperience(
  experienceKind: TaskExperienceKind,
): "LEARNING" | "REVIEW" {
  if (experienceKind === "POEM_LEARNING") return "LEARNING";
  if (experienceKind === "POEM_REVIEW") return "REVIEW";
  throw new HttpError(409, "NOT_POEM_TASK", "当前任务不是古诗学习任务");
}

async function requirePoemAttempt(childId: string, attemptId: string) {
  const slot = await prisma.activeTaskSlot.findUnique({
    where: { childId },
    include: { attempt: { include: { dailyTask: true } } },
  });
  if (!slot || slot.attemptId !== attemptId) {
    throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
  }
  sessionKindForExperience(slot.attempt.dailyTask.experienceKindSnapshot);
  return slot.attempt;
}

async function requireOwnedSession(childId: string, sessionId: string) {
  const session = await prisma.poemLearningSession.findFirst({
    where: { id: sessionId, childId },
    include: { taskAttempt: { include: { dailyTask: true } } },
  });
  if (!session) {
    throw new HttpError(404, "POEM_SESSION_NOT_FOUND", "没有找到这次古诗学习");
  }
  if (session.taskAttempt.status === "COMPLETED") {
    if (!session.completedAt) {
      throw new HttpError(409, "POEM_SESSION_INCOMPLETE", "这次古诗学习记录不完整");
    }
  } else {
    await requirePoemAttempt(childId, session.taskAttemptId);
  }
  return session;
}

async function serializeSession(session: PoemLearningSession) {
  const poems = session.poemIds.length
    ? await prisma.poem.findMany({
        where: { id: { in: session.poemIds } },
        select: {
          id: true,
          title: true,
          dynasty: true,
          author: true,
          grade: true,
          semester: true,
          content: true,
          imageUrl: true,
          audioUrl: true,
        },
      })
    : [];
  const byId = new Map(poems.map((poem) => [poem.id, poem]));
  const reviewOutcomes = reviewOutcomesFromJson(session.reviewOutcomes);

  return {
    ...session,
    poems: session.poemIds.flatMap((id) => {
      const poem = byId.get(id);
      return poem ? [poem] : [];
    }),
    reviewOutcomes,
    summary: {
      total: session.poemIds.length,
      completed: session.completedPoemIds.length,
      forgotten: session.forgottenPoemIds.length,
      easy: reviewOutcomes.filter((item) => item.rating === "EASY").length,
      effortful: reviewOutcomes.filter((item) => item.rating === "EFFORTFUL").length,
      hinted: reviewOutcomes.filter((item) => item.rating === "HINTED").length,
      forgot: reviewOutcomes.filter((item) => item.rating === "FORGOT").length,
    },
  };
}

export async function startPoemSession(
  childId: string,
  attemptId: string,
  config: AppConfig,
  now = new Date(),
) {
  const attempt = await requirePoemAttempt(childId, attemptId);
  const existing = await prisma.poemLearningSession.findUnique({
    where: { taskAttemptId: attemptId },
  });
  if (existing) return { session: await serializeSession(existing) };

  const kind = sessionKindForExperience(
    attempt.dailyTask.experienceKindSnapshot,
  );
  const today = businessDateAt(now, config.APP_TIME_ZONE);
  const settings = await prisma.poemLearningSettings.upsert({
    where: { childId },
    update: {},
    create: { childId },
  });

  let poemIds: string[];
  if (kind === "LEARNING") {
    const schoolTargets = await prisma.poemSchoolTarget.findMany({
      where: {
        childId,
        poem: {
          isEnabled: true,
          progress: { none: { childId } },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { poemId: true },
      take: settings.newPoemsPerSession,
    });
    const selectedIds = schoolTargets.map((item) => item.poemId);
    const fallbackPoems = selectedIds.length >= settings.newPoemsPerSession
      ? []
      : await prisma.poem.findMany({
          where: {
            isEnabled: true,
            progress: { none: { childId } },
            id: { notIn: selectedIds },
          },
          orderBy: [
            { grade: "asc" },
            { sortOrder: "asc" },
          ],
          select: { id: true },
          take: settings.newPoemsPerSession - selectedIds.length,
        });
    poemIds = [...selectedIds, ...fallbackPoems.map((item) => item.id)];
    if (!poemIds.length) {
      throw new HttpError(409, "NO_NEW_POEM", "古诗库中的诗已经全部学习完成");
    }
  } else {
    const due = await prisma.poemLearningProgress.findMany({
      where: {
        childId,
        nextReviewDate: { lte: today },
        poem: { isEnabled: true },
      },
      select: {
        id: true,
        poemId: true,
        reviewStage: true,
        learnedDate: true,
        poem: { select: { grade: true, sortOrder: true } },
      },
      orderBy: [{ nextReviewDate: "asc" }, { createdAt: "asc" }],
      take: settings.reviewDailyLimit,
    });
    due.sort(
      (left, right) =>
        left.poem.grade - right.poem.grade ||
        left.poem.sortOrder - right.poem.sortOrder,
    );
    poemIds = due.map((item) => item.poemId);
    if (poemIds.length === 0) {
      throw new HttpError(409, "NO_DUE_POEM", "今天没有需要复习的古诗");
    }
  }

  try {
    const session = await prisma.poemLearningSession.create({
      data: {
        childId,
        taskAttemptId: attemptId,
        sessionDate: today,
        kind,
        poemIds,
      },
    });
    return { session: await serializeSession(session) };
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const session = await prisma.poemLearningSession.findUniqueOrThrow({
        where: { taskAttemptId: attemptId },
      });
      return { session: await serializeSession(session) };
    }
    throw error;
  }
}

export async function completeNewPoem(
  childId: string,
  sessionId: string,
  poemId: string,
  config: AppConfig,
  now = new Date(),
) {
  const session = await requireOwnedSession(childId, sessionId);
  if (session.kind !== "LEARNING") {
    throw new HttpError(409, "POEM_NOT_CURRENT", "这首诗不在当前学习任务中");
  }

  if (session.completedPoemIds.includes(poemId)) {
    if (!session.completedAt) {
      return { session: await serializeSession(session), completion: null };
    }
    const completion = await completeTask(childId, session.taskAttemptId, now);
    return { session: await serializeSession(session), completion };
  }

  if (session.poemIds[session.currentIndex] !== poemId) {
    throw new HttpError(409, "POEM_NOT_CURRENT", "这首诗不在当前学习任务中");
  }

  const today = businessDateAt(now, config.APP_TIME_ZONE);
  const completedPoemIds = [...session.completedPoemIds, poemId];
  const currentIndex = session.currentIndex + 1;
  const sessionCompleted = currentIndex >= session.poemIds.length;
  const [, updatedSession] = await prisma.$transaction([
    prisma.poemLearningProgress.upsert({
      where: { childId_poemId: { childId, poemId } },
      create: {
        childId,
        poemId,
        learnedDate: today,
        reviewStage: 0,
        nextReviewDate: firstPoemReviewDate(today),
      },
      update: {},
    }),
    prisma.poemLearningSession.update({
      where: { id: session.id },
      data: {
        currentIndex,
        completedPoemIds,
        completedAt: sessionCompleted ? now : null,
      },
    }),
  ]);
  if (!sessionCompleted) {
    return { session: await serializeSession(updatedSession), completion: null };
  }

  const completion = await completeTask(childId, session.taskAttemptId, now);
  const finalSession = await prisma.poemLearningSession.findUniqueOrThrow({ where: { id: session.id } });
  return { session: await serializeSession(finalSession), completion };
}

export async function reviewPoem(
  childId: string,
  sessionId: string,
  poemId: string,
  rating: MemoryRecallRating,
  responseMs: number | undefined,
  config: AppConfig,
  now = new Date(),
) {
  const session = await requireOwnedSession(childId, sessionId);
  if (session.kind !== "REVIEW") {
    throw new HttpError(409, "NOT_POEM_REVIEW", "当前不是古诗复习任务");
  }
  if (session.completedPoemIds.includes(poemId)) {
    return { session: await serializeSession(session) };
  }
  if (session.poemIds[session.currentIndex] !== poemId) {
    throw new HttpError(409, "POEM_NOT_CURRENT", "请按顺序完成当前这首古诗");
  }

  const progress = await prisma.poemLearningProgress.findUnique({
    where: { childId_poemId: { childId, poemId } },
  });
  if (!progress) {
    throw new HttpError(409, "POEM_PROGRESS_NOT_FOUND", "这首古诗还没有学习记录");
  }

  const today = businessDateAt(now, config.APP_TIME_ZONE);
  const completedPoemIds = [...session.completedPoemIds, poemId];
  const forgottenPoemIds =
    rating === "HINTED" || rating === "FORGOT"
      ? [...session.forgottenPoemIds, poemId]
      : session.forgottenPoemIds;
  const currentIndex = session.currentIndex + 1;
  const sessionCompleted = currentIndex >= session.poemIds.length;

  const outcomes = reviewOutcomesFromJson(session.reviewOutcomes);

  const [, updatedSession] = await prisma.$transaction([
    prisma.poemLearningProgress.update({
      where: { id: progress.id },
      data: recallProgressData(progress, rating, responseMs, today, now),
    }),
    prisma.poemLearningSession.update({
      where: { id: session.id },
      data: {
        currentIndex,
        completedPoemIds,
        forgottenPoemIds,
        reviewOutcomes: [
          ...outcomes,
          { poemId, rating, ...(responseMs == null ? {} : { responseMs }) },
        ],
        completedAt: sessionCompleted ? now : null,
      },
    }),
  ]);

  return { session: await serializeSession(updatedSession) };
}

export async function finishPoemReview(
  childId: string,
  sessionId: string,
  now = new Date(),
) {
  const session = await requireOwnedSession(childId, sessionId);
  if (
    session.kind !== "REVIEW" ||
    session.currentIndex < session.poemIds.length ||
    !session.completedAt
  ) {
    throw new HttpError(409, "POEM_SESSION_INCOMPLETE", "请先完成全部古诗复习");
  }
  return completeTask(childId, session.taskAttemptId, now);
}
