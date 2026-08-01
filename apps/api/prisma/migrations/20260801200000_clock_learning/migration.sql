ALTER TYPE "TaskExperienceKind" ADD VALUE 'CLOCK_LEARNING';

CREATE TABLE "ClockLearningSettings" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "questionsPerDay" INTEGER NOT NULL DEFAULT 5,
    "minuteStep" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClockLearningSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClockLearningSession" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "taskAttemptId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "minuteStep" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClockLearningSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClockLearningSettings_childId_key" ON "ClockLearningSettings"("childId");
CREATE UNIQUE INDEX "ClockLearningSession_taskAttemptId_key" ON "ClockLearningSession"("taskAttemptId");
CREATE INDEX "ClockLearningSession_childId_completedAt_idx" ON "ClockLearningSession"("childId", "completedAt");
CREATE INDEX "ClockLearningSession_childId_sessionDate_idx" ON "ClockLearningSession"("childId", "sessionDate");

ALTER TABLE "ClockLearningSettings" ADD CONSTRAINT "ClockLearningSettings_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClockLearningSession" ADD CONSTRAINT "ClockLearningSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClockLearningSession" ADD CONSTRAINT "ClockLearningSession_taskAttemptId_fkey" FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
