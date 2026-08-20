import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const imageDir = path.resolve(String(args.images || "/Users/qing/Downloads/直映识字/ocr_images_vl_20260820_webp"));
const sourceFile = path.resolve(String(args.source || "work/hanzi-assets-input.json"));
const existingManifestFile = path.resolve(String(args["existing-manifest"] || "packages/assets/generated/hanzi-assets/manifest.json"));
const newContentFile = path.resolve(String(args["new-content"] || "work/hanzi-replacement-20260820/missing-content.json"));
const outputRoot = path.resolve(String(args.output || "work/hanzi-replacement-20260820"));
const existingAssets = path.resolve(String(args["existing-assets"] || "packages/assets/generated/hanzi-assets"));
const newAudioAssets = args["audio-assets"] ? path.resolve(String(args["audio-assets"])) : "";
const publicBaseUrl = String(args["public-base-url"] || "https://timothy.run/hanzi-assets/v1").replace(/\/+$/, "");
const planOnly = Boolean(args.plan);

const source = JSON.parse(await readFile(sourceFile, "utf8"));
const existingManifest = JSON.parse(await readFile(existingManifestFile, "utf8"));
const imageFiles = (await readdir(imageDir)).filter((file) => file.toLowerCase().endsWith(".webp"));
const chosenImages = chooseImages(imageFiles);
const sourceByCharacter = new Map(source.map((item) => [item.character, item]));
const existingByCharacter = new Map(existingManifest.map((item) => [item.character, item]));
const newCharacters = [...chosenImages.keys()].filter((character) => !existingByCharacter.has(character));
const oldCharactersWithoutNewImage = [...existingByCharacter.keys()].filter((character) => !chosenImages.has(character));
const duplicateNames = imageFiles.filter((file) => /_\d+\.webp$/u.test(file));

const plan = {
  imageFiles: imageFiles.length,
  validSingleCharacterImages: chosenImages.size,
  duplicateNames,
  existingCharacters: existingByCharacter.size,
 matchedExistingCharacters: [...chosenImages.keys()].filter((character) => existingByCharacter.has(character)).length,
 newCharacters: newCharacters.length,
 oldCharactersWithoutNewImage: oldCharactersWithoutNewImage.length,
 newCharactersSample: newCharacters.slice(0, 30),
 oldCharactersWithoutNewImageSample: oldCharactersWithoutNewImage.slice(0, 30),
  outputRoot,
};

if (args["write-missing"]) {
  const maxSortOrder = Math.max(0, ...existingManifest.map((item) => Number(item.sortOrder) || 0));
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, "missing-characters.json"),
    `${JSON.stringify(newCharacters.map((character, index) => ({
      id: `hanzi-u${character.codePointAt(0).toString(16)}`,
      character,
      sortOrder: maxSortOrder + (index + 1) * 10,
      isEnabled: true,
    })), null, 2)}\n`,
  );
  plan.missingCharactersFile = path.join(outputRoot, "missing-characters.json");
}

if (planOnly) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (args["images-only"]) {
  const imagesOnlyRoot = path.join(outputRoot, "images-only");
  await mkdir(imagesOnlyRoot, { recursive: true });
  const entries = [];
  for (const oldEntry of existingManifest) {
    const newImage = chosenImages.get(oldEntry.character);
    if (!newImage) continue;
    const relativeExistingImage = relativeAssetPathFromUrl(oldEntry.imageKey, publicBaseUrl);
    const targetDir = relativeExistingImage ? path.dirname(relativeExistingImage) : `replacement-${oldEntry.id}`;
    const targetFile = path.join(targetDir, "image-ocr-20260820.webp");
    await copyImage(path.join(imageDir, newImage), path.join(imagesOnlyRoot, targetFile));
    entries.push(normalizeImportEntry({
      ...oldEntry,
      imageKey: `${publicBaseUrl}/${targetFile}`,
    }));
  }
  const manifestFile = path.join(outputRoot, "manifest.images-only.json");
  await writeFile(manifestFile, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, entries: entries.length, manifestFile, assets: imagesOnlyRoot }, null, 2));
  process.exit(0);
}

const newContent = await readJsonIfExists(newContentFile, []);
const newContentByCharacter = new Map(newContent.map((item) => [item.character, item]));
const missingContent = newCharacters.filter((character) => !newContentByCharacter.has(character));
if (missingContent.length) {
  throw new Error(`Missing generated content for ${missingContent.length} characters. Run generate-hanzi-missing-content.mjs first; sample: ${missingContent.slice(0, 20).join("")}`);
}

const outputAssets = path.join(outputRoot, "assets");
await mkdir(outputRoot, { recursive: true });
await cp(existingAssets, outputAssets, { recursive: true, force: true });
if (newAudioAssets) {
  await cp(newAudioAssets, outputAssets, { recursive: true, force: true });
}

const entries = [];
for (const oldEntry of existingManifest) {
  const item = sourceByCharacter.get(oldEntry.character) || oldEntry;
  const entry = { ...oldEntry, ...item };
  const newImage = chosenImages.get(oldEntry.character);
  if (newImage) {
    const relativeExistingImage = relativeAssetPathFromUrl(oldEntry.imageKey, publicBaseUrl);
    const targetDir = relativeExistingImage ? path.dirname(relativeExistingImage) : `replacement-${oldEntry.id}`;
    const targetFile = path.join(targetDir, "image-ocr-20260820.webp");
    await copyImage(path.join(imageDir, newImage), path.join(outputAssets, targetFile));
    entry.imageKey = `${publicBaseUrl}/${targetFile}`;
  }
  entries.push(normalizeImportEntry(entry));
}

