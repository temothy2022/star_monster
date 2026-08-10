ALTER TABLE "PetGrowthProfile"
  ADD COLUMN "satietyDecayMinutes" INTEGER,
  ADD COLUMN "hydrationDecayMinutes" INTEGER,
  ADD COLUMN "dailyWasteCount" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "wasteCleanCostStars" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "PetWasteOccurrence" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "wasteDate" DATE NOT NULL,
  "sequence" INTEGER NOT NULL,
  "appearsMinute" INTEGER NOT NULL,
  "positionSeed" INTEGER NOT NULL,
  "costStarsSnapshot" INTEGER NOT NULL,
  "cleanIdempotencyKey" TEXT,
  "cleanedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PetWasteOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PetWasteOccurrence_cleanIdempotencyKey_key"
  ON "PetWasteOccurrence"("cleanIdempotencyKey");
CREATE UNIQUE INDEX "PetWasteOccurrence_childId_wasteDate_sequence_key"
  ON "PetWasteOccurrence"("childId", "wasteDate", "sequence");
CREATE INDEX "PetWasteOccurrence_childId_wasteDate_cleanedAt_appearsMinute_idx"
  ON "PetWasteOccurrence"("childId", "wasteDate", "cleanedAt", "appearsMinute");

ALTER TABLE "PetWasteOccurrence"
  ADD CONSTRAINT "PetWasteOccurrence_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetWasteOccurrence"
  ADD CONSTRAINT "PetWasteOccurrence_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "PetGrowthProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
