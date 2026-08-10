import { Prisma, type MathPracticeSession } from "@prisma/client";
import {
  MATH_QUESTION_TYPES_BY_ID,
  answerMathQuestion,
  generateMathWorksheet,
  type MathQuestion,
  type MathQuestionTypeId,
} from "@star-monsters/math-practice";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";
import { completeTask } from "./task-service.js";

function questionsFromJson(value: Prisma.JsonValue): MathQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      typeof item.id !== "string" ||
      typeof item.seed !== "number" ||
      typeof item.typeId !== "string" ||
      !(item.typeId in MATH_QUESTION_TYPES_BY_ID) ||
      typeof item.prompt !== "string" ||
      typeof item.visual !== "object" ||
      typeof item.response !== "object" ||
      typeof item.answer !== "object" ||
      typeof item.explanation !== "string"
    ) return [];
    return [item as unknown as MathQuestion];
  });
}

function publicQuestion(question: MathQuestion | undefined) {
  if (!question) return null;
  const { answer: _answer, ...safeQuestion } = question;
  return safeQuestion;
}

async function serializeSession(
  session: MathPracticeSession,
  options: { questions?: MathQuestion[]; attemptsForCurrent?: number } = {},
) {
  const questions = options.questions ?? questionsFromJson(session.questions);
  const attemptsForCurrent = options.attemptsForCurrent ?? (session.currentIndex < session.totalQuestions
    ? await prisma.mathPracticeQuestionAttempt.count({
        where: { sessionId: session.id, questionIndex: session.currentIndex },
      })
    : 0);
  return {
    id: session.id,
    taskAttemptId: session.taskAttemptId,
    currentIndex: session.currentIndex,
    correctCount: session.correctCount,
    totalQuestions: session.totalQuestions,
    completedAt: session.completedAt,
    attemptsForCurrent,
    question: publicQuestion(questions[session.currentIndex]),
  };
}

function stableSeed(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeTypeCounts(value: Prisma.JsonValue) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(409, "MATH_PRACTICE_CONFIG_INVALID", "数学练习配置不正确");
  }
  const counts: Partial<Record<MathQuestionTypeId, number>> = {};
  for (const [typeId, count] of Object.entries(value)) {
    if (!(typeId in MATH_QUESTION_TYPES_BY_ID) || typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new HttpError(409, "MATH_PRACTICE_CONFIG_INVALID", "数学练习配置不正确");
    }
    if (count > 0) counts[typeId as MathQuestionTypeId] = count;
  }
  return counts;
}

async function requireMathPracticeAttempt(childId: string, attemptId: string) {
  const slot = await prisma.activeTaskSlot.findUnique({
    where: { childId },
    include: {
      attempt: {
        include: {
          dailyTask: {
            include: { template: { include: { mathPracticeConfig: true } } },
          },
        },
      },
    },
  });
  if (!slot || slot.attemptId !== attemptId) {
    throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
  }
  if (slot.attempt.dailyTask.experienceKindSnapshot !== "MATH_PRACTICE") {
    throw new HttpError(409, "NOT_MATH_PRACTICE_TASK", "这不是数学练习任务");
  }
  const snapshot = slot.attempt.dailyTask.mathPracticeConfigSnapshot;
  const fallbackConfig = slot.attempt.dailyTask.template.mathPracticeConfig;
  const snapshotConfig =
    typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot) &&
    typeof snapshot.totalQuestions === "number" && snapshot.typeCounts !== undefined
      ? { totalQuestions: snapshot.totalQuestions, typeCounts: snapshot.typeCounts }
      : null;
  const practiceConfig = snapshotConfig ?? fallbackConfig;
  if (!practiceConfig) {
    throw new HttpError(409, "MATH_PRACTICE_CONFIG_MISSING", "这个数学练习还没有配置题目");
  }
  return practiceConfig;
}

