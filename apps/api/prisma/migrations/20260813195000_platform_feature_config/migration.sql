CREATE TABLE "PlatformFeatureConfig" (
    "id" TEXT NOT NULL,
    "realChildCompetitionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeatureConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformFeatureConfig" ("id", "realChildCompetitionEnabled", "createdAt", "updatedAt")
VALUES ('default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
