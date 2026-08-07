CREATE TABLE "MascotAsset" (
    "id" TEXT NOT NULL,
    "petType" "PetType" NOT NULL,
    "slot" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MascotAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MascotAsset_petType_slot_key" ON "MascotAsset"("petType", "slot");
CREATE INDEX "MascotAsset_slot_idx" ON "MascotAsset"("slot");
