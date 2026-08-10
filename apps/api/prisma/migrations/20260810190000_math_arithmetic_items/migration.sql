ALTER TABLE "MathPracticeConfig"
  ADD COLUMN "arithmeticItemsPerQuestion" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "MathPracticeSettings"
  ADD COLUMN "arithmeticItemsPerQuestion" JSONB NOT NULL DEFAULT '{}'::jsonb;
