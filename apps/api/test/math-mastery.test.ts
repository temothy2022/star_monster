import { describe, expect, it } from "vitest";
import { MATH_QUESTION_TYPES } from "@star-monsters/math-practice";
import {
  assessMathMastery,
  expectedMathResponseMs,
  type MathQuestionOutcome,
} from "../src/domain/math-mastery.js";

function outcomes(input: {
  count: number;
  correct: number;
  responseMs: number;
  expectedResponseMs?: number;
}): MathQuestionOutcome[] {
  return Array.from({ length: input.count }, (_, index) => ({
    questionTypeId: "C07",
    difficulty: 1,
    sessionId: `session-${Math.floor(index / 10)}`,
    questionIndex: index % 10,
    answeredAt: new Date(`2026-08-${String(1 + (index % 10)).padStart(2, "0")}T08:00:00.000Z`),
    correct: index < input.correct,
    firstTryCorrect: index < input.correct,
    responseMs: input.responseMs,
    expectedResponseMs: input.expectedResponseMs ?? 8_000,
  }));
}

describe("数学题型合理耗时基准", () => {
  it("为全部题型提供正数基准，并区分口算与应用题", () => {
    for (const type of MATH_QUESTION_TYPES) {
      expect(expectedMathResponseMs(type.id, 2)).toBeGreaterThan(0);
    }
    expect(expectedMathResponseMs("W08", 2)).toBeGreaterThan(
      expectedMathResponseMs("C07", 2),
    );
  });
});

describe("数学题型掌握度", () => {
  it("相同高正确率下，快速稳定作答比慢速作答的掌握度更高", () => {
    const recentFrom = new Date("2026-07-01T00:00:00.000Z");
    const fast = assessMathMastery(
      outcomes({ count: 30, correct: 29, responseMs: 5_000 }),
      recentFrom,
    );
    const slow = assessMathMastery(
      outcomes({ count: 30, correct: 29, responseMs: 18_000 }),
      recentFrom,
    );
    expect(fast.mastery.level).toBe("MASTERED");
    expect(slow.mastery.level).not.toBe("MASTERED");
    expect(fast.mastery.score).toBeGreaterThan(slow.mastery.score);
  });

  it("样本过少时不会因为一次答对就标记为熟练", () => {
    const result = assessMathMastery(
      outcomes({ count: 3, correct: 3, responseMs: 2_000 }),
      new Date("2026-07-01T00:00:00.000Z"),
    );
    expect(result.mastery.level).toBe("NO_DATA");
    expect(result.mastery.label).toBe("数据不足");
  });

  it("低正确率即使答得快也仍然标记为薄弱", () => {
    const result = assessMathMastery(
      outcomes({ count: 20, correct: 10, responseMs: 3_000 }),
      new Date("2026-07-01T00:00:00.000Z"),
    );
    expect(result.mastery.level).toBe("WEAK");
  });
});
