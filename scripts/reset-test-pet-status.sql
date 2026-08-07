BEGIN;

UPDATE "PetGrowthProfile"
SET
  satiety = 0,
  hydration = 0,
  "satietySettledAt" = CURRENT_TIMESTAMP,
  "hydrationSettledAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP;

SELECT
  COUNT(*) AS profiles_updated,
  MIN(satiety) AS min_satiety,
  MAX(satiety) AS max_satiety,
  MIN(hydration) AS min_hydration,
  MAX(hydration) AS max_hydration
FROM "PetGrowthProfile";

COMMIT;
