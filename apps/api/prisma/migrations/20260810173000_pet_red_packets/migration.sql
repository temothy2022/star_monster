ALTER TYPE "StarLedgerType" ADD VALUE 'PET_RED_PACKET_REWARD';

ALTER TABLE "PetGrowthProfile"
  ADD COLUMN "redPacketsPerLevel" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "redPacketMinStars" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "redPacketMaxStars" INTEGER NOT NULL DEFAULT 5;

CREATE TABLE "PetRedPacket" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "sourceLevel" INTEGER NOT NULL,
  "minStarsSnapshot" INTEGER NOT NULL,
  "maxStarsSnapshot" INTEGER NOT NULL,
  "rewardStars" INTEGER,
  "grantKey" TEXT NOT NULL,
  "claimKey" TEXT,
  "openedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetRedPacket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PetRedPacket_grantKey_key" ON "PetRedPacket"("grantKey");
CREATE UNIQUE INDEX "PetRedPacket_claimKey_key" ON "PetRedPacket"("claimKey");
CREATE INDEX "PetRedPacket_childId_openedAt_createdAt_idx" ON "PetRedPacket"("childId", "openedAt", "createdAt");
CREATE INDEX "PetRedPacket_profileId_sourceLevel_idx" ON "PetRedPacket"("profileId", "sourceLevel");

ALTER TABLE "PetRedPacket" ADD CONSTRAINT "PetRedPacket_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetRedPacket" ADD CONSTRAINT "PetRedPacket_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "PetGrowthProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
