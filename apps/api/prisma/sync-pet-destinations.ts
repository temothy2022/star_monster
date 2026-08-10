import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import {
  EXPANDED_PET_DESTINATIONS,
  LEGACY_DESTINATION_EXPLORATION_PROMPTS,
  LEGACY_POSTCARD_CLOSING,
} from "./pet-destination-expansion.js";

try {
  loadEnvFile(".env");
} catch {
  // Production can provide the same variables through the service environment.
}

const prisma = new PrismaClient();

function narrationChanged(
  current: {
    name: string;
    city: string;
    country: string;
    introduction: string;
    funFact: string;
  },
  next: {
    name: string;
    city: string;
    country: string;
    introduction: string;
    funFact: string;
  },
) {
  return current.name !== next.name
    || current.city !== next.city
    || current.country !== next.country
    || current.introduction !== next.introduction
    || current.funFact !== next.funFact;
}

async function syncExpandedDestinations() {
  let created = 0;
  let updated = 0;
  let audioReset = 0;
  for (const { scene: _scene, ...destination } of EXPANDED_PET_DESTINATIONS) {
    const existing = await prisma.petTravelDestination.findUnique({ where: { id: destination.id } });
    if (!existing) {
      await prisma.petTravelDestination.create({ data: destination });
      created += 1;
      continue;
    }
    const resetAudio = narrationChanged(existing, destination);
    await prisma.petTravelDestination.update({
      where: { id: destination.id },
      data: {
        ...destination,
        ...(resetAudio ? { audioUrl: null } : {}),
      },
    });
    await prisma.petTrip.updateMany({
      where: { destinationId: destination.id },
      data: {
        tierSnapshot: destination.tier,
        destinationNameSnapshot: destination.name,
        citySnapshot: destination.city,
        countrySnapshot: destination.country,
        introductionSnapshot: destination.introduction,
        funFactSnapshot: destination.funFact,
        imageUrlSnapshot: destination.imageUrl,
        audioUrlSnapshot: resetAudio ? null : existing.audioUrl,
      },
    });
    updated += 1;
    if (resetAudio && existing.audioUrl) audioReset += 1;
  }
  return { created, updated, audioReset };
}

async function enrichLegacyDestinations() {
  let enriched = 0;
  let audioReset = 0;
  for (const [slug, prompt] of Object.entries(LEGACY_DESTINATION_EXPLORATION_PROMPTS)) {
    const existing = await prisma.petTravelDestination.findUnique({ where: { slug } });
    if (!existing) continue;
    const missingPrompt = !existing.introduction.includes(prompt);
    const missingClosing = !existing.introduction.includes(LEGACY_POSTCARD_CLOSING);
    const introduction = `${existing.introduction}${missingPrompt ? prompt : ""}${missingClosing ? LEGACY_POSTCARD_CLOSING : ""}`;
    const narrationUpdated = missingPrompt || missingClosing;
    if (narrationUpdated) {
      await prisma.petTravelDestination.update({
        where: { id: existing.id },
        data: {
          introduction,
          audioUrl: null,
        },
      });
    }
    await prisma.petTrip.updateMany({
      where: { destinationId: existing.id },
      data: {
        destinationNameSnapshot: existing.name,
        citySnapshot: existing.city,
        countrySnapshot: existing.country,
        introductionSnapshot: introduction,
        funFactSnapshot: existing.funFact,
        imageUrlSnapshot: existing.imageUrl,
        audioUrlSnapshot: narrationUpdated ? null : existing.audioUrl,
      },
    });
    if (narrationUpdated) {
      enriched += 1;
      if (existing.audioUrl) audioReset += 1;
    }
  }
  return { enriched, audioReset };
}

async function main() {
  const expanded = await syncExpandedDestinations();
  const legacy = await enrichLegacyDestinations();
  const counts = await prisma.petTravelDestination.groupBy({
    by: ["tier"],
    where: { isEnabled: true },
    _count: { _all: true },
  });
  console.log("Pet destinations synchronized.", {
    expanded,
    legacy,
    counts: counts.map((item) => ({ tier: item.tier, count: item._count._all })),
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
