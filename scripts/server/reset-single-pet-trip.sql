\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE pet_trip_cleanup ON COMMIT DROP AS
SELECT
  t.id AS trip_id,
  t."childId" AS child_id,
  t."profileId" AS profile_id,
  t.status,
  t."destinationNameSnapshot" AS destination_name,
  t."costStars" AS cost_stars,
  t."experienceAwarded" AS experience_awarded,
  l.id AS ledger_id,
  l.amount AS ledger_amount,
  l."createdAt" AS ledger_created_at
FROM "PetTrip" t
LEFT JOIN "StarLedger" l
  ON l."referenceId" = t.id
 AND l.type = 'PET_TRAVEL_SPEND';

DO $$
DECLARE
  all_trip_count integer;
  target_count integer;
  travel_ledger_count integer;
  target_status "PetTripStatus";
  target_cost integer;
  target_ledger_amount integer;
BEGIN
  SELECT COUNT(*) INTO all_trip_count FROM "PetTrip";
  SELECT COUNT(*) INTO target_count FROM pet_trip_cleanup;
  SELECT status, cost_stars, ledger_amount
    INTO target_status, target_cost, target_ledger_amount
  FROM pet_trip_cleanup
  LIMIT 1;
  SELECT COUNT(*) INTO travel_ledger_count
  FROM "StarLedger" l
  JOIN "PetTrip" t ON t.id = l."referenceId"
  WHERE l.type = 'PET_TRAVEL_SPEND';

  IF all_trip_count <> 1 OR target_count <> 1 THEN
    RAISE EXCEPTION 'Safety check failed: expected exactly one PetTrip, found %', all_trip_count;
  END IF;
  IF target_status <> 'REVEALED' THEN
    RAISE EXCEPTION 'Safety check failed: expected the only trip to be REVEALED, found %', target_status;
  END IF;
  IF travel_ledger_count <> 1 OR target_ledger_amount <> -target_cost THEN
    RAISE EXCEPTION 'Safety check failed: travel ledger does not match trip cost';
  END IF;
END $$;

SELECT
  f.name AS family,
  c.nickname,
  x.destination_name,
  x.cost_stars,
  x.experience_awarded,
  c."starBalance" AS balance_before,
  p.experience AS experience_before
FROM pet_trip_cleanup x
JOIN "ChildProfile" c ON c.id = x.child_id
JOIN "Family" f ON f.id = c."familyId"
JOIN "PetGrowthProfile" p ON p.id = x.profile_id;

SELECT c.id
FROM "ChildProfile" c
JOIN pet_trip_cleanup x ON x.child_id = c.id
FOR UPDATE;

SELECT p.id
FROM "PetGrowthProfile" p
JOIN pet_trip_cleanup x ON x.profile_id = p.id
FOR UPDATE;

UPDATE "ChildProfile" c
SET
  "starBalance" = c."starBalance" + x.cost_stars,
  "updatedAt" = CURRENT_TIMESTAMP
FROM pet_trip_cleanup x
WHERE c.id = x.child_id;

UPDATE "StarLedger" l
SET "balanceAfter" = l."balanceAfter" + x.cost_stars
FROM pet_trip_cleanup x
WHERE l."childId" = x.child_id
  AND l."createdAt" > x.ledger_created_at;

WITH adjusted AS (
  SELECT
    p.id,
    GREATEST(0, p.experience - x.experience_awarded) AS new_experience
  FROM "PetGrowthProfile" p
  JOIN pet_trip_cleanup x ON x.profile_id = p.id
), leveled AS (
  SELECT
    id,
    new_experience,
    LEAST(30, FLOOR(SQRT(new_experience / 24.0))::integer + 1) AS new_level
  FROM adjusted
)
UPDATE "PetGrowthProfile" p
SET
  experience = l.new_experience,
  level = l.new_level,
  "growthStage" = CASE
    WHEN l.new_level >= 10 THEN 'MATURE'::"PetGrowthStage"
    WHEN l.new_level >= 5 THEN 'GROWING'::"PetGrowthStage"
    ELSE 'BABY'::"PetGrowthStage"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM leveled l
WHERE p.id = l.id;

DELETE FROM "StarLedger" l
USING pet_trip_cleanup x
WHERE l.id = x.ledger_id;

DELETE FROM "PetTrip" t
USING pet_trip_cleanup x
WHERE t.id = x.trip_id;

SELECT
  f.name AS family,
  c.nickname,
  c."starBalance" AS balance_after,
  p.experience AS experience_after,
  p.level AS level_after,
  (SELECT COUNT(*) FROM "PetTrip" t WHERE t."childId" = c.id) AS trips_after,
  (SELECT COUNT(*) FROM "StarLedger" l WHERE l."childId" = c.id AND l.type = 'PET_TRAVEL_SPEND') AS travel_spend_rows_after
FROM pet_trip_cleanup x
JOIN "ChildProfile" c ON c.id = x.child_id
JOIN "Family" f ON f.id = c."familyId"
JOIN "PetGrowthProfile" p ON p.id = x.profile_id;

COMMIT;
