CREATE TYPE "WeeklyGrowthReportStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED');

CREATE TABLE "WeeklyGrowthReport" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "status" "WeeklyGrowthReportStatus" NOT NULL DEFAULT 'GENERATING',
    "promptVersion" TEXT NOT NULL,
    "model" TEXT,
    "metricsPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "errorCode" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyGrowthReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyGrowthReport_childId_weekStart_key"
ON "WeeklyGrowthReport"("childId", "weekStart");

CREATE INDEX "WeeklyGrowthReport_familyId_childId_weekStart_idx"
ON "WeeklyGrowthReport"("familyId", "childId", "weekStart");

CREATE INDEX "WeeklyGrowthReport_status_updatedAt_idx"
ON "WeeklyGrowthReport"("status", "updatedAt");

ALTER TABLE "WeeklyGrowthReport"
ADD CONSTRAINT "WeeklyGrowthReport_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyGrowthReport"
ADD CONSTRAINT "WeeklyGrowthReport_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
