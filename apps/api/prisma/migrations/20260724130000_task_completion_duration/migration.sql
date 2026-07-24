ALTER TABLE "DailyTask"
ADD COLUMN "completionDurationSeconds" INTEGER;

UPDATE "DailyTask" AS task
SET "completionDurationSeconds" = completed_attempt."elapsedSeconds"
FROM (
  SELECT DISTINCT ON ("dailyTaskId")
    "dailyTaskId",
    "elapsedSeconds"
  FROM "TaskAttempt"
  WHERE "status" = 'COMPLETED'
    AND "elapsedSeconds" IS NOT NULL
  ORDER BY "dailyTaskId", "endedAt" DESC
) AS completed_attempt
WHERE task."id" = completed_attempt."dailyTaskId"
  AND task."status" = 'COMPLETED';
