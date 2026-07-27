import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SAMPLE_CHARACTERS = [
  {
    id: "hanzi-shan",
    character: "山",
    pinyin: "shān",
    meaning: "高高的大山",
    shapeHint: "像三座山峰连在一起",
    imageDescription: "a tall rounded mountain with soft clouds and a warm sunrise, no markings on the mountain",
    sentence: "我们一起爬上了高__。",
    words: ["山顶", "山水", "高山"],
    sortOrder: 10,
  },
  {
    id: "hanzi-shui",
    character: "水",
    pinyin: "shuǐ",
    meaning: "流动的水",
    shapeHint: "像水流向两边散开",
    imageDescription: "clear flowing water with small fish and soft ripples in a gentle stream",
    sentence: "小鱼在__里游来游去。",
    words: ["河水", "水杯", "雨水"],
    sortOrder: 20,
  },
];

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  console.error("Missing MINIMAX_API_KEY. Run: export MINIMAX_API_KEY='你的密钥'");
  process.exit(1);
}

const imageEndpoints = [
  "https://api.minimaxi.com/v1/image_generation",
  "https://api.minimax.io/v1/image_generation",
];
const speechEndpoints = [
  "https://api.minimaxi.com/v1/t2a_v2",
  "https://api.minimax.io/v1/t2a_v2",
];

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.output ?? "outputs/hanzi-assets");
const publicBaseUrl = normalizeBaseUrl(args["public-base-url"] ?? process.env.HANZI_ASSET_PUBLIC_BASE_URL ?? "");
const imageCandidates = Number(args["image-candidates"] ?? 1);
const overwrite = Boolean(args.overwrite);
const only = String(args.only ?? "all");
const characters = await loadCharacters(args.input);
const start = Number(args.offset ?? 0);
const limit = args.limit === undefined ? characters.length : Number(args.limit);
const batch = characters.slice(start, start + limit);

if (!["all", "image", "audio"].includes(only)) {
  throw new Error(`Invalid --only value: ${only}. Use all, image, or audio.`);
}
if (!Number.isInteger(imageCandidates) || imageCandidates < 1 || imageCandidates > 4) {
  throw new Error("--image-candidates must be an integer from 1 to 4.");
}
if (!Number.isInteger(start) || start < 0) {
  throw new Error("--offset must be a non-negative integer.");
}
if (!Number.isInteger(limit) || limit < 1) {
  throw new Error("--limit must be a positive integer.");
}

function parseArgs(values) {
  const parsed = {};
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

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  return text ? text.replace(/\/+$/, "") : "";
}

async function loadCharacters(input) {
  if (!input) return SAMPLE_CHARACTERS.map(normalizeCharacter);
  const source = JSON.parse(await readFile(path.resolve(input), "utf8"));
  if (!Array.isArray(source)) {
    throw new Error("Input JSON must be an array of hanzi character objects.");
  }
  return source.map(normalizeCharacter);
}

function normalizeCharacter(item, index = 0) {
  const character = String(item.character ?? "").trim();
  const sentence = String(item.sentence ?? "").trim();
  const words = Array.isArray(item.words) ? item.words.map((word) => String(word).trim()).filter(Boolean) : [];
  const missing = [];
  if (!character) missing.push("character");
  if (!item.pinyin) missing.push("pinyin");
  if (!item.meaning) missing.push("meaning");
  if (!item.shapeHint) missing.push("shapeHint");
  if (!item.imageDescription) missing.push("imageDescription");
  if (!sentence) missing.push("sentence");
  if (!words.length) missing.push("words");
  if (missing.length) {
    throw new Error(`Character item ${index} is missing: ${missing.join(", ")}`);
  }
  return {
    id: String(item.id || `hanzi-u${character.codePointAt(0)?.toString(16) ?? index}`).trim(),
    character,
    pinyin: String(item.pinyin).trim(),
    meaning: String(item.meaning).trim(),
    shapeHint: String(item.shapeHint).trim(),
    imageDescription: String(item.imageDescription).trim(),
    sentence: sentenceWithMarker(sentence, character),
    spokenSentence: sentence.replaceAll("__", character),
    words,
    sortOrder: Number.isInteger(Number(item.sortOrder)) ? Number(item.sortOrder) : (index + 1) * 10,
    isEnabled: item.isEnabled !== false,
  };
}

function sentenceWithMarker(sentence, character) {
  if (sentence.includes("__")) return sentence;
  if (sentence.includes(character)) return sentence.replace(character, "__");
  throw new Error(`Sentence must contain ${character} or __ marker: ${sentence}`);
}

function safeFilePart(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "-");
}

function dirName(item) {
  const order = String(item.sortOrder).padStart(5, "0");
  return `${order}-${safeFilePart(item.id)}`;
}

