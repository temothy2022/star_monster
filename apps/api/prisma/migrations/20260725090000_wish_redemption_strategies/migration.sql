CREATE TYPE "WishRedemptionType" AS ENUM ('ONE_TIME', 'RECURRING', 'STOCK');
CREATE TYPE "WishRecurrenceKind" AS ENUM ('DAILY', 'WEEKLY', 'INTERVAL');

ALTER TABLE "WishReward"
ADD COLUMN "redemptionType" "WishRedemptionType" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN "recurrenceKind" "WishRecurrenceKind",
ADD COLUMN "recurrenceIntervalDays" INTEGER,
ADD COLUMN "stockRemaining" INTEGER;

UPDATE "WishReward"
SET
  "redemptionType" = 'RECURRING',
  "recurrenceKind" = 'DAILY',
  "recurrenceIntervalDays" = 1
WHERE "isRepeatable" = true;

ALTER TABLE "WishRedemption"
ADD COLUMN "redemptionTypeSnapshot" "WishRedemptionType" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN "recurrenceKindSnapshot" "WishRecurrenceKind",
ADD COLUMN "recurrenceIntervalDaysSnapshot" INTEGER;

UPDATE "WishRedemption" AS redemption
SET
  "redemptionTypeSnapshot" = wish."redemptionType",
  "recurrenceKindSnapshot" = wish."recurrenceKind",
  "recurrenceIntervalDaysSnapshot" = wish."recurrenceIntervalDays"
FROM "WishReward" AS wish
WHERE wish."id" = redemption."wishRewardId";

ALTER TABLE "WishRedemption"
ALTER COLUMN "redemptionTypeSnapshot" DROP DEFAULT;

ALTER TABLE "WishReward"
DROP COLUMN "isRepeatable";
