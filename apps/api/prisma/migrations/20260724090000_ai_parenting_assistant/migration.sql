-- AI 育儿助手：加密配置、建议单、学习排班偏好
CREATE TYPE "LearningPracticeKind" AS ENUM ('GENERAL', 'NEW_CONTENT', 'REVIEW', 'MIXED');
CREATE TYPE "AiRecommendationKind" AS ENUM ('TASK_ADVICE', 'REWARD_AUDIT', 'SCHEDULE');
CREATE TYPE "AiRecommendationStatus" AS ENUM ('DRAFT', 'APPLIED', 'DISMISSED');

ALTER TABLE "TaskTemplate"
ADD COLUMN "aiSchedulingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "learningPracticeKind" "LearningPracticeKind" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "targetSessionsPerWeek" INTEGER,
ADD COLUMN "minimumGapDays" INTEGER;

CREATE TABLE "FamilyAiConfig" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'DEEPSEEK',
  "model" TEXT NOT NULL DEFAULT 'deepseek-chat',
  "encryptedApiKey" TEXT NOT NULL,
  "encryptionIv" TEXT NOT NULL,
  "encryptionTag" TEXT NOT NULL,
  "apiKeyLastFour" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyAiConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChildSchedulePreference" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "maxDailyMinutes" INTEGER NOT NULL DEFAULT 40,
  "maxConsecutiveMinutes" INTEGER NOT NULL DEFAULT 15,
  "minimumBreakMinutes" INTEGER NOT NULL DEFAULT 5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildSchedulePreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChildAvailabilitySlot" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildAvailabilitySlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRecommendation" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "kind" "AiRecommendationKind" NOT NULL,
  "status" "AiRecommendationStatus" NOT NULL DEFAULT 'DRAFT',
  "promptVersion" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "requestPayload" JSONB NOT NULL,
  "responsePayload" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilyAiConfig_familyId_key" ON "FamilyAiConfig"("familyId");
CREATE UNIQUE INDEX "ChildSchedulePreference_childId_key" ON "ChildSchedulePreference"("childId");
CREATE INDEX "ChildAvailabilitySlot_childId_weekday_startMinute_idx"
ON "ChildAvailabilitySlot"("childId", "weekday", "startMinute");
CREATE INDEX "AiRecommendation_familyId_childId_kind_createdAt_idx"
ON "AiRecommendation"("familyId", "childId", "kind", "createdAt");
CREATE INDEX "AiRecommendation_status_createdAt_idx"
ON "AiRecommendation"("status", "createdAt");

ALTER TABLE "FamilyAiConfig"
ADD CONSTRAINT "FamilyAiConfig_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChildSchedulePreference"
ADD CONSTRAINT "ChildSchedulePreference_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChildAvailabilitySlot"
ADD CONSTRAINT "ChildAvailabilitySlot_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiRecommendation"
ADD CONSTRAINT "AiRecommendation_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiRecommendation"
ADD CONSTRAINT "AiRecommendation_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
