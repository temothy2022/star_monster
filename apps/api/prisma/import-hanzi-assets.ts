import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";

try {
  loadEnvFile(".env");
} catch {
  // Production reads DATABASE_URL from the service environment.
}

const prisma = new PrismaClient();
const args = parseArgs(process.argv.slice(2));
const manifestFile = args.manifest;
const publicBaseUrl = normalizeBaseUrl(args["public-base-url"] ?? process.env.HANZI_ASSET_PUBLIC_BASE_URL ?? "");
const dryRun = Boolean(args["dry-run"]);
const allowMissingMedia = Boolean(args["allow-missing-media"]);

if (!manifestFile) {
  console.error("Missing --manifest. Example: pnpm --filter @star-monsters/api exec tsx prisma/import-hanzi-assets.ts --manifest outputs/hanzi-assets/manifest.json --public-base-url https://timothy.run/hanzi-assets/v1");
  process.exit(1);
}

function parseArgs(values: string[]) {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function normalizeBaseUrl(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveInputFile(value: string) {
  if (path.isAbsolute(value)) return value;
  const local = path.resolve(value);
  if (existsSync(local)) return local;
  const repoRootRelative = path.resolve("../..", value);
  if (existsSync(repoRootRelative)) return repoRootRelative;
  return local;
}

function fullUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return publicBaseUrl ? `${publicBaseUrl}/${text.replace(/^\/+/, "")}` : text;
}

function sentenceWithMarker(sentence: string, character: string) {
  if (sentence.includes("__")) return sentence;
  if (sentence.includes(character)) return sentence.replace(character, "__");
  throw new Error(`Sentence for ${character} must contain the character or __ marker.`);
}

function normalizeEntry(entry: Record<string, unknown>, index: number) {
  const character = String(entry.character || "").trim();
  if (!character) throw new Error(`Manifest item ${index} is missing character.`);
  const internalPinyin = String(entry.internalPinyin || entry.pinyin || "").trim();
  const sentence = sentenceWithMarker(String(entry.sentence || "").trim(), character);
  const words = Array.isArray(entry.words)
    ? entry.words.map((word) => String(word).trim()).filter(Boolean)
    : [];
  const wordAudioUrls = Array.isArray(entry.wordAudioUrls)
    ? entry.wordAudioUrls.map(fullUrl).filter(Boolean)
    : Array.isArray(entry.wordAudio)
      ? entry.wordAudio.map((item) => fullUrl((item as { url?: unknown; relativePath?: unknown }).url ?? (item as { relativePath?: unknown }).relativePath)).filter(Boolean)
      : [];
  if (!internalPinyin || internalPinyin === "待补") {
    throw new Error(`Manifest item ${character} has invalid pinyin.`);
  }
  if (words.length !== 3 || new Set(words).size !== 3) {
    throw new Error(`Manifest item ${character} must have exactly 3 distinct words.`);
  }
  if (words.some((word) => !word.includes(character))) {
    throw new Error(`Manifest item ${character} contains a word without the character.`);
  }
  if (
    (!allowMissingMedia && wordAudioUrls.length !== words.length) ||
    (allowMissingMedia && wordAudioUrls.length > 0 && wordAudioUrls.length !== words.length)
  ) {
    throw new Error(`Manifest item ${character} has ${words.length} words but ${wordAudioUrls.length} word audio URLs.`);
  }
  if (sentence === `我们来认识__。`) {
    throw new Error(`Manifest item ${character} still uses the generic sentence.`);
  }
  const sentenceAudioUrl = fullUrl((entry.sentenceAudio as { url?: unknown } | null)?.url || entry.sentenceAudioUrl) || null;
  if (!allowMissingMedia && !sentenceAudioUrl) {
    throw new Error(`Manifest item ${character} is missing sentence audio.`);
  }
  return {
    id: String(entry.id || `hanzi-u${character.codePointAt(0)?.toString(16) ?? index}`),
    character,
    internalPinyin,
    meaning: String(entry.meaning || "").trim(),
    shapeHint: String(entry.shapeHint || "").trim(),
    sentence,
    words,
    wordAudioUrls,
    imageKey: fullUrl(entry.imageKey || entry.imageUrl) || "default-hanzi",
    characterAudioUrl: fullUrl((entry.characterAudio as { url?: unknown } | null)?.url || entry.characterAudioUrl) || null,
    sentenceAudioUrl,
    sortOrder: Number.isInteger(Number(entry.sortOrder)) ? Number(entry.sortOrder) : (index + 1) * 10,
    isEnabled: entry.isEnabled !== false,
  };
}

const raw = JSON.parse(await readFile(resolveInputFile(String(manifestFile)), "utf8"));
if (!Array.isArray(raw)) throw new Error("Manifest must be a JSON array.");
const entries = raw.map(normalizeEntry);

console.log(
  `Ready to import ${entries.length} hanzi entries${dryRun ? " (dry run)" : ""}` +
    `${allowMissingMedia ? " (missing media allowed)" : ""}.`,
);
if (!dryRun) {
  for (const entry of entries) {
    await prisma.hanziCharacter.upsert({
      where: { character: entry.character },
      update: {
        internalPinyin: entry.internalPinyin,
        meaning: entry.meaning,
        shapeHint: entry.shapeHint,
        sentence: entry.sentence,
        words: entry.words,
        wordAudioUrls: entry.wordAudioUrls,
        imageKey: entry.imageKey || "default-hanzi",
        characterAudioUrl: entry.characterAudioUrl,
        sentenceAudioUrl: entry.sentenceAudioUrl,
        sortOrder: entry.sortOrder,
        isEnabled: entry.isEnabled,
      },
      create: entry,
    });
  }
}

const importedCount = dryRun ? 0 : await prisma.hanziCharacter.count({ where: { character: { in: entries.map((entry) => entry.character) } } });
console.log(JSON.stringify({ ok: true, dryRun, entries: entries.length, importedCount }, null, 2));
await prisma.$disconnect();
