CREATE TYPE "ChildBiologicalSex" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');

CREATE TYPE "GrowthMilestoneCategory" AS ENUM (
  'SELF_CARE',
  'LEARNING',
  'LANGUAGE',
  'PHYSICAL',
  'SOCIAL',
  'EMOTIONAL',
  'CREATIVE',
  'FAMILY',
  'OTHER'
);

ALTER TABLE "ChildProfile"
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "biologicalSex" "ChildBiologicalSex";

CREATE TABLE "ChildGrowthRecord" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "recordDate" DATE NOT NULL,
  "heightCm" DECIMAL(5,1),
  "weightKg" DECIMAL(5,2),
  "sleepStartMinute" INTEGER,
  "wakeMinute" INTEGER,
  "napMinutes" INTEGER,
  "sleepQuality" INTEGER,
  "outdoorMinutes" INTEGER,
  "exerciseMinutes" INTEGER,
  "screenMinutes" INTEGER,
  "moodScore" INTEGER,
  "energyScore" INTEGER,
  "appetiteScore" INTEGER,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildGrowthRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChildGrowthMilestone" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "happenedOn" DATE NOT NULL,
  "category" "GrowthMilestoneCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "visibleToChild" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChildGrowthMilestone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildGrowthRecord_childId_recordDate_key"
  ON "ChildGrowthRecord"("childId", "recordDate");
CREATE INDEX "ChildGrowthRecord_childId_recordDate_idx"
  ON "ChildGrowthRecord"("childId", "recordDate");
CREATE INDEX "ChildGrowthMilestone_childId_happenedOn_idx"
  ON "ChildGrowthMilestone"("childId", "happenedOn");
CREATE INDEX "ChildGrowthMilestone_childId_category_happenedOn_idx"
  ON "ChildGrowthMilestone"("childId", "category", "happenedOn");

ALTER TABLE "ChildGrowthRecord"
  ADD CONSTRAINT "ChildGrowthRecord_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChildGrowthMilestone"
  ADD CONSTRAINT "ChildGrowthMilestone_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
