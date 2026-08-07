import { Prisma, type MakeTenLearningSession } from "@prisma/client";
import type { AppConfig } from "../config.js";
import { activeElapsedSeconds } from "../domain/task-rules.js";
import {
  generateAdaptiveMakeTenQuestions,
  generateMakeTenQuestions,
  isMakeTenAnswerCorrect,
  makeTenAttemptStatus,
  makeTenPassed,
  type MakeTenAnswer,
  type MakeTenQuestion,
} from "../domain/make-ten-learning.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";
import { completeTask } from "./task-service.js";

function questionsFromJson(value: Prisma.JsonValue): MakeTenQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      typeof item.target !== "number" || item.target < 1 || item.target > 9
    ) return [];
    return [{ target: item.target }];
  });
}

function answersFromJson(value: Prisma.JsonValue): MakeTenAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      typeof item.questionIndex !== "number" ||
      !(item.selectedNumber === null || typeof item.selectedNumber === "number") ||
      typeof item.correct !== "boolean" || typeof item.timedOut !== "boolean" ||
      typeof item.answeredAt !== "string"
    ) return [];
    return [{
      questionIndex: item.questionIndex,
      selectedNumber: item.selectedNumber,
      correct: item.correct,
      timedOut: item.timedOut,
      responseMs:
        typeof item.responseMs === "number"
          ? Math.max(0, Math.round(item.responseMs))
          : null,
      answeredAt: item.answeredAt,
    }];
  });
}

function serializeSession(session: MakeTenLearningSession) {
  return {
    id: session.id,
    taskAttemptId: session.taskAttemptId,
    secondsPerQuestion: session.secondsPerQuestion,
    passAccuracyPercent: session.passAccuracyPercent,
    questions: questionsFromJson(session.questions),
    answers: answersFromJson(session.answers),
    currentIndex: session.currentIndex,
    correctCount: session.correctCount,
    totalQuestions: session.totalQuestions,
    passed: session.passed,
    completedAt: session.completedAt,
  };
}

async function requireMakeTenAttempt(childId: string, attemptId: string) {
  const slot = await prisma.activeTaskSlot.findUnique({
    where: { childId },
    include: { attempt: { include: { dailyTask: true } } },
  });
  if (!slot || slot.attemptId !== attemptId) {
    throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
  }
  if (slot.attempt.dailyTask.experienceKindSnapshot !== "MAKE_TEN") {
    throw new HttpError(409, "NOT_MAKE_TEN_TASK", "这不是凑十训练任务");
  }
}

export async function startMakeTenSession(
  childId: string,
  attemptId: string,
  config: AppConfig,
) {
  await requireMakeTenAttempt(childId, attemptId);
  const existing = await prisma.makeTenLearningSession.findUnique({
    where: { taskAttemptId: attemptId },
  });
  if (existing) return { session: serializeSession(existing) };

  const [settings, factProgress] = await Promise.all([
    prisma.makeTenLearningSettings.upsert({
      where: { childId },
      update: {},
      create: { childId },
    }),
    prisma.makeTenFactProgress.findMany({ where: { childId } }),
  ]);
  const questions = factProgress.length
    ? generateAdaptiveMakeTenQuestions(
        settings.questionsPerDay,
        factProgress,
        settings.secondsPerQuestion,
      )
    : generateMakeTenQuestions(settings.questionsPerDay);
  try {
    const session = await prisma.makeTenLearningSession.create({
      data: {
        childId,
        taskAttemptId: attemptId,
        sessionDate: businessDateAt(new Date(), config.APP_TIME_ZONE),
        secondsPerQuestion: settings.secondsPerQuestion,
        passAccuracyPercent: settings.passAccuracyPercent,
        questions,
        answers: [],
        totalQuestions: questions.length,
      },
    });
    return { session: serializeSession(session) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const session = await prisma.makeTenLearningSession.findUniqueOrThrow({
      where: { taskAttemptId: attemptId },
    });
    return { session: serializeSession(session) };
  }
}

export async function answerMakeTenQuestion(
  childId: string,
  sessionId: string,
  input: {
    questionIndex: number;
    selectedNumber: number | null;
    timedOut: boolean;
    responseMs?: number;
  },
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.makeTenLearningSession.findFirst({ where: { id: sessionId, childId } });
    if (!session) throw new HttpError(404, "MAKE_TEN_SESSION_NOT_FOUND", "没有找到这次凑十训练");
    const questions = questionsFromJson(session.questions);
    const answers = answersFromJson(session.answers);
    const question = questions[input.questionIndex];
    if (!question) throw new HttpError(400, "MAKE_TEN_QUESTION_NOT_FOUND", "没有找到这道题");
    const existingAnswer = answers.find((answer) => answer.questionIndex === input.questionIndex);
    if (existingAnswer) return { session: serializeSession(session), answer: existingAnswer, question };
    if (input.questionIndex !== session.currentIndex) {
      throw new HttpError(409, "MAKE_TEN_QUESTION_OUT_OF_ORDER", "请按顺序完成凑十题目");
    }

    const timeLimitMs = Math.max(
      1,
      Math.round(session.secondsPerQuestion * 1000),
    );
    const responseMs = input.timedOut
      ? timeLimitMs
      : Math.max(
          0,
          Math.min(timeLimitMs, Math.round(input.responseMs ?? timeLimitMs)),
        );
    const answer: MakeTenAnswer = {
      questionIndex: input.questionIndex,
      selectedNumber: input.timedOut ? null : input.selectedNumber,
      correct: !input.timedOut && isMakeTenAnswerCorrect(question.target, input.selectedNumber),
      timedOut: input.timedOut,
      responseMs,
      answeredAt: now.toISOString(),
    };
    const nextIndex = session.currentIndex + 1;
    const correctCount = session.correctCount + (answer.correct ? 1 : 0);
    const completed = nextIndex >= session.totalQuestions;
    const updatedCount = await tx.makeTenLearningSession.updateMany({
      where: { id: session.id, childId, currentIndex: input.questionIndex },
      data: {
        answers: [...answers, answer],
        currentIndex: nextIndex,
        correctCount,
        passed: completed
          ? makeTenPassed(correctCount, session.totalQuestions, session.passAccuracyPercent)
          : null,
        completedAt: completed ? now : null,
      },
    });
    if (updatedCount.count === 0) {
      const updated = await tx.makeTenLearningSession.findUniqueOrThrow({ where: { id: session.id } });
      const savedAnswer = answersFromJson(updated.answers).find((item) => item.questionIndex === input.questionIndex);
      if (savedAnswer) return { session: serializeSession(updated), answer: savedAnswer, question };
      throw new HttpError(409, "MAKE_TEN_QUESTION_OUT_OF_ORDER", "请按顺序完成凑十题目");
    }

    await tx.makeTenQuestionAttempt.create({
      data: {
        childId,
        sessionId: session.id,
        questionIndex: input.questionIndex,
        target: question.target,
        selectedNumber: answer.selectedNumber,
        correct: answer.correct,
        timedOut: answer.timedOut,
        responseMs,
        answeredAt: now,
      },
    });

    const currentProgress = await tx.makeTenFactProgress.findUnique({
      where: { childId_target: { childId, target: question.target } },
    });
    const answerScore = answer.correct ? 1 : 0;
    if (currentProgress) {
      await tx.makeTenFactProgress.update({
        where: { id: currentProgress.id },
        data: {
          attemptCount: { increment: 1 },
          correctCount: { increment: answerScore },
          totalResponseMs: { increment: responseMs },
          recentAccuracy:
            (currentProgress.recentAccuracy ?? answerScore) * 0.75 +
            answerScore * 0.25,
          recentResponseMs:
            (currentProgress.recentResponseMs ?? responseMs) * 0.75 +
            responseMs * 0.25,
          consecutiveWrong: answer.correct
            ? 0
            : currentProgress.consecutiveWrong + 1,
          lastAnsweredAt: now,
        },
      });
    } else {
      await tx.makeTenFactProgress.create({
        data: {
          childId,
          target: question.target,
          attemptCount: 1,
          correctCount: answerScore,
          totalResponseMs: responseMs,
          recentAccuracy: answerScore,
          recentResponseMs: responseMs,
          consecutiveWrong: answer.correct ? 0 : 1,
          lastAnsweredAt: now,
        },
      });
    }

    const updated = await tx.makeTenLearningSession.findUniqueOrThrow({ where: { id: session.id } });
    return { session: serializeSession(updated), answer, question };
  });
}

