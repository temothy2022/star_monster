CREATE TABLE "SmsDeliveryLog" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerHost" TEXT,
    "providerPath" TEXT,
    "providerHttpStatus" INTEGER,
    "providerCode" TEXT,
    "providerRequestId" TEXT,
    "providerMessage" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsDeliveryLog_createdAt_idx" ON "SmsDeliveryLog"("createdAt");
CREATE INDEX "SmsDeliveryLog_status_createdAt_idx" ON "SmsDeliveryLog"("status", "createdAt");
CREATE INDEX "SmsDeliveryLog_purpose_createdAt_idx" ON "SmsDeliveryLog"("purpose", "createdAt");
