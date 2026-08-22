import {
  MATH_QUESTION_CATEGORY_BY_TYPE,
  MATH_QUESTION_TYPES_BY_ID,
  type MathDifficulty,
  type MathQuestionTypeId,
} from "@star-monsters/math-practice";

export type MathQuestionOutcome = {
  questionTypeId: MathQuestionTypeId;
  difficulty: MathDifficulty;
  sessionId: string;
  questionIndex: number;
  answeredAt: Date;
  correct: boolean;
  firstTryCorrect: boolean;
  responseMs: number;
  expectedResponseMs: number;
};

export type MathMasteryLevel =
  | "NO_DATA"
  | "WEAK"
  | "DEVELOPING"
  | "PROFICIENT"
  | "MASTERED";

export type MathMasteryTrend =
  | "INSUFFICIENT"
  | "IMPROVING"
  | "STABLE"
  | "DECLINING";

const BASE_RESPONSE_SECONDS_BY_CATEGORY = {
  QUANTITY: 12,
  PLACE_VALUE: 15,
  MEASUREMENT: 10,
  CALCULATION: 11,
  VISUAL_MODEL: 18,
  WORD_PROBLEM: 30,
  POSITION: 13,
  LOGIC_SPACE: 24,
} as const;

const TYPE_RESPONSE_SECONDS_OVERRIDES: Partial<Record<MathQuestionTypeId, number>> = {
  N03: 9,
  N08: 7,
  N09: 16,
  C02: 16,
  C03: 16,
  C07: 8,
  C08: 9,
  C09: 10,
  C10: 11,
  C11: 12,
  C12: 13,
  C13: 14,
  C14: 15,
  C15: 15,
  V07: 24,
  W04: 34,
  W05: 34,
  W08: 36,
  W09: 36,
  S03: 42,
  S04: 24,
};

export function expectedMathResponseMs(
  questionTypeId: MathQuestionTypeId,
  difficulty: MathDifficulty = 1,
  answerSlots = 1,
) {
  const category = MATH_QUESTION_CATEGORY_BY_TYPE[questionTypeId]?.category.id;
  const baseSeconds =
    TYPE_RESPONSE_SECONDS_OVERRIDES[questionTypeId] ??
    (category ? BASE_RESPONSE_SECONDS_BY_CATEGORY[category] : 15);
  const difficultyFactor = difficulty === 1 ? 0.85 : difficulty === 3 ? 1.25 : 1;
  const extraSlotSeconds = Math.max(0, Math.min(6, answerSlots) - 1) * 2.5;
  return Math.round((baseSeconds * difficultyFactor + extraSlotSeconds) * 1_000);
}

function rate(correct: number, total: number) {
  return total > 0 ? correct / total : null;
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function trendFor(
  recent: MathQuestionOutcome[],
  previous: MathQuestionOutcome[],
): MathMasteryTrend {
  if (recent.length < 5 || previous.length < 5) return "INSUFFICIENT";
  const recentAccuracy = rate(recent.filter((item) => item.correct).length, recent.length)!;
  const previousAccuracy = rate(previous.filter((item) => item.correct).length, previous.length)!;
  const recentSpeedRatio = average(recent.map((item) => item.responseMs / item.expectedResponseMs))!;
  const previousSpeedRatio = average(previous.map((item) => item.responseMs / item.expectedResponseMs))!;
  const accuracyDelta = recentAccuracy - previousAccuracy;
  const speedDelta = recentSpeedRatio - previousSpeedRatio;
  if (accuracyDelta >= 0.08 || (accuracyDelta >= -0.02 && speedDelta <= -0.18)) return "IMPROVING";
  if (accuracyDelta <= -0.08 || (accuracyDelta <= 0.02 && speedDelta >= 0.18)) return "DECLINING";
  return "STABLE";
}

export function assessMathMastery(
  outcomes: MathQuestionOutcome[],
  recentFrom: Date,
) {
  const totalQuestions = outcomes.length;
  const correctQuestions = outcomes.filter((item) => item.correct).length;
  const firstTryCorrectQuestions = outcomes.filter((item) => item.firstTryCorrect).length;
  const accuracy = rate(correctQuestions, totalQuestions);
  const firstTryAccuracy = rate(firstTryCorrectQuestions, totalQuestions);
  const averageResponseMs = average(outcomes.map((item) => item.responseMs));
  const averageExpectedResponseMs = average(outcomes.map((item) => item.expectedResponseMs));
  const recent = outcomes.filter((item) => item.answeredAt >= recentFrom);
  const previous = outcomes.filter((item) => item.answeredAt < recentFrom);
  const recentAccuracy = rate(recent.filter((item) => item.correct).length, recent.length);
  const recentAverageResponseMs = average(recent.map((item) => item.responseMs));
  const speedScore = averageResponseMs && averageExpectedResponseMs
    ? Math.min(1, averageExpectedResponseMs / averageResponseMs)
    : 0;
  const sampleScore = Math.min(1, totalQuestions / 30);
  const recentScore = recentAccuracy ?? accuracy ?? 0;
  const masteryScore = Math.round(
    ((accuracy ?? 0) * 0.5 + speedScore * 0.25 + sampleScore * 0.1 + recentScore * 0.15) * 100,
  );
  const trend = trendFor(recent, previous);

  let level: MathMasteryLevel = "NO_DATA";
  let label = "数据不足";
  if (totalQuestions >= 5) {
    if (
      totalQuestions >= 20 &&
      (accuracy ?? 0) >= 0.95 &&
      speedScore >= 0.82 &&
      trend !== "DECLINING"
    ) {
      level = "MASTERED";
      label = "熟练";
    } else if (
      totalQuestions >= 10 &&
      (accuracy ?? 0) >= 0.85 &&
      masteryScore >= 75
    ) {
      level = "PROFICIENT";
      label = "掌握";
    } else if ((accuracy ?? 0) >= 0.7 && masteryScore >= 52) {
      level = "DEVELOPING";
      label = "练习中";
    } else {
      level = "WEAK";
      label = "薄弱";
    }
  }

  return {
    practiceSessions: new Set(outcomes.map((item) => item.sessionId)).size,
    totalQuestions,
    correctQuestions,
    incorrectQuestions: totalQuestions - correctQuestions,
    accuracy,
    firstTryAccuracy,
    averageResponseMs: averageResponseMs === null ? null : Math.round(averageResponseMs),
    expectedResponseMs: averageExpectedResponseMs === null ? null : Math.round(averageExpectedResponseMs),
    recentQuestions: recent.length,
    recentAccuracy,
    recentAverageResponseMs:
      recentAverageResponseMs === null ? null : Math.round(recentAverageResponseMs),
    mastery: { level, label, score: masteryScore },
    trend,
  };
}

export function mathQuestionTypeMeta(questionTypeId: MathQuestionTypeId) {
  const type = MATH_QUESTION_TYPES_BY_ID[questionTypeId];
  const catalogue = MATH_QUESTION_CATEGORY_BY_TYPE[questionTypeId];
  return {
    questionTypeId,
    name: type.name,
    categoryId: catalogue?.category.id ?? "OTHER",
    categoryName: catalogue?.category.name ?? "其他",
    familyId: catalogue?.family.id ?? "OTHER",
    familyName: catalogue?.family.name ?? type.name,
  };
}
