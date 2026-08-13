import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const PLATFORM_FEATURE_ID = "default";

export type PlatformFeatureSettings = {
  realChildCompetitionEnabled: boolean;
  updatedAt: Date | null;
};

export async function getPlatformFeatureSettings(): Promise<PlatformFeatureSettings> {
  const stored = await prisma.platformFeatureConfig.findUnique({
    where: { id: PLATFORM_FEATURE_ID },
    select: { realChildCompetitionEnabled: true, updatedAt: true },
  });
  return {
    // The migration defaults to enabled so existing real-user interactions are preserved.
    realChildCompetitionEnabled: stored?.realChildCompetitionEnabled ?? true,
    updatedAt: stored?.updatedAt ?? null,
  };
}

export async function updatePlatformFeatureSettings(
  tx: Prisma.TransactionClient,
  input: { realChildCompetitionEnabled: boolean; updatedByUserId: string },
) {
  const stored = await tx.platformFeatureConfig.upsert({
    where: { id: PLATFORM_FEATURE_ID },
    create: {
      id: PLATFORM_FEATURE_ID,
      realChildCompetitionEnabled: input.realChildCompetitionEnabled,
      updatedByUserId: input.updatedByUserId,
    },
    update: {
      realChildCompetitionEnabled: input.realChildCompetitionEnabled,
      updatedByUserId: input.updatedByUserId,
    },
    select: { realChildCompetitionEnabled: true, updatedAt: true },
  });
  return stored;
}