export async function finishMakeTenSession(childId: string, sessionId: string) {
  const session = await prisma.makeTenLearningSession.findFirst({ where: { id: sessionId, childId } });
  if (!session) throw new HttpError(404, "MAKE_TEN_SESSION_NOT_FOUND", "没有找到这次凑十训练");
  if (!session.completedAt || session.currentIndex < session.totalQuestions || session.passed === null) {
    throw new HttpError(409, "MAKE_TEN_SESSION_INCOMPLETE", "请先完成全部凑十题目");
  }
  if (makeTenAttemptStatus(session.passed) === "COMPLETED") {
    return completeTask(childId, session.taskAttemptId);
  }

  const now = new Date();
  const existing = await prisma.taskAttempt.findFirst({
    where: { id: session.taskAttemptId, childId },
    include: { dailyTask: true },
  });
  if (!existing) {
    throw new HttpError(404, "ATTEMPT_NOT_FOUND", "没有找到这次任务");
  }
  if (existing.status === "FAILED") {
    return {
      attempt: existing,
      reward: {
        baseStars: 0,
        bonusStars: 0,
        dailyGoalBonusStars: 0,
        totalStars: 0,
      },
      alreadyCompleted: false,
    };
  }
  if (existing.status !== "RUNNING" && existing.status !== "PAUSED") {
    throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
  }

  const elapsedSeconds = activeElapsedSeconds(existing, now);
  const updatedAttempt = await prisma.$transaction(
    async (tx) => {
      const currentSlot = await tx.activeTaskSlot.findUnique({
        where: { childId },
      });
      if (!currentSlot || currentSlot.attemptId !== existing.id) {
        throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
      }

      const updateResult = await tx.taskAttempt.updateMany({
        where: {
          id: existing.id,
          childId,
          status: { in: ["RUNNING", "PAUSED"] },
        },
        data: {
          status: "FAILED",
          endedAt: now,
          elapsedSeconds,
          remainingSeconds: null,
          baseStarsAwarded: 0,
          bonusStarsAwarded: 0,
        },
      });
      if (updateResult.count !== 1) {
        throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
      }

      const priorCompletion = await tx.taskAttempt.findFirst({
        where: {
          dailyTaskId: existing.dailyTaskId,
          id: { not: existing.id },
          status: "COMPLETED",
        },
        select: { id: true },
      });
      await tx.dailyTask.update({
        where: { id: existing.dailyTaskId },
        data: {
          status: "PENDING",
          ...(!priorCompletion
            ? { completedAt: null, completionDurationSeconds: null }
            : {}),
        },
      });
      await tx.activeTaskSlot.delete({ where: { childId } });
      return tx.taskAttempt.findUniqueOrThrow({ where: { id: existing.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return {
    attempt: { ...updatedAttempt, dailyTask: existing.dailyTask },
    reward: {
      baseStars: 0,
      bonusStars: 0,
      dailyGoalBonusStars: 0,
      totalStars: 0,
    },
    alreadyCompleted: false,
  };
}
