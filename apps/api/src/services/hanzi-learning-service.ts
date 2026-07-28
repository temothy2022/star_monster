import { Prisma, type HanziCharacter, type HanziLearningSession } from "@prisma/client";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";
import { completeTask } from "./task-service.js";

const REVIEW_INTERVAL_DAYS = [2, 4, 7, 14, 30] as const;

type ConsolidationQuestion = {
  targetId: string;
  optionIds: string[];
};

type HanziSessionRecord = {
  id: string;
  childId: string;
  taskAttemptId: string;
  sessionDate: Date;
  phase: string;
  reviewCharacterIds: string[] | null;
  reviewIndex: number | null;
  reviewKnownIds: string[] | null;
  reviewUnknownIds: string[] | null;
  newCharacterIds: string[] | null;
  newIndex: number | null;
  consolidationQuestions: Prisma.JsonValue;
  questionIndex: number | null;
  consolidationCorrect: number | null;
  consolidationTotal: number | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function normalizePositiveInt(value: number | null | undefined, fallback: number): number {
  return value != null && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeNonNegativeInt(value: number | null | undefined, fallback: number): number {
  return value != null && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeStringArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function questionsFromJson(value: Prisma.JsonValue): ConsolidationQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      typeof item.targetId !== "string" ||
      !Array.isArray(item.optionIds)
    ) {
      return [];
    }
    const optionIds = item.optionIds.filter(
      (option): option is string => typeof option === "string",
    );
    return optionIds.length
      ? [{ targetId: item.targetId, optionIds }]
      : [];
  });
}

function buildQuestions(
  targets: HanziCharacter[],
  pool: HanziCharacter[],
  count: number,
): ConsolidationQuestion[] {
  if (!targets.length || !pool.length) return [];
  return Array.from({ length: count }, (_, index) => {
    const target = targets[index % targets.length]!;
    const distractors = pool
      .filter((character) => character.id !== target.id)
      .sort((left, right) => {
        const leftOffset = (left.sortOrder + index * 17) % 997;
        const rightOffset = (right.sortOrder + index * 17) % 997;
        return leftOffset - rightOffset;
      })
      .slice(0, 2);
    const optionIds = [target.id, ...distractors.map((item) => item.id)];
    const rotation = index % optionIds.length;
    return {
      targetId: target.id,
      optionIds: [...optionIds.slice(rotation), ...optionIds.slice(0, rotation)],
    };
  });
}

async function requireHanziAttempt(childId: string, attemptId: string) {
  const slot = await prisma.activeTaskSlot.findUnique({
    where: { childId },
    include: {
      attempt: {
        include: { dailyTask: true },
      },
    },
  });
  if (!slot || slot.attemptId !== attemptId) {
    throw new HttpError(409, "ATTEMPT_NOT_ACTIVE", "这个任务已不在进行中");
  }
  if (slot.attempt.dailyTask.experienceKindSnapshot !== "HANZI_LEARNING") {
    throw new HttpError(400, "NOT_HANZI_TASK", "这不是汉字学习任务");
  }
  return slot.attempt;
}

async function serializeSession(session: HanziSessionRecord) {
  const reviewCharacterIds = normalizeStringArray(session.reviewCharacterIds);
  const reviewKnownIds = normalizeStringArray(session.reviewKnownIds);
  const reviewUnknownIds = normalizeStringArray(session.reviewUnknownIds);
  const newCharacterIds = normalizeStringArray(session.newCharacterIds);
  const reviewIndex = normalizeNonNegativeInt(session.reviewIndex, 0);
  const newIndex = normalizeNonNegativeInt(session.newIndex, 0);
  const questionIndex = normalizeNonNegativeInt(session.questionIndex, 0);
  const consolidationCorrect = normalizeNonNegativeInt(session.consolidationCorrect, 0);
  const consolidationTotal = normalizeNonNegativeInt(session.consolidationTotal, 0);
  const questions = questionsFromJson(session.consolidationQuestions);
  const characterIds = unique([
    ...reviewCharacterIds,
    ...newCharacterIds,
    ...questions.flatMap((question) => [
      question.targetId,
      ...question.optionIds,
    ]),
  ]);
  const characters = await prisma.hanziCharacter.findMany({
    where: { id: { in: characterIds } },
    orderBy: { sortOrder: "asc" },
  });
  return {
    ...session,
    reviewCharacterIds,
    reviewIndex,
    reviewKnownIds,
    reviewUnknownIds,
    newCharacterIds,
    newIndex,
    questionIndex,
    consolidationCorrect,
    consolidationTotal,
    questions,
    characters,
    summary: {
      reviewKnown: reviewKnownIds.length,
      reviewUnknown: reviewUnknownIds.length,
      learned: newCharacterIds.length,
      correct: consolidationCorrect,
      total: consolidationTotal,
    },
  };
}

