import { Prisma, type MakeTenLearningSession } from "@prisma/client";
import type { AppConfig } from "../config.js";
import {
  generateMakeTenQuestions,
  isMakeTenAnswerCorrect,
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

  const settings = await prisma.makeTenLearningSettings.upsert({
    where: { childId },
    update: {},
    create: { childId },
  });
  const questions = generateMakeTenQuestions(settings.questionsPerDay);
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
  input: { questionIndex: number; selectedNumber: number | null; timedOut: boolean },
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

    const answer: MakeTenAnswer = {
      questionIndex: input.questionIndex,
      selectedNumber: input.timedOut ? null : input.selectedNumber,
      correct: !input.timedOut && isMakeTenAnswerCorrect(question.target, input.selectedNumber),
      timedOut: input.timedOut,
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
    const updated = await tx.makeTenLearningSession.findUniqueOrThrow({ where: { id: session.id } });
    if (updatedCount.count === 0) {
      const savedAnswer = answersFromJson(updated.answers).find((item) => item.questionIndex === input.questionIndex);
      if (savedAnswer) return { session: serializeSession(updated), answer: savedAnswer, question };
      throw new HttpError(409, "MAKE_TEN_QUESTION_OUT_OF_ORDER", "请按顺序完成凑十题目");
    }
    return { session: serializeSession(updated), answer, question };
  });
}

export async function finishMakeTenSession(childId: string, sessionId: string) {
  const session = await prisma.makeTenLearningSession.findFirst({ where: { id: sessionId, childId } });
  if (!session) throw new HttpError(404, "MAKE_TEN_SESSION_NOT_FOUND", "没有找到这次凑十训练");
  if (!session.completedAt || session.currentIndex < session.totalQuestions || session.passed === null) {
    throw new HttpError(409, "MAKE_TEN_SESSION_INCOMPLETE", "请先完成全部凑十题目");
  }
  return completeTask(childId, session.taskAttemptId);
}
