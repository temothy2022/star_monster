CREATE TYPE "ChallengeConversationStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');
CREATE TYPE "ChallengeMessageSender" AS ENUM ('VIRTUAL_PARTNER', 'CHILD');

CREATE TABLE "SystemAiConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "provider" TEXT NOT NULL DEFAULT 'DEEPSEEK',
  "model" TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  "encryptedApiKey" TEXT NOT NULL,
  "encryptionIv" TEXT NOT NULL,
  "encryptionTag" TEXT NOT NULL,
  "apiKeyLastFour" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemAiConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemAiConfig" (
  "id", "provider", "model", "encryptedApiKey", "encryptionIv",
  "encryptionTag", "apiKeyLastFour", "enabled", "updatedByUserId",
  "createdAt", "updatedAt"
)
SELECT
  'default', "provider", "model", "encryptedApiKey", "encryptionIv",
  "encryptionTag", "apiKeyLastFour", "enabled", "updatedByUserId",
  "createdAt", "updatedAt"
FROM "FamilyAiConfig"
ORDER BY "enabled" DESC, "updatedAt" DESC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "ChallengeConversation" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "competitorId" TEXT NOT NULL,
  "competitorName" TEXT NOT NULL,
  "competitorAvatarKey" TEXT NOT NULL,
  "status" "ChallengeConversationStatus" NOT NULL DEFAULT 'GENERATING',
  "openedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChallengeConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChallengeConversationMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "sender" "ChallengeMessageSender" NOT NULL,
  "text" TEXT NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChallengeConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChallengeConversation_childId_businessDate_key"
ON "ChallengeConversation"("childId", "businessDate");
CREATE INDEX "ChallengeConversation_childId_status_businessDate_idx"
ON "ChallengeConversation"("childId", "status", "businessDate");
CREATE INDEX "ChallengeConversationMessage_conversationId_createdAt_idx"
ON "ChallengeConversationMessage"("conversationId", "createdAt");

ALTER TABLE "ChallengeConversation"
ADD CONSTRAINT "ChallengeConversation_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChallengeConversationMessage"
ADD CONSTRAINT "ChallengeConversationMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "ChallengeConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
