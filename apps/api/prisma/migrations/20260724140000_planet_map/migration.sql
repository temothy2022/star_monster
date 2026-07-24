-- CreateEnum
CREATE TYPE "PlanetKey" AS ENUM (
  'MERCURY',
  'VENUS',
  'EARTH',
  'MARS',
  'JUPITER',
  'SATURN',
  'URANUS',
  'NEPTUNE'
);

-- AlterEnum
ALTER TYPE "StarLedgerType" ADD VALUE 'PLANET_BONUS';

-- CreateTable
CREATE TABLE "PlanetProgress" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "planet" "PlanetKey" NOT NULL,
  "requiredLifetimeStars" INTEGER NOT NULL,
  "bonusStars" INTEGER NOT NULL,
  "awardedBonusStars" INTEGER,
  "unlockedAt" TIMESTAMP(3),
  "celebratedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanetProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanetProgress_childId_planet_key"
ON "PlanetProgress"("childId", "planet");

-- CreateIndex
CREATE INDEX "PlanetProgress_childId_unlockedAt_idx"
ON "PlanetProgress"("childId", "unlockedAt");

-- AddForeignKey
ALTER TABLE "PlanetProgress"
ADD CONSTRAINT "PlanetProgress_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
