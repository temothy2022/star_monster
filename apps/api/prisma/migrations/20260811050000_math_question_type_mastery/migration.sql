ALTER TABLE "MathPracticeQuestionAttempt"
  ADD COLUMN "questionTypeId" TEXT,
  ADD COLUMN "difficulty" INTEGER,
  ADD COLUMN "expectedResponseMs" INTEGER;

UPDATE "MathPracticeQuestionAttempt" AS attempt
SET
  "questionTypeId" = session."questions" -> attempt."questionIndex" ->> 'typeId',
  "difficulty" = CASE
    WHEN (session."questions" -> attempt."questionIndex" ->> 'difficulty') ~ '^[1-3]$'
      THEN (session."questions" -> attempt."questionIndex" ->> 'difficulty')::INTEGER
    ELSE NULL
  END
FROM "MathPracticeSession" AS session
WHERE session."id" = attempt."sessionId";

CREATE INDEX "MathPracticeQuestionAttempt_childId_questionTypeId_answeredAt_idx"
  ON "MathPracticeQuestionAttempt"("childId", "questionTypeId", "answeredAt");
