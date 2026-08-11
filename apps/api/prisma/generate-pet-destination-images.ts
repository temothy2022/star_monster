import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { EXPANDED_PET_DESTINATIONS } from "./pet-destination-expansion.js";

const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/assets/static/pet-assets/v1/destinations/expanded",
);
const EXPECTED_WIDTH = 900;
const EXPECTED_HEIGHT = 675;

type InvalidAsset = {
  slug: string;
  reason: string;
};

async function validatePostcard(slug: string): Promise<InvalidAsset | null> {
  const filePath = path.join(OUTPUT_DIR, `${slug}.webp`);
  try {
    await access(filePath);
    const metadata = await sharp(filePath).metadata();
    if (metadata.format !== "webp") {
      return { slug, reason: `expected WebP, received ${metadata.format ?? "unknown"}` };
    }
    if (metadata.width !== EXPECTED_WIDTH || metadata.height !== EXPECTED_HEIGHT) {
      return {
        slug,
        reason: `expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}, received ${metadata.width ?? "?"}x${metadata.height ?? "?"}`,
      };
    }
    return null;
  } catch (error) {
    return {
      slug,
      reason: error instanceof Error ? error.message : "missing or unreadable file",
    };
  }
}

async function main() {
  const invalidAssets = (
    await Promise.all(EXPANDED_PET_DESTINATIONS.map((destination) => validatePostcard(destination.slug)))
  ).filter((item): item is InvalidAsset => item !== null);

  if (invalidAssets.length > 0) {
    const details = invalidAssets
      .slice(0, 20)
      .map((item) => `- ${item.slug}: ${item.reason}`)
      .join("\n");
    const remaining = invalidAssets.length > 20 ? `\n- ...and ${invalidAssets.length - 20} more` : "";
    throw new Error(
      `Destination postcard validation failed (${invalidAssets.length}/${EXPANDED_PET_DESTINATIONS.length}).\n${details}${remaining}\n` +
      "Regenerate the listed assets with the approved image-generation workflow before publishing.",
    );
  }

  console.log(
    `Destination postcard images validated: ${EXPANDED_PET_DESTINATIONS.length} WebP files at ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}.`,
  );
}

await main();
