ALTER TABLE "MakeTenLearningSettings"
ALTER COLUMN "secondsPerQuestion" TYPE DOUBLE PRECISION
USING "secondsPerQuestion"::DOUBLE PRECISION;

ALTER TABLE "MakeTenLearningSettings"
ALTER COLUMN "secondsPerQuestion" SET DEFAULT 5;

ALTER TABLE "MakeTenLearningSession"
ALTER COLUMN "secondsPerQuestion" TYPE DOUBLE PRECISION
USING "secondsPerQuestion"::DOUBLE PRECISION;
