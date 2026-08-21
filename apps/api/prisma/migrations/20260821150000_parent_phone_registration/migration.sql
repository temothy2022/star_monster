ALTER TABLE "User"
ADD COLUMN "phoneNumber" TEXT;

CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

CREATE TABLE "ParentRegistrationVerification" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParentRegistrationVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParentRegistrationVerification_phoneNumber_createdAt_idx"
ON "ParentRegistrationVerification"("phoneNumber", "createdAt");

CREATE INDEX "ParentRegistrationVerification_phoneNumber_consumedAt_expiresAt_idx"
ON "ParentRegistrationVerification"("phoneNumber", "consumedAt", "expiresAt");
