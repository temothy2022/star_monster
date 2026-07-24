-- Keep the task-home unlock announcement independent from the planet journey
-- screen. Previously celebrated planets are treated as already announced.
ALTER TABLE "PlanetProgress"
ADD COLUMN "notifiedAt" TIMESTAMP(3);

UPDATE "PlanetProgress"
SET "notifiedAt" = "celebratedAt"
WHERE "celebratedAt" IS NOT NULL;
