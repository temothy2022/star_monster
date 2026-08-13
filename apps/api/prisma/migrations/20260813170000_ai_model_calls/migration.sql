CREATE TABLE "AiModelCall" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "providerCode" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModelCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiModelCall_provider_createdAt_idx" ON "AiModelCall"("provider", "createdAt");
CREATE INDEX "AiModelCall_status_createdAt_idx" ON "AiModelCall"("status", "createdAt");
CREATE INDEX "AiModelCall_createdAt_idx" ON "AiModelCall"("createdAt");