export async function startHanziSession(
  childId: string,
  attemptId: string,
  config: AppConfig,
) {
  await requireHanziAttempt(childId, attemptId);
  const existing = await prisma.hanziLearningSession.findUnique({
    where: { taskAttemptId: attemptId },
  });
  if (existing) return { session: await serializeSession(existing) };

  const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
  const settings = await prisma.hanziLearningSettings.upsert({
    where: { childId },
    update: {},
    create: { childId },
  });
  const normalizedSettings = {
    newCharactersPerDay: normalizePositiveInt(settings.newCharactersPerDay, 3),
    reviewDailyLimit: normalizePositiveInt(settings.reviewDailyLimit, 25),
    consolidationQuestionCount: normalizePositiveInt(settings.consolidationQuestionCount, 3),
  };
  if (
    normalizedSettings.newCharactersPerDay !== settings.newCharactersPerDay ||
    normalizedSettings.reviewDailyLimit !== settings.reviewDailyLimit ||
    normalizedSettings.consolidationQuestionCount !== settings.consolidationQuestionCount
  ) {
    await prisma.hanziLearningSettings.update({
      where: { id: settings.id },
      data: normalizedSettings,
    });
  }
  const [dueProgress, newCharacters, pool] = await Promise.all([
    prisma.hanziLearningProgress.findMany({
      where: {
        childId,
        status: "LEARNING",
        nextReviewDate: { lte: today },
      },
      orderBy: [
        { isDifficult: "desc" },
        { nextReviewDate: "asc" },
        { createdAt: "asc" },
      ],
      take: normalizedSettings.reviewDailyLimit,
      include: { character: true },
    }),
    prisma.hanziCharacter.findMany({
      where: {
        isEnabled: true,
        progress: { none: { childId } },
      },
      orderBy: { sortOrder: "asc" },
      take: normalizedSettings.newCharactersPerDay,
    }),
    prisma.hanziCharacter.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (!pool.length) {
    throw new HttpError(409, "HANZI_LIBRARY_EMPTY", "汉字词库还没有可学习的内容");
  }

  const reviewCharacters = dueProgress.map((item) => (item as { character: HanziCharacter }).character);
  const targets = unique([
    ...reviewCharacters.map((item) => item.id),
    ...newCharacters.map((item) => item.id),
  ])
    .map((id) => pool.find((item) => item.id === id))
    .filter((item): item is HanziCharacter => Boolean(item));
  const questionTargets = targets.length ? targets : pool.slice(0, 1);
  const questions = buildQuestions(questionTargets, pool, normalizedSettings.consolidationQuestionCount);
  const phase = reviewCharacters.length
    ? "REVIEW"
    : newCharacters.length
      ? "NEW_LEARNING"
      : "CONSOLIDATION";

  // taskAttemptId is the idempotency boundary. Using ON CONFLICT DO NOTHING
  // keeps simultaneous StrictMode/retry requests successful without emitting
  // a unique-constraint error as a server failure.
  await prisma.hanziLearningSession.createMany({
    skipDuplicates: true,
    data: [
      {
        childId,
        taskAttemptId: attemptId,
        sessionDate: today,
        phase,
        reviewCharacterIds: reviewCharacters.map((item) => item.id),
        newCharacterIds: newCharacters.map((item) => item.id),
        consolidationQuestions: questions,
      },
    ],
  });
  const session = await prisma.hanziLearningSession.findUnique({
    where: { taskAttemptId: attemptId },
  });
  if (!session) {
    throw new HttpError(
      503,
      "HANZI_SESSION_NOT_READY",
      "汉字学习正在准备中，请稍后重试",
    );
  }
  return { session: await serializeSession(session) };
}

export async function answerHanziReview(
  childId: string,
  sessionId: string,
  characterId: string,
  known: boolean,
  config: AppConfig,
) {
  const session = await prisma.hanziLearningSession.findFirst({
    where: { id: sessionId, childId },
  });
  if (!session) throw new HttpError(404, "HANZI_SESSION_NOT_FOUND", "没有找到学习记录");
  await requireHanziAttempt(childId, session.taskAttemptId);
  if (
    session.phase !== "REVIEW" ||
    session.reviewCharacterIds[session.reviewIndex] !== characterId
  ) {
    throw new HttpError(409, "HANZI_REVIEW_OUT_OF_ORDER", "这个字还没有轮到复习");
  }

  const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
  const progress = await prisma.hanziLearningProgress.findUnique({
    where: { childId_characterId: { childId, characterId } },
  });
  if (!progress) throw new HttpError(404, "HANZI_PROGRESS_NOT_FOUND", "没有找到这个字的进度");

  const nextIndex = session.reviewIndex + 1;
  const nextPhase =
    nextIndex >= session.reviewCharacterIds.length
      ? session.newCharacterIds.length
        ? "NEW_LEARNING"
        : "CONSOLIDATION"
      : "REVIEW";

  const updated = await prisma.$transaction(async (tx) => {
    if (known) {
      const nextStage = progress.reviewStage + 1;
      await tx.hanziLearningProgress.update({
        where: { id: progress.id },
        data: {
          status: nextStage >= REVIEW_INTERVAL_DAYS.length ? "MASTERED" : "LEARNING",
          reviewStage: Math.min(nextStage, REVIEW_INTERVAL_DAYS.length),
          nextReviewDate:
            nextStage >= REVIEW_INTERVAL_DAYS.length
              ? null
              : addUtcDays(today, REVIEW_INTERVAL_DAYS[nextStage]!),
          consecutiveWrong: 0,
          lastReviewedAt: new Date(),
        },
      });
    } else {
      const wrongCount = progress.consecutiveWrong + 1;
      const nextStage = Math.max(0, progress.reviewStage - 1);
      const difficult = wrongCount >= 2;
      const baseInterval = REVIEW_INTERVAL_DAYS[nextStage] ?? 2;
      await tx.hanziLearningProgress.update({
        where: { id: progress.id },
        data: {
          status: "LEARNING",
          reviewStage: nextStage,
          nextReviewDate: addUtcDays(
            today,
            difficult ? Math.max(1, Math.floor(baseInterval / 2)) : baseInterval,
          ),
          isDifficult: difficult || progress.isDifficult,
          consecutiveWrong: wrongCount,
          lastReviewedAt: new Date(),
        },
      });
    }
    return tx.hanziLearningSession.update({
      where: { id: session.id },
      data: {
        reviewIndex: nextIndex,
        phase: nextPhase,
        reviewKnownIds: known
          ? { push: characterId }
          : undefined,
        reviewUnknownIds: known
          ? undefined
          : { push: characterId },
      },
    });
  });
  return { session: await serializeSession(updated) };
}

export async function completeHanziNewCharacter(
  childId: string,
  sessionId: string,
  characterId: string,
  config: AppConfig,
) {
  const session = await prisma.hanziLearningSession.findFirst({
    where: { id: sessionId, childId },
  });
  if (!session) throw new HttpError(404, "HANZI_SESSION_NOT_FOUND", "没有找到学习记录");
  await requireHanziAttempt(childId, session.taskAttemptId);
  if (
    session.phase !== "NEW_LEARNING" ||
    session.newCharacterIds[session.newIndex] !== characterId
  ) {
    throw new HttpError(409, "HANZI_NEW_OUT_OF_ORDER", "这个字还没有轮到学习");
  }
  const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
  const nextIndex = session.newIndex + 1;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.hanziLearningProgress.upsert({
      where: { childId_characterId: { childId, characterId } },
      update: {},
      create: {
        childId,
        characterId,
        learnedDate: today,
        reviewStage: 0,
        nextReviewDate: addUtcDays(today, REVIEW_INTERVAL_DAYS[0]),
      },
    });
    return tx.hanziLearningSession.update({
      where: { id: session.id },
      data: {
        newIndex: nextIndex,
        phase:
          nextIndex >= session.newCharacterIds.length
            ? "CONSOLIDATION"
            : "NEW_LEARNING",
      },
    });
  });
  return { session: await serializeSession(updated) };
}

