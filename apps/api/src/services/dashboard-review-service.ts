import type { AppConfig } from "../config.js";
import {
  selectDailyReview,
  selectNearestReviews,
} from "../domain/dashboard-review.js";
import { prisma } from "../lib/prisma.js";
import { businessDateAt } from "../lib/time.js";

const HANZI_REVIEW_LIMIT = 4;
const POEM_ROTATION_POOL_SIZE = 4;

export async function getTaskDashboardReviews(
  childId: string,
  config: AppConfig,
  now = new Date(),
) {
  const today = businessDateAt(now, config.APP_TIME_ZONE);
  const hanziWhere = {
    childId,
    status: "LEARNING" as const,
    nextReviewDate: { not: null },
    character: { isEnabled: true },
  };
  const poemWhere = {
    childId,
    status: "LEARNING" as const,
    nextReviewDate: { not: null },
    poem: { isEnabled: true },
  };

  const [hanziPast, hanziFuture, poemPast, poemFuture] = await Promise.all([
    prisma.hanziLearningProgress.findMany({
      where: { ...hanziWhere, nextReviewDate: { lte: today } },
      orderBy: [{ nextReviewDate: "desc" }, { id: "asc" }],
      take: HANZI_REVIEW_LIMIT,
      select: {
        id: true,
        nextReviewDate: true,
        character: {
          select: {
            id: true,
            character: true,
            words: true,
            wordAudioUrls: true,
            characterAudioUrl: true,
          },
        },
      },
    }),
    prisma.hanziLearningProgress.findMany({
      where: { ...hanziWhere, nextReviewDate: { gt: today } },
      orderBy: [{ nextReviewDate: "asc" }, { id: "asc" }],
      take: HANZI_REVIEW_LIMIT,
      select: {
        id: true,
        nextReviewDate: true,
        character: {
          select: {
            id: true,
            character: true,
            words: true,
            wordAudioUrls: true,
            characterAudioUrl: true,
          },
        },
      },
    }),
    prisma.poemLearningProgress.findMany({
      where: { ...poemWhere, nextReviewDate: { lte: today } },
      orderBy: [{ nextReviewDate: "desc" }, { id: "asc" }],
      take: POEM_ROTATION_POOL_SIZE,
      select: {
        id: true,
        nextReviewDate: true,
        poem: {
          select: {
            id: true,
            title: true,
            dynasty: true,
            author: true,
            content: true,
            audioUrl: true,
          },
        },
      },
    }),
    prisma.poemLearningProgress.findMany({
      where: { ...poemWhere, nextReviewDate: { gt: today } },
      orderBy: [{ nextReviewDate: "asc" }, { id: "asc" }],
      take: POEM_ROTATION_POOL_SIZE,
      select: {
        id: true,
        nextReviewDate: true,
        poem: {
          select: {
            id: true,
            title: true,
            dynasty: true,
            author: true,
            content: true,
            audioUrl: true,
          },
        },
      },
    }),
  ]);

  const hanzi = selectNearestReviews(
    [...hanziPast, ...hanziFuture].filter(
      (progress): progress is typeof progress & { nextReviewDate: Date } =>
        progress.nextReviewDate !== null,
    ),
    today,
    HANZI_REVIEW_LIMIT,
  ).map((progress) => {
    const wordIndex = progress.character.words.findIndex((word) => word.trim().length > 0);
    return {
      id: progress.character.id,
      character: progress.character.character,
      word: wordIndex >= 0 ? progress.character.words[wordIndex] ?? null : null,
      characterAudioUrl: progress.character.characterAudioUrl,
      wordAudioUrl: wordIndex >= 0
        ? progress.character.wordAudioUrls[wordIndex] ?? null
        : null,
      nextReviewDate: progress.nextReviewDate.toISOString().slice(0, 10),
    };
  });

  const selectedPoem = selectDailyReview(
    [...poemPast, ...poemFuture].filter(
      (progress): progress is typeof progress & { nextReviewDate: Date } =>
        progress.nextReviewDate !== null,
    ),
    today,
    POEM_ROTATION_POOL_SIZE,
  );

  return {
    date: today.toISOString().slice(0, 10),
    hanzi,
    poem: selectedPoem
      ? {
          ...selectedPoem.poem,
          nextReviewDate: selectedPoem.nextReviewDate.toISOString().slice(0, 10),
        }
      : null,
  };
}