export async function startMathPracticeSession(childId: string, attemptId: string, config: AppConfig) {
  const practiceConfig = await requireMathPracticeAttempt(childId, attemptId);
  const existing = await prisma.mathPracticeSession.findUnique({ where: { taskAttemptId: attemptId } });
  if (existing) return { session: await serializeSession(existing) };

  const typeCounts = normalizeTypeCounts(practiceConfig.typeCounts);
  const questions = generateMathWorksheet(typeCounts, stableSeed(attemptId));
  if (questions.length !== practiceConfig.totalQuestions || questions.length === 0) {
    throw new HttpError(409, "MATH_PRACTICE_CONFIG_INVALID", "题型数量之和与总题数不一致");
  }

  try {
    const session = await prisma.mathPracticeSession.create({
      data: {
        childId,
        taskAttemptId: attemptId,
        sessionDate: businessDateAt(new Date(), config.APP_TIME_ZONE),
        questions: JSON.parse(JSON.stringify(questions)) as Prisma.InputJsonValue,
        totalQuestions: questions.length,
      },
    });
    return { session: await serializeSession(session, { questions, attemptsForCurrent: 0 }) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const session = await prisma.mathPracticeSession.findUniqueOrThrow({ where: { taskAttemptId: attemptId } });
    return { session: await serializeSession(session) };
  }
}

export async function answerMathPracticeQuestion(
  childId: string,
  sessionId: string,
  input: { questionIndex: number; values: string[]; responseMs: number },
) {
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.mathPracticeSession.findFirst({ where: { id: sessionId, childId } });
    if (!session) throw new HttpError(404, "MATH_PRACTICE_SESSION_NOT_FOUND", "没有找到这次数学练习");
    if (session.completedAt) throw new HttpError(409, "MATH_PRACTICE_SESSION_COMPLETED", "这次数学练习已经完成");
    if (input.questionIndex !== session.currentIndex) {
      throw new HttpError(409, "MATH_PRACTICE_QUESTION_OUT_OF_ORDER", "请按顺序完成数学题目");
    }
    const questions = questionsFromJson(session.questions);
    const question = questions[input.questionIndex];
    if (!question) throw new HttpError(409, "MATH_PRACTICE_QUESTION_NOT_FOUND", "没有找到这道数学题");

    const previousAttempts = await tx.mathPracticeQuestionAttempt.count({
      where: { sessionId: session.id, questionIndex: input.questionIndex },
    });
    const attemptNumber = previousAttempts + 1;
    if (attemptNumber > 2) {
      throw new HttpError(409, "MATH_PRACTICE_QUESTION_ALREADY_SETTLED", "这道题已经完成");
    }
    const correct = answerMathQuestion(question, input.values);
    const revealAnswer = !correct && attemptNumber >= 2;
    const advance = correct || revealAnswer;
    const nextIndex = advance ? session.currentIndex + 1 : session.currentIndex;
    const completed = nextIndex >= session.totalQuestions;
    const correctCount = session.correctCount + (correct ? 1 : 0);

    await tx.mathPracticeQuestionAttempt.create({
      data: {
        childId,
        sessionId: session.id,
        questionIndex: input.questionIndex,
        attemptNumber,
        values: input.values,
        correct,
        responseMs: Math.max(0, Math.min(600_000, Math.round(input.responseMs))),
      },
    });
    const updatedCount = await tx.mathPracticeSession.updateMany({
      where: { id: session.id, childId, currentIndex: input.questionIndex },
      data: {
        currentIndex: nextIndex,
        correctCount,
        completedAt: completed ? new Date() : null,
      },
    });
    if (updatedCount.count !== 1) {
      throw new HttpError(409, "MATH_PRACTICE_QUESTION_OUT_OF_ORDER", "请按顺序完成数学题目");
    }
    const updated = await tx.mathPracticeSession.findUniqueOrThrow({ where: { id: session.id } });
    return {
      updated,
      questions,
      attemptsForCurrent: advance ? 0 : attemptNumber,
      feedback: {
        correct,
        attemptNumber,
        revealAnswer,
        correctAnswer: advance ? question.answer : null,
        explanation: advance ? question.explanation : null,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    session: await serializeSession(result.updated, {
      questions: result.questions,
      attemptsForCurrent: result.attemptsForCurrent,
    }),
    feedback: result.feedback,
  };
}

export async function finishMathPracticeSession(childId: string, sessionId: string) {
  const session = await prisma.mathPracticeSession.findFirst({ where: { id: sessionId, childId } });
  if (!session) throw new HttpError(404, "MATH_PRACTICE_SESSION_NOT_FOUND", "没有找到这次数学练习");
  if (!session.completedAt || session.currentIndex < session.totalQuestions) {
    throw new HttpError(409, "MATH_PRACTICE_SESSION_INCOMPLETE", "请先完成全部数学题目");
  }
  return completeTask(childId, session.taskAttemptId);
}
