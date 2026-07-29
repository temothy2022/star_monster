CREATE TABLE "ChildPerformanceMetric" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT,
    "status" INTEGER,
    "requestId" TEXT,
    "totalMs" DOUBLE PRECISION NOT NULL,
    "serverMs" DOUBLE PRECISION,
    "clientOverheadMs" DOUBLE PRECISION,
    "apiTotalMs" DOUBLE PRECISION,
    "nonApiMs" DOUBLE PRECISION,
    "ttfbMs" DOUBLE PRECISION,
    "downloadMs" DOUBLE PRECISION,
    "transferSize" INTEGER,
    "route" TEXT,
    "visibilityState" TEXT,
    "online" BOOLEAN,
    "effectiveType" TEXT,
    "connectionRttMs" DOUBLE PRECISION,
    "downlinkMbps" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildPerformanceMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChildPerformanceMetric_childId_createdAt_idx"
ON "ChildPerformanceMetric"("childId", "createdAt");

CREATE INDEX "ChildPerformanceMetric_childId_operation_createdAt_idx"
ON "ChildPerformanceMetric"("childId", "operation", "createdAt");

ALTER TABLE "ChildPerformanceMetric"
ADD CONSTRAINT "ChildPerformanceMetric_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
