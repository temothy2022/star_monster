CREATE TABLE "PetRoomThemeMascotAnimation" (
  "id" TEXT NOT NULL,
  "themeId" TEXT NOT NULL,
  "petType" "PetType" NOT NULL,
  "mediaUrl" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sourceWidth" INTEGER NOT NULL,
  "sourceHeight" INTEGER NOT NULL,
  "frameCount" INTEGER NOT NULL DEFAULT 1,
  "outputBytes" INTEGER NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetRoomThemeMascotAnimation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PetRoomThemeMascotAnimation_themeId_petType_key"
  ON "PetRoomThemeMascotAnimation"("themeId", "petType");
CREATE INDEX "PetRoomThemeMascotAnimation_petType_idx"
  ON "PetRoomThemeMascotAnimation"("petType");

ALTER TABLE "PetRoomThemeMascotAnimation"
  ADD CONSTRAINT "PetRoomThemeMascotAnimation_themeId_fkey"
  FOREIGN KEY ("themeId") REFERENCES "PetRoomTheme"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
