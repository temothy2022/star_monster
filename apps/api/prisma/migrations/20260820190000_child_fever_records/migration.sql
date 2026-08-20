-- CreateEnum
CREATE TYPE "FeverThermometerType" AS ENUM ('EAR', 'FOREHEAD', 'MERCURY');

-- CreateEnum
CREATE TYPE "FeverAntipyreticKind" AS ENUM ('IBUPROFEN', 'ACETAMINOPHEN', 'OTHER');

-- CreateEnum
CREATE TYPE "FeverObservationLevel" AS ENUM ('GOOD', 'FAIR', 'POOR');

-- CreateTable
CREATE TABLE "ChildFeverEpisode" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildFeverEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildFeverActiveSlot" (
    "childId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChildFeverActiveSlot_pkey" PRIMARY KEY ("childId")
);

-- CreateTable
CREATE TABLE "ChildFeverReading" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "temperatureCelsius" DECIMAL(3,1) NOT NULL,
    "thermometerType" "FeverThermometerType",
    "medicationUsed" BOOLEAN NOT NULL DEFAULT false,
    "antipyreticUsed" BOOLEAN NOT NULL DEFAULT false,
    "antipyreticKind" "FeverAntipyreticKind",
    "medicationNote" TEXT,
    "respiratoryRate" INTEGER,
    "mentalState" "FeverObservationLevel",
    "sleepState" "FeverObservationLevel",
    "appetiteState" "FeverObservationLevel",
    "hydrationState" "FeverObservationLevel",
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildFeverReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChildFeverReading_clientRequestId_key" ON "ChildFeverReading"("clientRequestId");
CREATE INDEX "ChildFeverEpisode_childId_startedAt_idx" ON "ChildFeverEpisode"("childId", "startedAt");
CREATE INDEX "ChildFeverEpisode_childId_endedAt_startedAt_idx" ON "ChildFeverEpisode"("childId", "endedAt", "startedAt");
CREATE UNIQUE INDEX "ChildFeverActiveSlot_episodeId_key" ON "ChildFeverActiveSlot"("episodeId");
CREATE INDEX "ChildFeverReading_episodeId_recordedAt_idx" ON "ChildFeverReading"("episodeId", "recordedAt");
CREATE INDEX "ChildFeverReading_childId_recordedAt_idx" ON "ChildFeverReading"("childId", "recordedAt");

-- AddForeignKey
ALTER TABLE "ChildFeverEpisode" ADD CONSTRAINT "ChildFeverEpisode_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildFeverActiveSlot" ADD CONSTRAINT "ChildFeverActiveSlot_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildFeverActiveSlot" ADD CONSTRAINT "ChildFeverActiveSlot_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ChildFeverEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildFeverReading" ADD CONSTRAINT "ChildFeverReading_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildFeverReading" ADD CONSTRAINT "ChildFeverReading_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ChildFeverEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add the health-record widget once to layouts saved before this feature. It remains removable afterwards.
UPDATE "ChildProfile"
SET "taskDashboardLayout" = jsonb_set(
  "taskDashboardLayout"::jsonb,
  '{widgets}',
  COALESCE("taskDashboardLayout"::jsonb -> 'widgets', '[]'::jsonb) || '["HEALTH_RECORD"]'::jsonb
)
WHERE "taskDashboardLayout" IS NOT NULL
  AND jsonb_typeof("taskDashboardLayout"::jsonb) = 'object'
  AND jsonb_typeof("taskDashboardLayout"::jsonb -> 'widgets') = 'array'
  AND NOT (("taskDashboardLayout"::jsonb -> 'widgets') ? 'HEALTH_RECORD');
