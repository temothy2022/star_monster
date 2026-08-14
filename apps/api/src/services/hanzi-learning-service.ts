import { Prisma, type HanziCharacter, type HanziLearningSession } from "@prisma/client";
import type { AppConfig } from "../config.js";
import {
  planHanziCompletion,
  type HanziQuestionAnswer,
  type HanziReviewAnswer,
} from "../domain/hanzi-completion.js";
import { selectPrioritizedHanziCharacters } from "../domain/hanzi-selection.js";
import {
  firstHanziReviewDate,
  HANZI_REVIEW_STAGE_COUNT,
  nextHanziReviewDate,
  retryHanziReviewDate,
} from "../domain/hanzi-review-rules.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";
import { completeTask } from "./task-service.js";

const REVIEW_INTERVAL_DAYS = [1, 2, 4, 7, 15, 30] as const;

type ConsolidationQuestion = {
  targetId: string;
  optionIds: string[];
};

type HanziSessionRecord = {
  id: string;
  childId: string;
  taskAttemptId: string;
  sessionDate: Date;
  kind: "COMBINED_LEGACY" | "LEARNING" | "REVIEW";
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
  targets: Array<Pick<HanziCharacter, "id">>,
  pool: Array<Pick<HanziCharacter, "id" | "sortOrder">>,
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
  if (
    slot.attempt.dailyTask.experienceKindSnapshot !== "HANZI_LEARNING" &&
    slot.attempt.dailyTask.experienceKindSnapshot !== "HANZI_REVIEW"
  ) {
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
  const attempt = await requireHanziAttempt(childId, attemptId);
  const kind = attemptKindForExperience(
    attempt.dailyTask.experienceKindSnapshot,
  );
  const [dueProgress, unlearnedCharacters, schoolTargets, pool] = await Promise.all([
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
      orderBy: { id: "asc" },
      select: { id: true },
    }),
    prisma.hanziSchoolTarget.findMany({
      where: {
        childId,
        character: {
          isEnabled: true,
          progress: { none: { childId } },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { characterId: true },
    }),
    prisma.hanziCharacter.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    }),
  ]);
  const poolById = new Map(pool.map((character) => [character.id, character]));
  const newCharacterIds = kind === "REVIEW"
    ? []
    : selectPrioritizedHanziCharacters(
        unlearnedCharacters,
        schoolTargets.map((target) => target.characterId),
        normalizedSettings.newCharactersPerDay,
        `${childId}:${today.toISOString().slice(0, 10)}`,
      )
        .map(({ id }) => id)
        .filter((id) => poolById.has(id));
  if (!pool.length) {
    throw new HttpError(409, "HANZI_LIBRARY_EMPTY", "汉字词库还没有可学习的内容");
  }

  const reviewCharacters = kind === "LEARNING"
    ? []
    : dueProgress.map((item) => item.character);
  const targetIds = unique([
    ...reviewCharacters.map((item) => item.id),
    ...newCharacterIds,
  ]).filter((id) => poolById.has(id));
  const questionTargets = targetIds.length
    ? targetIds.map((id) => poolById.get(id)!)
    : pool.slice(0, 1);
  const questions = kind === "REVIEW"
    ? []
    : buildQuestions(questionTargets, pool, normalizedSettings.consolidationQuestionCount);
  const phase = kind === "REVIEW" || reviewCharacters.length
    ? "REVIEW"
    : newCharacterIds.length
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
        kind,
        reviewCharacterIds: reviewCharacters.map((item) => item.id),
        newCharacterIds,
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

