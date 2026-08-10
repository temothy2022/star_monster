import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  EXPANDED_PET_DESTINATIONS,
  LEGACY_DESTINATION_EXPLORATION_PROMPTS,
  LEGACY_POSTCARD_CLOSING,
} from "../prisma/pet-destination-expansion.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("pet destination expansion catalog", () => {
  it("adds exactly 50 destinations to each travel tier", () => {
    const tierCounts = new Map<string, number>();
    for (const destination of EXPANDED_PET_DESTINATIONS) {
      tierCounts.set(destination.tier, (tierCounts.get(destination.tier) ?? 0) + 1);
    }
    expect(tierCounts).toEqual(new Map([
      ["NEARBY", 50],
      ["CHINA", 50],
      ["WORLD", 50],
    ]));
  });

  it("keeps ids, slugs and postcard images unique with child-friendly long copy", () => {
    expect(new Set(EXPANDED_PET_DESTINATIONS.map((item) => item.id)).size).toBe(150);
    expect(new Set(EXPANDED_PET_DESTINATIONS.map((item) => item.slug)).size).toBe(150);
    expect(new Set(EXPANDED_PET_DESTINATIONS.map((item) => item.imageUrl)).size).toBe(150);
    for (const destination of EXPANDED_PET_DESTINATIONS) {
      expect(destination.introduction.length, destination.name).toBeGreaterThanOrEqual(85);
      expect(destination.funFact.length, destination.name).toBeGreaterThanOrEqual(25);
      expect(destination.imageUrl).toBe(`/pet-assets/v1/destinations/expanded/${destination.slug}.webp`);
      expect(existsSync(path.join(repoRoot, "packages/assets/static", destination.imageUrl))).toBe(true);
    }
  });

  it("prepares every existing destination for a richer narration", () => {
    expect(Object.keys(LEGACY_DESTINATION_EXPLORATION_PROMPTS)).toHaveLength(32);
    for (const prompt of Object.values(LEGACY_DESTINATION_EXPLORATION_PROMPTS)) {
      expect(prompt.length).toBeGreaterThanOrEqual(35);
    }
    expect(LEGACY_POSTCARD_CLOSING.length).toBeGreaterThanOrEqual(35);
  });

  it("generates optimized 900 by 675 WebP postcards", async () => {
    const samples = [
      EXPANDED_PET_DESTINATIONS[0],
      EXPANDED_PET_DESTINATIONS[49],
      EXPANDED_PET_DESTINATIONS[50],
      EXPANDED_PET_DESTINATIONS[99],
      EXPANDED_PET_DESTINATIONS[100],
      EXPANDED_PET_DESTINATIONS[149],
    ];
    for (const destination of samples) {
      expect(destination).toBeDefined();
      const metadata = await sharp(path.join(repoRoot, "packages/assets/static", destination!.imageUrl)).metadata();
      expect(metadata).toMatchObject({ width: 900, height: 675, format: "webp" });
    }
  });
});
