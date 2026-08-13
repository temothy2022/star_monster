CREATE TABLE "TravelPackingList" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '下一次旅行',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TravelPackingList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TravelPackingCategory" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TravelPackingCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TravelPackingItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TravelPackingItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TravelPackingList_familyId_key" ON "TravelPackingList"("familyId");
CREATE INDEX "TravelPackingCategory_listId_sortOrder_idx" ON "TravelPackingCategory"("listId", "sortOrder");
CREATE INDEX "TravelPackingItem_categoryId_sortOrder_idx" ON "TravelPackingItem"("categoryId", "sortOrder");

ALTER TABLE "TravelPackingList" ADD CONSTRAINT "TravelPackingList_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelPackingCategory" ADD CONSTRAINT "TravelPackingCategory_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TravelPackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelPackingItem" ADD CONSTRAINT "TravelPackingItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TravelPackingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
