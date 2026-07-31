import {
  Prisma,
  type PoemLearningSession,
  type TaskExperienceKind,
} from "@prisma/client";
import type { AppConfig } from "../config.js";
import {
  firstPoemReviewDate,
  nextPoemReviewDate,
  POEM_REVIEW_STAGE_COUNT,
} from "../domain/poem-review-rules.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";
import { completeTask } from "./task-service.js";

type ReviewResult = "REMEMBERED" | "FORGOT";

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
  await requirePoemAttempt(childId, session.taskAttemptId);
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

  return {
    ...session,
    poems: session.poemIds.flatMap((id) => {
      const poem = byId.get(id);
      return poem ? [poem] : [];
    }),
    summary: {
      total: session.poemIds.length,
      completed: session.completedPoemIds.length,
      forgotten: session.forgottenPoemIds.length,
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

  let poemIds: string[];
  if (kind === "LEARNING") {
    const poem = await prisma.poem.findFirst({
      where: {
        isEnabled: true,
        progress: { none: { childId } },
      },
      orderBy: [
        { grade: "asc" },
        { sortOrder: "asc" },
      ],
      select: { id: true },
    });
    if (!poem) {
      throw new HttpError(409, "NO_NEW_POEM", "古诗库中的诗已经全部学习完成");
    }
    poemIds = [poem.id];
  } else {
    const due = await prisma.poemLearningProgress.findMany({
      where: {
        childId,
        status: "LEARNING",
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
  if (session.kind !== "LEARNING" || session.poemIds[0] !== poemId) {
    throw new HttpError(409, "POEM_NOT_CURRENT", "这首诗不在当前学习任务中");
  }

  if (!session.completedPoemIds.includes(poemId)) {
    const today = businessDateAt(now, config.APP_TIME_ZONE);
    await prisma.$transaction([
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
          currentIndex: 1,
          completedPoemIds: [poemId],
          completedAt: now,
        },
      }),
    ]);
  }

  return completeTask(childId, session.taskAttemptId, now);
}

export async function reviewPoem(
  childId: string,
  sessionId: string,
  poemId: string,
  result: ReviewResult,
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
    result === "FORGOT"
      ? [...session.forgottenPoemIds, poemId]
      : session.forgottenPoemIds;
  const currentIndex = session.currentIndex + 1;
  const sessionCompleted = currentIndex >= session.poemIds.length;

  const progressData =
    result === "FORGOT"
      ? {
          status: "LEARNING" as const,
          learnedDate: today,
          reviewStage: 0,
          nextReviewDate: firstPoemReviewDate(today),
          lastReviewedAt: now,
        }
      : (() => {
          const reviewStage = Math.min(
            POEM_REVIEW_STAGE_COUNT,
            progress.reviewStage + 1,
          );
          return {
            status:
              reviewStage === POEM_REVIEW_STAGE_COUNT
                ? ("MASTERED" as const)
                : ("LEARNING" as const),
            reviewStage,
            nextReviewDate: nextPoemReviewDate(
              progress.learnedDate,
              reviewStage,
              today,
            ),
            lastReviewedAt: now,
          };
        })();

  const [, updatedSession] = await prisma.$transaction([
    prisma.poemLearningProgress.update({
      where: { id: progress.id },
      data: progressData,
    }),
    prisma.poemLearningSession.update({
      where: { id: session.id },
      data: {
        currentIndex,
        completedPoemIds,
        forgottenPoemIds,
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
