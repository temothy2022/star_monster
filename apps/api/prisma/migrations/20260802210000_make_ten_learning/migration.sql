ALTER TYPE "TaskExperienceKind" ADD VALUE 'MAKE_TEN';

CREATE TABLE "MakeTenLearningSettings" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "questionsPerDay" INTEGER NOT NULL DEFAULT 20,
    "secondsPerQuestion" INTEGER NOT NULL DEFAULT 5,
    "passAccuracyPercent" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MakeTenLearningSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MakeTenLearningSession" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "taskAttemptId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "secondsPerQuestion" INTEGER NOT NULL,
    "passAccuracyPercent" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL,
    "passed" BOOLEAN,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MakeTenLearningSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MakeTenLearningSettings_childId_key" ON "MakeTenLearningSettings"("childId");
CREATE UNIQUE INDEX "MakeTenLearningSession_taskAttemptId_key" ON "MakeTenLearningSession"("taskAttemptId");
CREATE INDEX "MakeTenLearningSession_childId_completedAt_idx" ON "MakeTenLearningSession"("childId", "completedAt");
CREATE INDEX "MakeTenLearningSession_childId_sessionDate_idx" ON "MakeTenLearningSession"("childId", "sessionDate");

ALTER TABLE "MakeTenLearningSettings" ADD CONSTRAINT "MakeTenLearningSettings_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeTenLearningSession" ADD CONSTRAINT "MakeTenLearningSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeTenLearningSession" ADD CONSTRAINT "MakeTenLearningSession_taskAttemptId_fkey" FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
