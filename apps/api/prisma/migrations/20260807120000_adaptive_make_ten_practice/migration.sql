CREATE TABLE "MakeTenQuestionAttempt" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "questionIndex" INTEGER NOT NULL,
  "target" INTEGER NOT NULL,
  "selectedNumber" INTEGER,
  "correct" BOOLEAN NOT NULL,
  "timedOut" BOOLEAN NOT NULL,
  "responseMs" INTEGER NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MakeTenQuestionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MakeTenFactProgress" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "target" INTEGER NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "totalResponseMs" INTEGER NOT NULL DEFAULT 0,
  "recentAccuracy" DOUBLE PRECISION,
  "recentResponseMs" DOUBLE PRECISION,
  "consecutiveWrong" INTEGER NOT NULL DEFAULT 0,
  "lastAnsweredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MakeTenFactProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MakeTenQuestionAttempt_sessionId_questionIndex_key"
ON "MakeTenQuestionAttempt"("sessionId", "questionIndex");

CREATE INDEX "MakeTenQuestionAttempt_childId_target_answeredAt_idx"
ON "MakeTenQuestionAttempt"("childId", "target", "answeredAt");

CREATE UNIQUE INDEX "MakeTenFactProgress_childId_target_key"
ON "MakeTenFactProgress"("childId", "target");

CREATE INDEX "MakeTenFactProgress_childId_lastAnsweredAt_idx"
ON "MakeTenFactProgress"("childId", "lastAnsweredAt");

ALTER TABLE "MakeTenQuestionAttempt"
ADD CONSTRAINT "MakeTenQuestionAttempt_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MakeTenQuestionAttempt"
ADD CONSTRAINT "MakeTenQuestionAttempt_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MakeTenLearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MakeTenFactProgress"
ADD CONSTRAINT "MakeTenFactProgress_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
