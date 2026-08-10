ALTER TABLE "PetRoomTheme"
  ADD COLUMN "ownerFamilyId" TEXT;

CREATE INDEX "PetRoomTheme_ownerFamilyId_isEnabled_sortOrder_idx"
  ON "PetRoomTheme"("ownerFamilyId", "isEnabled", "sortOrder");

ALTER TABLE "PetRoomTheme"
  ADD CONSTRAINT "PetRoomTheme_ownerFamilyId_fkey"
  FOREIGN KEY ("ownerFamilyId") REFERENCES "Family"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
