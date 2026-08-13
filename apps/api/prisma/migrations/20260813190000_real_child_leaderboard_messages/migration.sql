CREATE TABLE "DirectChildConversation" (
    "id" TEXT NOT NULL,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectChildConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectChildMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderChildId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectChildMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectChildConversation_participantAId_participantBId_key"
ON "DirectChildConversation"("participantAId", "participantBId");
CREATE INDEX "DirectChildConversation_participantAId_updatedAt_idx"
ON "DirectChildConversation"("participantAId", "updatedAt");
CREATE INDEX "DirectChildConversation_participantBId_updatedAt_idx"
ON "DirectChildConversation"("participantBId", "updatedAt");
CREATE INDEX "DirectChildMessage_conversationId_createdAt_idx"
ON "DirectChildMessage"("conversationId", "createdAt");
CREATE INDEX "DirectChildMessage_senderChildId_createdAt_idx"
ON "DirectChildMessage"("senderChildId", "createdAt");
CREATE INDEX "DirectChildMessage_readAt_createdAt_idx"
ON "DirectChildMessage"("readAt", "createdAt");

ALTER TABLE "DirectChildConversation"
ADD CONSTRAINT "DirectChildConversation_participantAId_fkey"
FOREIGN KEY ("participantAId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectChildConversation"
ADD CONSTRAINT "DirectChildConversation_participantBId_fkey"
FOREIGN KEY ("participantBId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectChildMessage"
ADD CONSTRAINT "DirectChildMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "DirectChildConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectChildMessage"
ADD CONSTRAINT "DirectChildMessage_senderChildId_fkey"
FOREIGN KEY ("senderChildId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
