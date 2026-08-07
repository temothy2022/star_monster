import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { loadConfig } from "../src/config.js";
import { decryptSecret } from "../src/lib/secret-encryption.js";
import { generateMiniMaxSpeech } from "../src/services/minimax-media-generation-service.js";
import { storeGeneratedPoemMedia } from "../src/services/poem-media-service.js";

try {
  loadEnvFile(".env");
} catch {
  // Production can provide the same variables through the service environment.
}

const prisma = new PrismaClient();
const config = loadConfig();
const onlyMissing = !process.argv.includes("--force");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const stored = await prisma.systemMinimaxConfig.findUnique({ where: { id: "default" } });
  if (!stored?.enabled) {
    throw new Error("MiniMax is not configured or enabled in the super admin.");
  }

  const apiKey = decryptSecret(
    {
      ciphertext: stored.encryptedApiKey,
      iv: stored.encryptionIv,
      tag: stored.encryptionTag,
    },
    config.AI_CONFIG_ENCRYPTION_KEY,
  );
  const destinations = await prisma.petTravelDestination.findMany({
    where: onlyMissing ? { isEnabled: true, audioUrl: null } : { isEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  if (destinations.length === 0) {
    console.log("All pet destination audio files already exist.");
    return;
  }

  console.log(`Generating ${destinations.length} pet destination audio file(s)...`);
  const failures: string[] = [];
  for (const [index, destination] of destinations.entries()) {
    const text = [
      destination.name,
      `${destination.city}，${destination.country}。`,
      destination.introduction,
      `有趣的小知识：${destination.funFact}`,
    ].join("。")
      .replace(/。。+/g, "。")
      .trim();

    try {
      const audio = await generateMiniMaxSpeech({ apiKey, text, config });
      const storedAudio = await storeGeneratedPoemMedia({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        poemId: `pet-${destination.slug}`,
        kind: "audio",
        data: audio,
      });
      await prisma.petTravelDestination.update({
        where: { id: destination.id },
        data: { audioUrl: storedAudio.publicUrl },
      });
      console.log(`[${index + 1}/${destinations.length}] ${destination.name}: ${storedAudio.publicUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${destination.name}: ${message}`);
      console.error(`[${index + 1}/${destinations.length}] ${destination.name}: ${message}`);
    }

    if (index < destinations.length - 1) await pause(5_500);
  }

  if (failures.length > 0) {
    throw new Error(`Failed to generate ${failures.length} destination audio file(s):\n${failures.join("\n")}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
