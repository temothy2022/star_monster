-- Earlier releases settled an unsuccessful make-ten session as COMPLETED with
-- zero reward. Preserve the attempt while restoring the task for another try.
UPDATE "TaskAttempt" AS attempt
SET "status" = 'FAILED'
FROM "MakeTenLearningSession" AS session
WHERE session."taskAttemptId" = attempt."id"
  AND session."passed" = false
  AND attempt."status" = 'COMPLETED'
  AND attempt."baseStarsAwarded" = 0
  AND attempt."bonusStarsAwarded" = 0;

UPDATE "DailyTask" AS task
SET
  "status" = 'PENDING',
  "completedAt" = NULL,
  "completionDurationSeconds" = NULL
WHERE EXISTS (
  SELECT 1
  FROM "TaskAttempt" AS failed_attempt
  WHERE failed_attempt."dailyTaskId" = task."id"
    AND failed_attempt."status" = 'FAILED'
)
AND NOT EXISTS (
  SELECT 1
  FROM "TaskAttempt" AS completed_attempt
  WHERE completed_attempt."dailyTaskId" = task."id"
    AND completed_attempt."status" = 'COMPLETED'
);
