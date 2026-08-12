CREATE TABLE "ChallengePromptTemplate" (
  "id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChallengePromptTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChallengePromptTemplate_text_key"
ON "ChallengePromptTemplate"("text");

CREATE INDEX "ChallengePromptTemplate_isEnabled_createdAt_idx"
ON "ChallengePromptTemplate"("isEnabled", "createdAt");

ALTER TABLE "ChallengeConversationMessage"
ADD COLUMN "visibleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "readAt" TIMESTAMP(3);

UPDATE "ChallengeConversationMessage" AS message
SET "readAt" = conversation."openedAt"
FROM "ChallengeConversation" AS conversation
WHERE message."conversationId" = conversation."id"
  AND message."sender" = 'VIRTUAL_PARTNER'
  AND conversation."openedAt" IS NOT NULL;

CREATE INDEX "ChallengeConversationMessage_conversationId_visibleAt_idx"
ON "ChallengeConversationMessage"("conversationId", "visibleAt");

CREATE INDEX "ChallengeConversationMessage_sender_readAt_visibleAt_idx"
ON "ChallengeConversationMessage"("sender", "readAt", "visibleAt");
