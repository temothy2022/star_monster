ALTER TYPE "TaskExperienceKind" ADD VALUE 'MATH_PRACTICE';

ALTER TABLE "DailyTask" ADD COLUMN "mathPracticeConfigSnapshot" JSONB;

CREATE TABLE "MathPracticeConfig" (
    "id" TEXT NOT NULL,
    "taskTemplateId" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 10,
    "typeCounts" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MathPracticeConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MathPracticeSession" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "taskAttemptId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "questions" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MathPracticeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MathPracticeQuestionAttempt" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "responseMs" INTEGER NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MathPracticeQuestionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MathPracticeConfig_taskTemplateId_key" ON "MathPracticeConfig"("taskTemplateId");
CREATE UNIQUE INDEX "MathPracticeSession_taskAttemptId_key" ON "MathPracticeSession"("taskAttemptId");
CREATE INDEX "MathPracticeSession_childId_completedAt_idx" ON "MathPracticeSession"("childId", "completedAt");
CREATE INDEX "MathPracticeSession_childId_sessionDate_idx" ON "MathPracticeSession"("childId", "sessionDate");
CREATE UNIQUE INDEX "MathPracticeQuestionAttempt_sessionId_questionIndex_attemptNumber_key" ON "MathPracticeQuestionAttempt"("sessionId", "questionIndex", "attemptNumber");
CREATE INDEX "MathPracticeQuestionAttempt_childId_answeredAt_idx" ON "MathPracticeQuestionAttempt"("childId", "answeredAt");

ALTER TABLE "MathPracticeConfig" ADD CONSTRAINT "MathPracticeConfig_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathPracticeSession" ADD CONSTRAINT "MathPracticeSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathPracticeSession" ADD CONSTRAINT "MathPracticeSession_taskAttemptId_fkey" FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathPracticeQuestionAttempt" ADD CONSTRAINT "MathPracticeQuestionAttempt_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathPracticeQuestionAttempt" ADD CONSTRAINT "MathPracticeQuestionAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MathPracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MathPracticeSettings" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 10,
    "typeCounts" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MathPracticeSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MathPracticeSettings_childId_key" ON "MathPracticeSettings"("childId");
ALTER TABLE "MathPracticeSettings" ADD CONSTRAINT "MathPracticeSettings_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