export async function answerHanziQuestion(
  childId: string,
  sessionId: string,
  questionIndex: number,
  selectedCharacterId: string,
) {
  const session = await prisma.hanziLearningSession.findFirst({
    where: { id: sessionId, childId },
  });
  if (!session) throw new HttpError(404, "HANZI_SESSION_NOT_FOUND", "没有找到学习记录");
  await requireHanziAttempt(childId, session.taskAttemptId);
  const questions = questionsFromJson(session.consolidationQuestions);
  const question = questions[questionIndex];
  if (
    session.phase !== "CONSOLIDATION" ||
    questionIndex !== session.questionIndex ||
    !question
  ) {
    throw new HttpError(409, "HANZI_QUESTION_OUT_OF_ORDER", "这道题已经回答过了");
  }
  if (!question.optionIds.includes(selectedCharacterId)) {
    throw new HttpError(400, "HANZI_OPTION_INVALID", "这个答案不在选项中");
  }
  const correct = selectedCharacterId === question.targetId;
  const updated = await prisma.hanziLearningSession.update({
    where: { id: session.id },
    data: {
      questionIndex: { increment: 1 },
      consolidationCorrect: correct ? { increment: 1 } : undefined,
      consolidationTotal: { increment: 1 },
    },
  });
  return {
    correct,
    targetCharacterId: question.targetId,
    session: await serializeSession(updated),
  };
}

export async function finishHanziSession(
  childId: string,
  sessionId: string,
) {
  const session = await prisma.hanziLearningSession.findFirst({
    where: { id: sessionId, childId },
  });
  if (!session) throw new HttpError(404, "HANZI_SESSION_NOT_FOUND", "没有找到学习记录");
  await requireHanziAttempt(childId, session.taskAttemptId);
  const questions = questionsFromJson(session.consolidationQuestions);
  if (
    session.reviewIndex < session.reviewCharacterIds.length ||
    session.newIndex < session.newCharacterIds.length ||
    session.questionIndex < questions.length
  ) {
    throw new HttpError(409, "HANZI_SESSION_INCOMPLETE", "请先完成全部汉字学习内容");
  }
  await prisma.hanziLearningSession.update({
    where: { id: session.id },
    data: { phase: "COMPLETED", completedAt: new Date() },
  });
  return completeTask(childId, session.taskAttemptId);
}
