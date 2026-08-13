CREATE TABLE "TravelPackingTodo" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelPackingTodo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TravelPackingTodo_listId_completed_sortOrder_idx" ON "TravelPackingTodo"("listId", "completed", "sortOrder");

ALTER TABLE "TravelPackingTodo" ADD CONSTRAINT "TravelPackingTodo_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "TravelPackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
