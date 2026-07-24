ALTER TABLE "TaskTemplate"
ADD COLUMN "repeatableDaily" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DailyTask"
ADD COLUMN "repeatableDailySnapshot" BOOLEAN NOT NULL DEFAULT false;
