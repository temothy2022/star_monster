ALTER TYPE "TaskCategory" ADD VALUE 'HOMEWORK';

CREATE TABLE "TaskCategoryDefinition" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#9CA3AF',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskCategoryDefinition_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TaskTemplate" ADD COLUMN "customCategoryId" TEXT;

ALTER TABLE "DailyTask" ADD COLUMN "categoryLabelSnapshot" TEXT;
ALTER TABLE "DailyTask" ADD COLUMN "categoryColorSnapshot" TEXT;
ALTER TABLE "DailyTask" ADD COLUMN "customCategoryIdSnapshot" TEXT;

CREATE UNIQUE INDEX "TaskCategoryDefinition_familyId_name_key" ON "TaskCategoryDefinition"("familyId", "name");
CREATE INDEX "TaskCategoryDefinition_familyId_isEnabled_sortOrder_idx" ON "TaskCategoryDefinition"("familyId", "isEnabled", "sortOrder");
CREATE INDEX "TaskTemplate_customCategoryId_idx" ON "TaskTemplate"("customCategoryId");

ALTER TABLE "TaskCategoryDefinition" ADD CONSTRAINT "TaskCategoryDefinition_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_customCategoryId_fkey"
  FOREIGN KEY ("customCategoryId") REFERENCES "TaskCategoryDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
