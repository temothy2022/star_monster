CREATE TABLE "FamilyPetRoomThemeSetting" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "themeId" TEXT NOT NULL,
  "priceStars" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyPetRoomThemeSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilyPetRoomThemeSetting_familyId_themeId_key"
  ON "FamilyPetRoomThemeSetting"("familyId", "themeId");
CREATE INDEX "FamilyPetRoomThemeSetting_familyId_idx"
  ON "FamilyPetRoomThemeSetting"("familyId");

ALTER TABLE "FamilyPetRoomThemeSetting"
  ADD CONSTRAINT "FamilyPetRoomThemeSetting_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyPetRoomThemeSetting"
  ADD CONSTRAINT "FamilyPetRoomThemeSetting_themeId_fkey"
  FOREIGN KEY ("themeId") REFERENCES "PetRoomTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