function imagePrompt(item) {
  const scene = item.imageDescription || item.meaning;
  return [
    "Create a pure 1:1 square semantic illustration for a 5-year-old child's Chinese learning app.",
    `Illustrate this concept only through objects and scene: ${scene}.`,
    "Absolutely no text of any kind. No Chinese characters. No letters. No numbers. No pinyin. No inscriptions. No marks that resemble writing.",
    "Do not draw signs, labels, books, worksheets, flashcards, posters, screens, UI panels, logo marks, stamps, seals, speech bubbles, clothes with symbols, wall writing, carved marks, or decorative glyphs.",
    "All object surfaces must be plain and clean. If there is a mountain, tree, cup, wall, clothing, paper, or object, it must have no symbols or writing on it.",
    "Visual style: warm children's picture-book illustration, soft cream background, rounded cute shapes, subtle paper grain texture, clean edges, low complexity, bright but not oversaturated, consistent with a playful iPad app.",
    "Composition: one clear centered subject or one very simple scene, simple background, easy for a child to understand. Keep the full subject completely inside the frame, centered, with 18% to 24% empty safe margin on all four sides. Do not let the subject touch or cross the image edges.",
    "Negative prompt: text, Chinese text, English text, letters, numbers, pinyin, subtitles, handwriting, calligraphy, typography, signboard, book page, worksheet, flashcard, UI, icon label, logo, watermark, stamp, seal, symbol, inscription, mark, glyph, distorted text, gibberish text, pseudo text.",
  ].join(" ");
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${url} returned non-JSON ${response.status}: ${text.slice(0, 400)}`);
  }
  if (!response.ok || json.base_resp?.status_code !== 0) {
    throw new Error(`${url} failed ${response.status}: ${JSON.stringify(json).slice(0, 800)}`);
  }
  return json;
}

async function postJsonWithFallback(urls, payload) {
  const errors = [];
  for (const url of urls) {
    try {
      return await postJson(url, payload);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("\n"));
}

function relativeAssetPath(item, fileName) {
  return `${dirName(item)}/${fileName}`;
}

function publicUrl(relativePath) {
  return publicBaseUrl ? `${publicBaseUrl}/${relativePath}` : relativePath;
}

async function generateImages(item, itemDir) {
  const files = [];
  for (let index = 1; index <= imageCandidates; index += 1) {
    const fileName = imageCandidates === 1 ? "image.jpeg" : `image-candidate-${index}.jpeg`;
    const file = path.join(itemDir, fileName);
    if (!overwrite && await fileExists(file)) {
      files.push({ file, relativePath: relativeAssetPath(item, fileName), skipped: true });
      continue;
    }
    const json = await postJsonWithFallback(imageEndpoints, {
      model: "image-01",
      prompt: imagePrompt(item),
      aspect_ratio: "1:1",
      response_format: "base64",
      n: 1,
      prompt_optimizer: false,
    });
    const encoded = json.data?.image_base64?.[0];
    if (!encoded) {
      throw new Error(`Image response missing image_base64 for ${item.character}`);
    }
    await writeFile(file, Buffer.from(encoded, "base64"));
    files.push({ file, relativePath: relativeAssetPath(item, fileName), skipped: false });
  }
  return files;
}

async function generateSpeech(text, file, relativePath) {
  if (!overwrite && await fileExists(file)) {
    return { file, relativePath, url: publicUrl(relativePath), skipped: true, usageCharacters: text.length, audioSize: null };
  }
  const json = await postJsonWithFallback(speechEndpoints, {
    model: "speech-2.8-turbo",
    text,
    stream: false,
    language_boost: "Chinese",
    output_format: "hex",
    voice_setting: {
      voice_id: "female-shaonv",
      speed: 0.9,
      vol: 1,
      pitch: 0,
      emotion: "happy",
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
    pronunciation_dict: { tone: [] },
    subtitle_enable: false,
  });
  const hex = json.data?.audio;
  if (!hex) {
    throw new Error(`Speech response missing audio for ${text}`);
  }
  await writeFile(file, Buffer.from(hex, "hex"));
  return {
    file,
    relativePath,
    url: publicUrl(relativePath),
    usageCharacters: json.extra_info?.usage_characters ?? text.length,
    audioSize: json.extra_info?.audio_size ?? null,
  };
}

await mkdir(outputDir, { recursive: true });

const manifest = [];
for (const [index, item] of batch.entries()) {
  const itemDir = path.join(outputDir, dirName(item));
  await mkdir(itemDir, { recursive: true });
  console.log(`[${start + index + 1}/${characters.length}] Generating ${item.character} (${item.id})...`);

  const images = only === "audio" ? [] : await generateImages(item, itemDir);
  const characterAudio = only === "image"
    ? null
    : await generateSpeech(item.character, path.join(itemDir, "character.mp3"), relativeAssetPath(item, "character.mp3"));
  const sentenceAudio = only === "image"
    ? null
    : await generateSpeech(item.spokenSentence, path.join(itemDir, "sentence.mp3"), relativeAssetPath(item, "sentence.mp3"));
  const wordAudio = [];
  if (only !== "image") {
    for (const [wordIndex, word] of item.words.entries()) {
      const fileName = `word-${String(wordIndex + 1).padStart(2, "0")}-${safeFilePart(word)}.mp3`;
      wordAudio.push(await generateSpeech(word, path.join(itemDir, fileName), relativeAssetPath(item, fileName)));
    }
  }

  manifest.push({
    id: item.id,
    character: item.character,
    pinyin: item.pinyin,
    internalPinyin: item.pinyin,
    meaning: item.meaning,
    shapeHint: item.shapeHint,
    imageDescription: item.imageDescription,
    sentence: item.sentence,
    spokenSentence: item.spokenSentence,
    words: item.words,
    sortOrder: item.sortOrder,
    isEnabled: item.isEnabled,
    imageFiles: images.map((image) => ({ ...image, url: publicUrl(image.relativePath) })),
    imageFile: images[0]?.file ?? null,
    imageUrl: images[0] ? publicUrl(images[0].relativePath) : null,
    imageKey: images[0] ? publicUrl(images[0].relativePath) : "default-hanzi",
    characterAudio,
    sentenceAudio,
    wordAudio,
    wordAudioUrls: wordAudio.map((audio) => audio.url),
  });
}

const manifestFile = path.join(outputDir, "manifest.json");
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Done. Manifest: ${manifestFile}`);
