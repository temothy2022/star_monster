CREATE TABLE "TravelPackingShare" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelPackingShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TravelPackingShare_tokenHash_key" ON "TravelPackingShare"("tokenHash");
CREATE INDEX "TravelPackingShare_listId_expiresAt_idx" ON "TravelPackingShare"("listId", "expiresAt");

ALTER TABLE "TravelPackingShare" ADD CONSTRAINT "TravelPackingShare_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "TravelPackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
