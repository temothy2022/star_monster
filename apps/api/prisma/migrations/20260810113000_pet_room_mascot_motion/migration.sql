CREATE TYPE "PetRoomMascotMotion" AS ENUM (
  'IDLE',
  'CLOUD_FLOAT',
  'UNDERWATER_SWIM',
  'PETAL_SWAY',
  'STARGAZE',
  'ZERO_GRAVITY',
  'SPORT_BOUNCE',
  'ADVENTURE_MARCH'
);

ALTER TABLE "PetRoomTheme"
  ADD COLUMN "mascotMotion" "PetRoomMascotMotion" NOT NULL DEFAULT 'IDLE';

UPDATE "PetRoomTheme" SET "mascotMotion" = 'CLOUD_FLOAT' WHERE "key" = 'cloud-castle';
UPDATE "PetRoomTheme" SET "mascotMotion" = 'PETAL_SWAY' WHERE "key" IN ('forest-treehouse', 'cherry-courtyard', 'osaka-castle');
UPDATE "PetRoomTheme" SET "mascotMotion" = 'UNDERWATER_SWIM' WHERE "key" = 'underwater-observatory';
UPDATE "PetRoomTheme" SET "mascotMotion" = 'STARGAZE' WHERE "key" IN ('snow-lodge', 'starlight-camp');
UPDATE "PetRoomTheme" SET "mascotMotion" = 'ZERO_GRAVITY' WHERE "key" IN ('lunar-station', 'space-guardian');
UPDATE "PetRoomTheme" SET "mascotMotion" = 'SPORT_BOUNCE' WHERE "key" = 'basketball-court';
UPDATE "PetRoomTheme" SET "mascotMotion" = 'ADVENTURE_MARCH' WHERE "key" = 'great-wall';
