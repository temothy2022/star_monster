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
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const stored = await prisma.systemMinimaxConfig.findUnique({ where: { id: "default" } });
  if (!stored?.enabled) {
    throw new Error("MiniMax is not configured or enabled in the super admin.");
  }

  const config = loadConfig();
  const apiKey = decryptSecret(
    {
      ciphertext: stored.encryptedApiKey,
      iv: stored.encryptionIv,
      tag: stored.encryptionTag,
    },
    config.AI_CONFIG_ENCRYPTION_KEY,
  );
  const dialogues = await prisma.mascotDialogue.findMany({
    where: {
      isEnabled: true,
      audioUrl: null,
      context: { startsWith: "PET_" },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  if (dialogues.length === 0) {
    console.log("All pet room dialogue audio files already exist.");
    return;
  }

  console.log(`Generating ${dialogues.length} pet room dialogue audio file(s)...`);
  const failures: string[] = [];
  for (const [index, dialogue] of dialogues.entries()) {
    try {
      const audio = await generateMiniMaxSpeech({ apiKey, text: dialogue.text, config });
      const storedAudio = await storeGeneratedPoemMedia({
        uploadDir: config.POEM_ASSET_UPLOAD_DIR,
        poemId: `mascot-${dialogue.key}`,
        kind: "audio",
        data: audio,
      });
      await prisma.mascotDialogue.update({
        where: { id: dialogue.id },
        data: { audioUrl: storedAudio.publicUrl },
      });
      console.log(`[${index + 1}/${dialogues.length}] ${dialogue.key}: ${storedAudio.publicUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${dialogue.key}: ${message}`);
      console.error(`[${index + 1}/${dialogues.length}] ${dialogue.key}: ${message}`);
    }

    if (index < dialogues.length - 1) await pause(5_500);
  }

  if (failures.length > 0) {
    throw new Error(`Failed to generate ${failures.length} pet room dialogue audio file(s):\n${failures.join("\n")}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
