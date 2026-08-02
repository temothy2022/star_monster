-- Poem review tasks are due-date driven and must not inherit new-poem weekdays.
UPDATE "TaskTemplate"
SET
  "scheduleKind" = 'DAILY',
  "weekdays" = ARRAY[]::INTEGER[],
  "oneTimeDate" = NULL
WHERE "experienceKind" = 'POEM_REVIEW';

-- Move existing learning progress onto the daily Ebbinghaus schedule.
-- reviewStage is the number of completed reviews, so it selects the next offset.
UPDATE "PoemLearningProgress"
SET "nextReviewDate" = "learnedDate" +
  CASE "reviewStage"
    WHEN 0 THEN 1
    WHEN 1 THEN 2
    WHEN 2 THEN 4
    WHEN 3 THEN 7
    WHEN 4 THEN 15
    WHEN 5 THEN 30
    ELSE 30
  END
WHERE "status" = 'LEARNING'
  AND "nextReviewDate" IS NOT NULL;