function attemptKindForExperience(experienceKind: string): "COMBINED_LEGACY" | "LEARNING" | "REVIEW" {
  if (experienceKind === "HANZI_REVIEW") return "REVIEW";
  if (experienceKind === "HANZI_LEARNING") return "LEARNING";
  return "COMBINED_LEGACY";
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
          status: nextStage >= HANZI_REVIEW_STAGE_COUNT ? "MASTERED" : "LEARNING",
          reviewStage: Math.min(nextStage, HANZI_REVIEW_STAGE_COUNT),
          nextReviewDate: nextHanziReviewDate(
            progress.learnedDate,
            nextStage,
            today,
          ),
          consecutiveWrong: 0,
          lastReviewedAt: new Date(),
        },
      });
    } else {
      const wrongCount = progress.consecutiveWrong + 1;
      const nextStage = Math.max(0, progress.reviewStage - 1);
      const difficult = wrongCount >= 2;
      await tx.hanziLearningProgress.update({
        where: { id: progress.id },
        data: {
          status: "LEARNING",
          reviewStage: nextStage,
          nextReviewDate: retryHanziReviewDate(today, nextStage, difficult),
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
        nextReviewDate: firstHanziReviewDate(today),
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

export async function finalizeHanziSession(
  childId: string,
  sessionId: string,
  input: {
    reviewAnswers: HanziReviewAnswer[];
    learnedCharacterIds: string[];
    masteredCharacterIds: string[];
    answers: HanziQuestionAnswer[];
  },
  config: AppConfig,
) {
  const initialSession = await prisma.hanziLearningSession.findFirst({
    where: { id: sessionId, childId },
  });
  if (!initialSession) {
    throw new HttpError(404, "HANZI_SESSION_NOT_FOUND", "没有找到学习记录");
  }
  if (initialSession.phase === "COMPLETED") {
    return completeTask(childId, initialSession.taskAttemptId);
  }
  await requireHanziAttempt(childId, initialSession.taskAttemptId);
  const today = businessDateAt(new Date(), config.APP_TIME_ZONE);

  const taskAttemptId = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "HanziLearningSession"
        WHERE "id" = ${sessionId}
        FOR UPDATE
      `;
      const session = await tx.hanziLearningSession.findFirst({
        where: { id: sessionId, childId },
      });
      if (!session) {
        throw new HttpError(
          404,
          "HANZI_SESSION_NOT_FOUND",
          "没有找到学习记录",
        );
      }
      if (session.phase === "COMPLETED") return session.taskAttemptId;

      const questions = questionsFromJson(session.consolidationQuestions);
      const plan = planHanziCompletion({
        reviewCharacterIds: session.reviewCharacterIds,
        reviewIndex: session.reviewIndex,
        newCharacterIds: session.newCharacterIds,
        newIndex: session.newIndex,
        questions,
        questionIndex: session.questionIndex,
        ...input,
      });

      const reviewKnownIds = [...session.reviewKnownIds];
      const reviewUnknownIds = [...session.reviewUnknownIds];
      for (const answer of plan.remainingReviewAnswers) {
        const progress = await tx.hanziLearningProgress.findUnique({
          where: {
            childId_characterId: {
              childId,
              characterId: answer.characterId,
            },
          },
        });
        if (!progress) {
          throw new HttpError(
            404,
            "HANZI_PROGRESS_NOT_FOUND",
            "没有找到这个字的复习进度",
          );
        }
        if (answer.known) {
          const nextStage = progress.reviewStage + 1;
          await tx.hanziLearningProgress.update({
            where: { id: progress.id },
            data: {
              status:
                nextStage >= HANZI_REVIEW_STAGE_COUNT
                  ? "MASTERED"
                  : "LEARNING",
              reviewStage: Math.min(nextStage, HANZI_REVIEW_STAGE_COUNT),
              nextReviewDate: nextHanziReviewDate(
                progress.learnedDate,
                nextStage,
                today,
              ),
              consecutiveWrong: 0,
              lastReviewedAt: new Date(),
            },
          });
          reviewKnownIds.push(answer.characterId);
        } else {
          const wrongCount = progress.consecutiveWrong + 1;
          const nextStage = Math.max(0, progress.reviewStage - 1);
          const difficult = wrongCount >= 2;
          await tx.hanziLearningProgress.update({
            where: { id: progress.id },
            data: {
              status: "LEARNING",
              reviewStage: nextStage,
              nextReviewDate: retryHanziReviewDate(today, nextStage, difficult),
              isDifficult: difficult || progress.isDifficult,
              consecutiveWrong: wrongCount,
              lastReviewedAt: new Date(),
            },
          });
          reviewUnknownIds.push(answer.characterId);
        }
      }

      const masteredCharacterIds = new Set(plan.masteredCharacterIds);
      for (const characterId of plan.remainingNewCharacterIds) {
        const mastered = masteredCharacterIds.has(characterId);
        await tx.hanziLearningProgress.upsert({
          where: { childId_characterId: { childId, characterId } },
          update: mastered
            ? {
                status: "MASTERED",
                learnedDate: today,
                reviewStage: HANZI_REVIEW_STAGE_COUNT,
                nextReviewDate: null,
                isDifficult: false,
                consecutiveWrong: 0,
              }
            : {},
          create: {
            childId,
            characterId,
            status: mastered ? "MASTERED" : "LEARNING",
            learnedDate: today,
            reviewStage: mastered ? HANZI_REVIEW_STAGE_COUNT : 0,
            nextReviewDate: mastered ? null : firstHanziReviewDate(today),
          },
        });
      }

      await tx.hanziLearningSession.update({
        where: { id: session.id },
        data: {
          phase: "COMPLETED",
          reviewIndex: session.reviewCharacterIds.length,
          reviewKnownIds: unique(reviewKnownIds),
          reviewUnknownIds: unique(reviewUnknownIds),
          newIndex: session.newCharacterIds.length,
          questionIndex: questions.length,
          consolidationCorrect:
            session.consolidationCorrect + plan.additionalCorrect,
          consolidationTotal:
            session.consolidationTotal + plan.remainingAnswers.length,
          completedAt: new Date(),
        },
      });
      return session.taskAttemptId;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return completeTask(childId, taskAttemptId);
}
