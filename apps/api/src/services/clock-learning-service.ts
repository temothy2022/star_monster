import { Prisma, type ClockLearningSession } from "@prisma/client";
import type { AppConfig } from "../config.js";
import {
  generateClockQuestions,
  isClockAnswerCorrect,
  type ClockAnswer,
  type ClockQuestion,
} from "../domain/clock-learning.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";
import { completeTask } from "./task-service.js";

function questionsFromJson(value: Prisma.JsonValue): ClockQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      (item.type !== "SET_CLOCK" && item.type !== "READ_CLOCK") ||
      typeof item.hour !== "number" || typeof item.minute !== "number"
    ) return [];
    return [{
      type: item.type,
      hour: item.hour,
      minute: item.minute,
      second: typeof item.second === "number" ? item.second : 0,
    }];
  });
}

function answersFromJson(value: Prisma.JsonValue): ClockAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      typeof item.questionIndex !== "number" ||
      typeof item.hour !== "number" || typeof item.minute !== "number" ||
      typeof item.correct !== "boolean" || typeof item.answeredAt !== "string"
    ) return [];
    return [{
      questionIndex: item.questionIndex,
      hour: item.hour,
      minute: item.minute,
      second: typeof item.second === "number" ? item.second : 0,
      correct: item.correct,
      answeredAt: item.answeredAt,
    }];
  });
}

function serializeClockSession(session: ClockLearningSession) {
  const questions = questionsFromJson(session.questions);
  const answers = answersFromJson(session.answers);
  return {
    id: session.id,
    taskAttemptId: session.taskAttemptId,
    minuteStep: session.minuteStep === 1 ? 1 as const : 5 as const,
    questions,
    answers,
    currentIndex: session.currentIndex,
    correctCount: session.correctCount,
    totalQuestions: session.totalQuestions,
    completedAt: session.completedAt,
  };
}

async function requireClockAttempt(childId: string, attemptId: string) {
  const slot = await prisma.activeTaskSlot.findUnique({
    where: { childId },
    include: { attempt: { include: { dailyTask: true } } },
  });
  if (!slot || slot.attemptId !== attemptId) {
    throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
  }
  if (slot.attempt.dailyTask.experienceKindSnapshot !== "CLOCK_LEARNING") {
    throw new HttpError(409, "NOT_CLOCK_TASK", "这不是时钟学习任务");
  }
  return slot.attempt;
}

export async function startClockLearningSession(
  childId: string,
  attemptId: string,
  config: AppConfig,
) {
  await requireClockAttempt(childId, attemptId);
  const existing = await prisma.clockLearningSession.findUnique({
    where: { taskAttemptId: attemptId },
  });
  if (existing) return { session: serializeClockSession(existing) };

  const settings = await prisma.clockLearningSettings.upsert({
    where: { childId },
    update: {},
    create: { childId },
  });
  const minuteStep = settings.minuteStep === 1 ? 1 as const : 5 as const;
  const questions = generateClockQuestions(settings.questionsPerDay, minuteStep);
  try {
    const session = await prisma.clockLearningSession.create({
      data: {
        childId,
        taskAttemptId: attemptId,
        sessionDate: businessDateAt(new Date(), config.APP_TIME_ZONE),
        minuteStep,
        questions,
        answers: [],
        totalQuestions: questions.length,
      },
    });
    return { session: serializeClockSession(session) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const session = await prisma.clockLearningSession.findUniqueOrThrow({
      where: { taskAttemptId: attemptId },
    });
    return { session: serializeClockSession(session) };
  }
}

export async function answerClockQuestion(
  childId: string,
  sessionId: string,
  input: { questionIndex: number; hour: number; minute: number; second: number },
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.clockLearningSession.findFirst({
      where: { id: sessionId, childId },
    });
    if (!session) throw new HttpError(404, "CLOCK_SESSION_NOT_FOUND", "没有找到这次时钟学习");
    const questions = questionsFromJson(session.questions);
    const answers = answersFromJson(session.answers);
    const question = questions[input.questionIndex];
    if (!question) throw new HttpError(400, "CLOCK_QUESTION_NOT_FOUND", "没有找到这道题");
    const existingAnswer = answers.find((answer) => answer.questionIndex === input.questionIndex);
    if (existingAnswer) {
      return { session: serializeClockSession(session), answer: existingAnswer, question };
    }
    if (input.questionIndex !== session.currentIndex) {
      throw new HttpError(409, "CLOCK_QUESTION_OUT_OF_ORDER", "请按顺序完成时钟题目");
    }

    const answer: ClockAnswer = {
      questionIndex: input.questionIndex,
      hour: input.hour,
      minute: input.minute,
      second: input.second,
      correct: isClockAnswerCorrect(question, input),
      answeredAt: now.toISOString(),
    };
    const nextIndex = session.currentIndex + 1;
    const completedAt = nextIndex >= session.totalQuestions ? now : null;
    const updatedCount = await tx.clockLearningSession.updateMany({
      where: { id: session.id, childId, currentIndex: input.questionIndex },
      data: {
        answers: [...answers, answer],
        currentIndex: nextIndex,
        correctCount: { increment: answer.correct ? 1 : 0 },
        completedAt,
      },
    });
    const updated = await tx.clockLearningSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    if (updatedCount.count === 0) {
      const savedAnswer = answersFromJson(updated.answers).find(
        (item) => item.questionIndex === input.questionIndex,
      );
      if (savedAnswer) {
        return { session: serializeClockSession(updated), answer: savedAnswer, question };
      }
      throw new HttpError(409, "CLOCK_QUESTION_OUT_OF_ORDER", "请按顺序完成时钟题目");
    }
    return { session: serializeClockSession(updated), answer, question };
  });
}

export async function finishClockLearningSession(childId: string, sessionId: string) {
  const session = await prisma.clockLearningSession.findFirst({
    where: { id: sessionId, childId },
  });
  if (!session) throw new HttpError(404, "CLOCK_SESSION_NOT_FOUND", "没有找到这次时钟学习");
  if (!session.completedAt || session.currentIndex < session.totalQuestions) {
    throw new HttpError(409, "CLOCK_SESSION_INCOMPLETE", "请先完成全部时钟题目");
  }
  return completeTask(childId, session.taskAttemptId);
}
