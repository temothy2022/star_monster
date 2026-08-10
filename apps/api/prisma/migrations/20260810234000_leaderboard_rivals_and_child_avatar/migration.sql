ALTER TABLE "ChildProfile"
  ADD COLUMN "avatarUrl" TEXT;

ALTER TABLE "ChildLeaderboardSettings"
  ADD COLUMN "speedAnchorDate" DATE,
  ADD COLUMN "speedAnchorMinute" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "speedAnchorEffectiveMinute" INTEGER NOT NULL DEFAULT 0;
