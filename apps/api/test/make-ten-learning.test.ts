import { describe, expect, it } from "vitest";
import {
  generateMakeTenQuestions,
  isMakeTenAnswerCorrect,
  makeTenAnswer,
  makeTenPassed,
} from "../src/domain/make-ten-learning.js";

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe("凑十训练出题", () => {
  it("只生成 1 到 9，并避免相邻重复", () => {
    const questions = generateMakeTenQuestions(
      20,
      sequenceRandom([0.1, 0.7, 0.3, 0.9, 0.2, 0.6]),
    );
    expect(questions).toHaveLength(20);
    expect(questions.every(({ target }) => target >= 1 && target <= 9)).toBe(true);
    expect(questions.every((question, index) => index === 0 || question.target !== questions[index - 1].target)).toBe(true);
  });

  it("答案是与题目相加等于 10 的数字", () => {
    expect(makeTenAnswer(1)).toBe(9);
    expect(makeTenAnswer(2)).toBe(8);
    expect(isMakeTenAnswerCorrect(7, 3)).toBe(true);
    expect(isMakeTenAnswerCorrect(7, 2)).toBe(false);
    expect(isMakeTenAnswerCorrect(7, null)).toBe(false);
  });
});

describe("凑十训练达标规则", () => {
  it("按后台百分比配置判断是否获得任务星星", () => {
    expect(makeTenPassed(8, 10, 80)).toBe(true);
    expect(makeTenPassed(7, 10, 80)).toBe(false);
    expect(makeTenPassed(4, 5, 80)).toBe(true);
  });
});
