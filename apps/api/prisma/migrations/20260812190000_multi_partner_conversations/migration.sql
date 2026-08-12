DROP INDEX IF EXISTS "ChallengeConversation_childId_businessDate_key";

CREATE UNIQUE INDEX "ChallengeConversation_childId_businessDate_competitorId_key"
ON "ChallengeConversation"("childId", "businessDate", "competitorId");
