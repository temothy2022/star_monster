-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARENT', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PetType" AS ENUM ('DOUYA', 'PAOPAO', 'TUANTUAN', 'MILU', 'SHANSHAN');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('READING', 'MATH', 'EXERCISE', 'CHORES', 'ORGANIZING', 'MUSIC', 'CHINESE', 'ENGLISH', 'PE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskMode" AS ENUM ('UNTIMED', 'TIMED');

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('DAILY', 'WORKDAYS', 'SELECTED_WEEKDAYS', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "DailyTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'TIMED_OUT', 'ABANDONED', 'DAY_ENDED');

-- CreateEnum
CREATE TYPE "WishCategory" AS ENUM ('SPORTS', 'GAMES', 'TELEVISION', 'TOYS');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'ARRANGED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StarLedgerType" AS ENUM ('TASK_REWARD', 'WISH_SPEND', 'WISH_REFUND', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('CHILD', 'USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildProfile" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "loginCodeLookup" TEXT NOT NULL,
    "loginCodeHash" TEXT NOT NULL,
    "loginCodeLastFour" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "nickname" TEXT,
    "petType" "PetType",
    "onboardingCompletedAt" TIMESTAMP(3),
    "dailyStarGoal" INTEGER NOT NULL DEFAULT 12,
    "starBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeStarsEarned" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildSession" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "iconKey" TEXT NOT NULL,
    "mode" "TaskMode" NOT NULL,
    "suggestedSeconds" INTEGER,
    "timeLimitSeconds" INTEGER,
    "baseStars" INTEGER NOT NULL,
    "earlyBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "earlyThresholdSeconds" INTEGER,
    "earlyBonusStars" INTEGER,
    "scheduleKind" "ScheduleKind" NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "oneTimeDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "taskDate" DATE NOT NULL,
    "status" "DailyTaskStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "categorySnapshot" "TaskCategory" NOT NULL,
    "iconKeySnapshot" TEXT NOT NULL,
    "modeSnapshot" "TaskMode" NOT NULL,
    "suggestedSecondsSnapshot" INTEGER,
    "timeLimitSecondsSnapshot" INTEGER,
    "baseStarsSnapshot" INTEGER NOT NULL,
    "earlyBonusEnabledSnapshot" BOOLEAN NOT NULL,
    "earlyThresholdSecsSnapshot" INTEGER,
    "earlyBonusStarsSnapshot" INTEGER,
    "completedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttempt" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "dailyTaskId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "totalPausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "elapsedSeconds" INTEGER,
    "remainingSeconds" INTEGER,
    "baseStarsAwarded" INTEGER NOT NULL DEFAULT 0,
    "bonusStarsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveTaskSlot" (
    "childId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveTaskSlot_pkey" PRIMARY KEY ("childId")
);

-- CreateTable
CREATE TABLE "StarLedger" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "taskAttemptId" TEXT,
    "type" "StarLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishReward" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "category" "WishCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "costStars" INTEGER NOT NULL,
    "isRepeatable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishRedemption" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "wishRewardId" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "titleSnapshot" TEXT NOT NULL,
    "categorySnapshot" "WishCategory" NOT NULL,
    "costStarsSnapshot" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrangedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveWishRedemptionSlot" (
    "wishRewardId" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveWishRedemptionSlot_pkey" PRIMARY KEY ("wishRewardId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "familyId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Family_status_idx" ON "Family"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_familyId_role_idx" ON "User"("familyId", "role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChildProfile_loginCodeLookup_key" ON "ChildProfile"("loginCodeLookup");

-- CreateIndex
CREATE INDEX "ChildProfile_familyId_status_idx" ON "ChildProfile"("familyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChildSession_tokenHash_key" ON "ChildSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ChildSession_childId_expiresAt_idx" ON "ChildSession"("childId", "expiresAt");

-- CreateIndex
CREATE INDEX "TaskTemplate_childId_isEnabled_archivedAt_idx" ON "TaskTemplate"("childId", "isEnabled", "archivedAt");

-- CreateIndex
CREATE INDEX "TaskTemplate_childId_scheduleKind_oneTimeDate_idx" ON "TaskTemplate"("childId", "scheduleKind", "oneTimeDate");

-- CreateIndex
CREATE INDEX "DailyTask_childId_taskDate_status_sortOrder_idx" ON "DailyTask"("childId", "taskDate", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_childId_templateId_taskDate_key" ON "DailyTask"("childId", "templateId", "taskDate");

-- CreateIndex
CREATE INDEX "TaskAttempt_childId_status_idx" ON "TaskAttempt"("childId", "status");

-- CreateIndex
CREATE INDEX "TaskAttempt_dailyTaskId_status_idx" ON "TaskAttempt"("dailyTaskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttempt_dailyTaskId_attemptNumber_key" ON "TaskAttempt"("dailyTaskId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveTaskSlot_attemptId_key" ON "ActiveTaskSlot"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "StarLedger_taskAttemptId_key" ON "StarLedger"("taskAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "StarLedger_idempotencyKey_key" ON "StarLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StarLedger_childId_createdAt_idx" ON "StarLedger"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "StarLedger_referenceId_idx" ON "StarLedger"("referenceId");

-- CreateIndex
CREATE INDEX "WishReward_childId_category_isEnabled_sortOrder_idx" ON "WishReward"("childId", "category", "isEnabled", "sortOrder");

-- CreateIndex
CREATE INDEX "WishRedemption_childId_status_requestedAt_idx" ON "WishRedemption"("childId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "WishRedemption_wishRewardId_status_idx" ON "WishRedemption"("wishRewardId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveWishRedemptionSlot_redemptionId_key" ON "ActiveWishRedemptionSlot"("redemptionId");

-- CreateIndex
CREATE INDEX "AuditLog_familyId_createdAt_idx" ON "AuditLog"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_createdAt_idx" ON "AuditLog"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildProfile" ADD CONSTRAINT "ChildProfile_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildSession" ADD CONSTRAINT "ChildSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_dailyTaskId_fkey" FOREIGN KEY ("dailyTaskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTaskSlot" ADD CONSTRAINT "ActiveTaskSlot_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveTaskSlot" ADD CONSTRAINT "ActiveTaskSlot_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TaskAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarLedger" ADD CONSTRAINT "StarLedger_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarLedger" ADD CONSTRAINT "StarLedger_taskAttemptId_fkey" FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishReward" ADD CONSTRAINT "WishReward_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishRedemption" ADD CONSTRAINT "WishRedemption_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishRedemption" ADD CONSTRAINT "WishRedemption_wishRewardId_fkey" FOREIGN KEY ("wishRewardId") REFERENCES "WishReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveWishRedemptionSlot" ADD CONSTRAINT "ActiveWishRedemptionSlot_wishRewardId_fkey" FOREIGN KEY ("wishRewardId") REFERENCES "WishReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveWishRedemptionSlot" ADD CONSTRAINT "ActiveWishRedemptionSlot_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "WishRedemption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain integrity checks
ALTER TABLE "ChildProfile"
  ADD CONSTRAINT "ChildProfile_starBalance_nonnegative" CHECK ("starBalance" >= 0),
  ADD CONSTRAINT "ChildProfile_lifetimeStarsEarned_nonnegative" CHECK ("lifetimeStarsEarned" >= 0),
  ADD CONSTRAINT "ChildProfile_dailyStarGoal_positive" CHECK ("dailyStarGoal" > 0);

ALTER TABLE "TaskTemplate"
  ADD CONSTRAINT "TaskTemplate_baseStars_positive" CHECK ("baseStars" > 0);

ALTER TABLE "WishReward"
  ADD CONSTRAINT "WishReward_costStars_positive" CHECK ("costStars" > 0);
