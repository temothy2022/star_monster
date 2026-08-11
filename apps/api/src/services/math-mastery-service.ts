import { Prisma } from "@prisma/client";
import {
  MATH_QUESTION_TYPES_BY_ID,
  type MathDifficulty,
  type MathQuestion,
  type MathQuestionTypeId,
} from "@star-monsters/math-practice";
import {
  assessMathMastery,
  expectedMathResponseMs,
  mathQuestionTypeMeta,
  type MathQuestionOutcome,
} from "../domain/math-mastery.js";
import { prisma } from "../lib/prisma.js";

function questionsFromJson(value: Prisma.JsonValue): MathQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      typeof item.typeId !== "string" ||
      !(item.typeId in MATH_QUESTION_TYPES_BY_ID)
    ) return [];
    return [item as unknown as MathQuestion];
  });
}

function validTypeId(value: string | null | undefined): value is MathQuestionTypeId {
  return Boolean(value && value in MATH_QUESTION_TYPES_BY_ID);
}

function validDifficulty(value: number | null | undefined): MathDifficulty {
  return value === 2 || value === 3 ? value : 1;
}

export async function getMathMasteryForRange(
  childId: string,
  range: { from: Date; to: Date },
  options: { templateId?: string } = {},
) {
  const attempts = await prisma.mathPracticeQuestionAttempt.findMany({
    where: {
      childId,
      answeredAt: { gte: range.from, lte: range.to },
      ...(options.templateId
        ? { session: { taskAttempt: { dailyTask: { templateId: options.templateId } } } }
        : {}),
    },
    orderBy: [
      { answeredAt: "asc" },
      { sessionId: "asc" },
      { questionIndex: "asc" },
      { attemptNumber: "asc" },
    ],
    include: {
      session: {
        select: {
          questions: true,
          taskAttempt: { select: { dailyTask: { select: { templateId: true } } } },
        },
      },
    },
  });

  const attemptsByQuestion = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const key = `${attempt.sessionId}:${attempt.questionIndex}`;
    const bucket = attemptsByQuestion.get(key) ?? [];
    bucket.push(attempt);
    attemptsByQuestion.set(key, bucket);
  }

  const outcomes: Array<MathQuestionOutcome & { templateId: string }> = [];
  for (const questionAttempts of attemptsByQuestion.values()) {
    const first = questionAttempts[0]!;
    const question = questionsFromJson(first.session.questions)[first.questionIndex];
    const questionTypeId = validTypeId(first.questionTypeId)
      ? first.questionTypeId
      : question?.typeId;
    if (!questionTypeId || !validTypeId(questionTypeId)) continue;
    const difficulty = validDifficulty(first.difficulty ?? question?.difficulty);
    outcomes.push({
      questionTypeId,
      difficulty,
      sessionId: first.sessionId,
      questionIndex: first.questionIndex,
      answeredAt: questionAttempts.at(-1)!.answeredAt,
      correct: questionAttempts.some((attempt) => attempt.correct),
      firstTryCorrect: first.correct,
      responseMs: questionAttempts.reduce((sum, attempt) => sum + attempt.responseMs, 0),
      expectedResponseMs:
        first.expectedResponseMs ??
        expectedMathResponseMs(questionTypeId, difficulty, question?.answer.values.length ?? 1),
      templateId: first.session.taskAttempt.dailyTask.templateId,
    });
  }

  const recentFrom = new Date(Math.max(
    range.from.getTime(),
    range.to.getTime() - 13 * 24 * 60 * 60 * 1_000,
  ));
  const summarizeTypes = (items: MathQuestionOutcome[]) => {
    const byType = new Map<MathQuestionTypeId, MathQuestionOutcome[]>();
    for (const outcome of items) {
      const bucket = byType.get(outcome.questionTypeId) ?? [];
      bucket.push(outcome);
      byType.set(outcome.questionTypeId, bucket);
    }
    return Array.from(byType.entries())
      .map(([questionTypeId, typeItems]) => ({
        ...mathQuestionTypeMeta(questionTypeId),
        ...assessMathMastery(typeItems, recentFrom),
      }))
      .sort((left, right) =>
        left.mastery.score - right.mastery.score ||
        right.totalQuestions - left.totalQuestions ||
        left.questionTypeId.localeCompare(right.questionTypeId),
      );
  };
  const templateIds = Array.from(new Set(outcomes.map((item) => item.templateId)));
  const types = summarizeTypes(outcomes);

  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      recentFrom: recentFrom.toISOString(),
    },
    summary: assessMathMastery(outcomes, recentFrom),
    types,
    templates: templateIds.map((templateId) => {
      const templateOutcomes = outcomes.filter((item) => item.templateId === templateId);
      return {
        templateId,
        summary: assessMathMastery(templateOutcomes, recentFrom),
        types: summarizeTypes(templateOutcomes),
      };
    }),
  };
}
