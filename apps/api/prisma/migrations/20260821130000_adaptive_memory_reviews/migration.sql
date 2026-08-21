CREATE TYPE "MemoryRecallRating" AS ENUM ('EASY', 'EFFORTFUL', 'HINTED', 'FORGOT');

ALTER TABLE "HanziLearningProgress"
  ADD COLUMN "lastRecallRating" "MemoryRecallRating",
  ADD COLUMN "lastResponseMs" INTEGER,
  ADD COLUMN "easyRecallCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "effortfulRecallCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hintedRecallCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "forgottenRecallCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "HanziLearningSession"
  ADD COLUMN "reviewOutcomes" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "PoemLearningSettings"
  ADD COLUMN "newPoemsPerSession" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reviewDailyLimit" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "PoemLearningProgress"
  ADD COLUMN "isDifficult" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "consecutiveWrong" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastRecallRating" "MemoryRecallRating",
  ADD COLUMN "lastResponseMs" INTEGER,
  ADD COLUMN "easyRecallCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "effortfulRecallCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hintedRecallCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "forgottenRecallCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PoemLearningSession"
  ADD COLUMN "reviewOutcomes" JSONB NOT NULL DEFAULT '[]';

-- Previously mastered items had no maintenance date. Put naturally reviewed
-- items back on a low-frequency path without disturbing items already due.
-- Hanzi mastered directly through "我已认识" have no lastReviewedAt and must
-- remain exempt from review, preserving the original product behavior.
UPDATE "HanziLearningProgress"
SET "nextReviewDate" = (
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + INTERVAL '60 days'
)::date
WHERE "status" = 'MASTERED'
  AND "nextReviewDate" IS NULL
  AND "lastReviewedAt" IS NOT NULL;

UPDATE "PoemLearningProgress"
SET "nextReviewDate" = (
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + INTERVAL '60 days'
)::date
WHERE "status" = 'MASTERED' AND "nextReviewDate" IS NULL;
