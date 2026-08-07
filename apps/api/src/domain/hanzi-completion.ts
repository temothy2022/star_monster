import { HttpError } from "../lib/http-error.js";

export type HanziReviewAnswer = {
  characterId: string;
  known: boolean;
};

export type HanziQuestionAnswer = {
  questionIndex: number;
  selectedCharacterId: string;
};

type ConsolidationQuestion = {
  targetId: string;
  optionIds: string[];
};

export function planHanziCompletion(input: {
  reviewCharacterIds: string[];
  reviewIndex: number;
  newCharacterIds: string[];
  newIndex: number;
  questions: ConsolidationQuestion[];
  questionIndex: number;
  reviewAnswers: HanziReviewAnswer[];
  learnedCharacterIds: string[];
  masteredCharacterIds: string[];
  answers: HanziQuestionAnswer[];
}) {
  const reviewAnswers = new Map<string, HanziReviewAnswer>();
  for (const answer of input.reviewAnswers) {
    if (reviewAnswers.has(answer.characterId)) {
      throw new HttpError(
        400,
        "HANZI_REVIEW_DUPLICATED",
        "复习记录中有重复汉字",
      );
    }
    reviewAnswers.set(answer.characterId, answer);
  }
  const remainingReviewAnswers = input.reviewCharacterIds
    .slice(input.reviewIndex)
    .map((characterId) => {
      const answer = reviewAnswers.get(characterId);
      if (!answer) {
        throw new HttpError(
          409,
          "HANZI_REVIEW_INCOMPLETE",
          "还有汉字没有完成复习",
        );
      }
      return answer;
    });

  const learnedCharacterIds = new Set(input.learnedCharacterIds);
  const newCharacterIds = new Set(input.newCharacterIds);
  const masteredCharacterIds = new Set(input.masteredCharacterIds);
  if (
    [...masteredCharacterIds].some(
      (characterId) => !newCharacterIds.has(characterId),
    )
  ) {
    throw new HttpError(
      400,
      "HANZI_MASTERED_INVALID",
      "已掌握汉字不在本次新字中",
    );
  }
  const remainingNewCharacterIds = input.newCharacterIds.slice(input.newIndex);
  if (
    input.newCharacterIds.some((characterId) => !learnedCharacterIds.has(characterId))
  ) {
    throw new HttpError(
      409,
      "HANZI_NEW_INCOMPLETE",
      "还有新字没有完成学习",
    );
  }

  const answers = new Map<number, HanziQuestionAnswer>();
  for (const answer of input.answers) {
    if (answers.has(answer.questionIndex)) {
      throw new HttpError(
        400,
        "HANZI_ANSWER_DUPLICATED",
        "听句答案中有重复题目",
      );
    }
    answers.set(answer.questionIndex, answer);
  }
  const remainingAnswers = input.questions
    .slice(input.questionIndex)
    .map((question, offset) => {
      const questionIndex = input.questionIndex + offset;
      const answer = answers.get(questionIndex);
      if (!answer) {
        throw new HttpError(
          409,
          "HANZI_ANSWER_INCOMPLETE",
          "还有听句挑战没有完成",
        );
      }
      if (!question.optionIds.includes(answer.selectedCharacterId)) {
        throw new HttpError(
          400,
          "HANZI_OPTION_INVALID",
          "听句答案不在题目选项中",
        );
      }
      return {
        ...answer,
        correct: answer.selectedCharacterId === question.targetId,
      };
    });

  return {
    remainingReviewAnswers,
    remainingNewCharacterIds,
    masteredCharacterIds: [...masteredCharacterIds],
    remainingAnswers,
    additionalCorrect: remainingAnswers.filter((answer) => answer.correct)
      .length,
  };
}