const maxSortOrder = Math.max(0, ...existingManifest.map((item) => Number(item.sortOrder) || 0));
for (const [index, character] of newCharacters.entries()) {
  const item = newContentByCharacter.get(character);
  const sortOrder = maxSortOrder + (index + 1) * 10;
  const id = item.id || `hanzi-u${character.codePointAt(0).toString(16)}`;
  const directory = `${String(sortOrder).padStart(5, "0")}-${safeFilePart(id)}`;
  const imageFile = "image-ocr-20260820.webp";
  await copyImage(path.join(imageDir, chosenImages.get(character)), path.join(outputAssets, directory, imageFile));
  const audioDirectory = path.join(outputAssets, directory);
  const audioFiles = await readdirIfExists(audioDirectory);
  const entry = {
    ...item,
    id,
    sortOrder,
    imageKey: `${publicBaseUrl}/${directory}/${imageFile}`,
    characterAudioUrl: audioFiles.includes("character.mp3") ? `${publicBaseUrl}/${directory}/character.mp3` : null,
    sentenceAudioUrl: audioFiles.includes("sentence.mp3") ? `${publicBaseUrl}/${directory}/sentence.mp3` : null,
    wordAudioUrls: item.words.map((_, wordIndex) => {
      const file = `word-${String(wordIndex + 1).padStart(2, "0")}-${safeFilePart(item.words[wordIndex])}.mp3`;
      return audioFiles.includes(file) ? `${publicBaseUrl}/${directory}/${file}` : "";
    }),
  };
  if (!entry.characterAudioUrl || !entry.sentenceAudioUrl || entry.wordAudioUrls.some((url) => !url)) {
    throw new Error(`Missing audio for new character ${character}. Generate audio into ${audioDirectory} before staging.`);
  }
  entries.push(normalizeImportEntry(entry));
}

entries.sort((a, b) => a.sortOrder - b.sortOrder || a.character.localeCompare(b.character));
const manifestFile = path.join(outputRoot, "manifest.json");
await writeFile(manifestFile, `${JSON.stringify(entries, null, 2)}\n`);
await writeFile(path.join(outputRoot, "plan.json"), `${JSON.stringify({ ...plan, entries: entries.length, manifestFile }, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, entries: entries.length, manifestFile, assets: outputAssets }, null, 2));

function chooseImages(files) {
  const chosen = new Map();
  for (const file of files) {
    const base = file.replace(/\.webp$/iu, "");
    const match = base.match(/^(\p{Script=Han})(?:_\d+)?$/u);
    if (!match) continue;
    const character = match[1];
    if (!chosen.has(character) || !/_\d+\.webp$/u.test(file)) chosen.set(character, file);
  }
  return chosen;
}

function normalizeImportEntry(entry) {
  const character = String(entry.character || "").trim();
  const words = Array.isArray(entry.words) ? entry.words.map(String) : [];
  const sentence = String(entry.sentence || "").includes("__") ? entry.sentence : String(entry.sentence || "").replace(character, "__");
  const characterAudioUrl = entry.characterAudioUrl || entry.characterAudio?.url || null;
  const sentenceAudioUrl = entry.sentenceAudioUrl || entry.sentenceAudio?.url || null;
  const wordAudioUrls = Array.isArray(entry.wordAudioUrls) && entry.wordAudioUrls.length === words.length
    ? entry.wordAudioUrls
    : (entry.wordAudio || []).map((audio) => audio.url).filter(Boolean);
  if (!character || !String(entry.internalPinyin || entry.pinyin || "") || words.length !== 3 || wordAudioUrls.length !== 3 || !characterAudioUrl || !sentenceAudioUrl) {
    throw new Error(`Import entry is incomplete for ${character || "unknown"}.`);
  }
  return {
    id: entry.id,
    character,
    pinyin: entry.pinyin || entry.internalPinyin,
    internalPinyin: entry.internalPinyin || entry.pinyin,
    meaning: entry.meaning || "",
    shapeHint: entry.shapeHint || "",
    sentence,
    words,
    wordAudioUrls,
    imageKey: entry.imageKey || "default-hanzi",
    characterAudioUrl,
    sentenceAudioUrl,
    sortOrder: Number(entry.sortOrder) || 0,
    isEnabled: entry.isEnabled !== false,
  };
}

function relativeAssetPathFromUrl(value, baseUrl) {
  const text = String(value || "");
  if (!text || text === "default-hanzi") return "";
  const prefix = `${baseUrl}/`;
  if (text.startsWith(prefix)) return decodeURIComponent(text.slice(prefix.length));
  return "";
}

function safeFilePart(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "-");
}

async function copyImage(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { force: true });
}

async function readdirIfExists(directory) {
  try { return await readdir(directory); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}

async function readJsonIfExists(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else { parsed[key] = next; index += 1; }
  }
  return parsed;
}
