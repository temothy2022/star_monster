import { describe, expect, it } from "vitest";
import {
  clockMastery,
  clockSecondIsSeparated,
  generateClockQuestions,
  isClockAnswerCorrect,
  separatedClockSecond,
} from "../src/domain/clock-learning.js";

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe("时钟学习出题", () => {
  it("5 分钟难度只生成 5 的倍数，并同时包含两种题型", () => {
    const questions = generateClockQuestions(
      6,
      5,
      sequenceRandom([0.1, 0.2, 0.8, 0.4, 0.7, 0.3, 0.55, 0.15]),
    );
    expect(questions).toHaveLength(6);
    expect(questions.every((question) => question.minute % 5 === 0)).toBe(true);
    expect(new Set(questions.map((question) => question.type))).toEqual(
      new Set(["SET_CLOCK", "READ_CLOCK"]),
    );
  });

  it("精确到 1 分钟时允许任意分钟", () => {
    const questions = generateClockQuestions(
      3,
      1,
      sequenceRandom([0.1, 0.4, 0.12, 0.8, 0.7, 0.23]),
    );
    expect(questions.some((question) => question.minute % 5 !== 0)).toBe(true);
  });

  it("秒针不会与时针或分针重合，并保留清晰间隔", () => {
    const questions = generateClockQuestions(
      20,
      1,
      sequenceRandom([0, 0.12, 0.26, 0.51, 0.77, 0.93]),
    );
    expect(questions.every(clockSecondIsSeparated)).toBe(true);
    expect(clockSecondIsSeparated({
      hour: 12,
      minute: 0,
      second: separatedClockSecond(12, 0, 0),
    })).toBe(true);
  });
});

describe("时钟答案和掌握程度", () => {
  const question = { type: "SET_CLOCK" as const, hour: 3, minute: 25, second: 0 };

  it("按小时和分钟判断答案，秒针不影响得分", () => {
    expect(isClockAnswerCorrect(question, { hour: 3, minute: 25 })).toBe(true);
    expect(isClockAnswerCorrect(question, { hour: 3, minute: 24 })).toBe(false);
  });

  it("按照正确率给出掌握评价", () => {
    expect(clockMastery(null).label).toBe("暂无数据");
    expect(clockMastery(0.55).label).toBe("需要巩固");
    expect(clockMastery(0.8).label).toBe("基本掌握");
    expect(clockMastery(0.95).label).toBe("掌握良好");
  });
});
