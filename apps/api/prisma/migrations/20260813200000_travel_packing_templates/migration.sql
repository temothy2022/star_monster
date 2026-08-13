ALTER TABLE "TravelPackingList"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'LIST',
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sourceListId" TEXT;

UPDATE "TravelPackingList" SET "isActive" = true;

DROP INDEX "TravelPackingList_familyId_key";

CREATE INDEX "TravelPackingList_familyId_kind_updatedAt_idx"
ON "TravelPackingList"("familyId", "kind", "updatedAt");

CREATE INDEX "TravelPackingList_familyId_isActive_idx"
ON "TravelPackingList"("familyId", "isActive");

CREATE UNIQUE INDEX "TravelPackingList_one_active_list_per_family_key"
ON "TravelPackingList"("familyId")
WHERE "kind" = 'LIST' AND "isActive" = true;
