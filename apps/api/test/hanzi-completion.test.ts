import { describe, expect, it } from "vitest";
import { planHanziCompletion } from "../src/domain/hanzi-completion.js";

const baseInput = {
  reviewCharacterIds: ["review-a", "review-b"],
  reviewIndex: 1,
  newCharacterIds: ["new-a", "new-b"],
  newIndex: 1,
  questions: [
    { targetId: "new-a", optionIds: ["new-a", "other-a"] },
    { targetId: "new-b", optionIds: ["new-b", "other-b"] },
  ],
  questionIndex: 1,
};

describe("hanzi completion planning", () => {
  it("only applies progress not already persisted by an older client", () => {
    const plan = planHanziCompletion({
      ...baseInput,
      reviewAnswers: [
        { characterId: "review-a", known: true },
        { characterId: "review-b", known: false },
      ],
      learnedCharacterIds: ["new-a", "new-b"],
      masteredCharacterIds: ["new-b"],
      answers: [
        { questionIndex: 0, selectedCharacterId: "new-a" },
        { questionIndex: 1, selectedCharacterId: "other-b" },
      ],
    });

    expect(plan.remainingReviewAnswers).toEqual([
      { characterId: "review-b", known: false },
    ]);
    expect(plan.remainingNewCharacterIds).toEqual(["new-b"]);
    expect(plan.masteredCharacterIds).toEqual(["new-b"]);
    expect(plan.remainingAnswers).toEqual([
      {
        questionIndex: 1,
        selectedCharacterId: "other-b",
        correct: false,
      },
    ]);
    expect(plan.additionalCorrect).toBe(0);
  });

  it("rejects an incomplete local draft", () => {
    expect(() =>
      planHanziCompletion({
        ...baseInput,
        reviewAnswers: [],
        learnedCharacterIds: ["new-a"],
        masteredCharacterIds: [],
        answers: [],
      }),
    ).toThrow("还有汉字没有完成复习");
  });

  it("rejects a selected character outside the original options", () => {
    expect(() =>
      planHanziCompletion({
        ...baseInput,
        reviewAnswers: [{ characterId: "review-b", known: true }],
        learnedCharacterIds: ["new-a", "new-b"],
        masteredCharacterIds: [],
        answers: [
          { questionIndex: 1, selectedCharacterId: "not-an-option" },
        ],
      }),
    ).toThrow("听句答案不在题目选项中");
  });

  it("rejects mastered characters outside the current new-character set", () => {
    expect(() =>
      planHanziCompletion({
        ...baseInput,
        reviewAnswers: [{ characterId: "review-b", known: true }],
        learnedCharacterIds: ["new-a", "new-b"],
        masteredCharacterIds: ["other-a"],
        answers: [{ questionIndex: 1, selectedCharacterId: "new-b" }],
      }),
    ).toThrow("已掌握汉字不在本次新字中");
  });
});
