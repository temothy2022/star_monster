import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SAMPLE_CHARACTERS = [
  {
    id: "hanzi-shan",
    character: "山",
    pinyin: "shān",
    meaning: "高高的大山",
    imageDescription: "a tall rounded mountain with soft clouds and a warm sunrise, no markings on the mountain",
    sentence: "我们一起爬上了高山。",
    words: ["山顶", "山水", "高山"],
  },
  {
    id: "hanzi-shui",
    character: "水",
    pinyin: "shuǐ",
    meaning: "流动的水",
    imageDescription: "clear flowing water with small fish and soft ripples in a gentle stream",
    sentence: "小鱼在水里游来游去。",
    words: ["河水", "水杯", "雨水"],
  },
  {
    id: "hanzi-huo",
    character: "火",
    pinyin: "huǒ",
    meaning: "暖暖的火焰",
    imageDescription: "a safe cozy fireplace flame glowing warmly in a simple child-friendly room, no danger",
    sentence: "冬天的火炉真暖和。",
    words: ["火苗", "火车", "大火"],
  },
  {
    id: "hanzi-mu",
    character: "木",
    pinyin: "mù",
    meaning: "一棵大树",
    imageDescription: "a friendly big tree with rounded leaves in a simple forest scene",
    sentence: "森林里有很多树木。",
    words: ["木头", "树木", "木马"],
  },
  {
    id: "hanzi-ren",
    character: "人",
    pinyin: "rén",
    meaning: "站立的人",
    imageDescription: "a simple cheerful child standing and waving in a park, no text on clothes or objects",
    sentence: "公园里有很多人。",
    words: ["大人", "人们", "主人"],
  },
];

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  console.error("Missing MINIMAX_API_KEY.");
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
const outputDir = path.resolve(args.output ?? "outputs/hanzi-assets-sample");
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

async function loadCharacters(input) {
  if (!input) return SAMPLE_CHARACTERS;
  const source = JSON.parse(await readFile(path.resolve(input), "utf8"));
  if (!Array.isArray(source)) {
    throw new Error("Input JSON must be an array of hanzi character objects.");
  }
  return source.map((item, index) => normalizeCharacter(item, index));
}

function normalizeCharacter(item, index) {
  if (!item.character || !item.meaning || !item.sentence) {
    throw new Error(`Character item ${index} must include character, meaning, and sentence.`);
  }
  return {
    id: item.id || `hanzi-${slugify(item.character)}`,
    character: String(item.character),
    pinyin: item.pinyin ? String(item.pinyin) : "",
    meaning: String(item.meaning),
    imageDescription: item.imageDescription ? String(item.imageDescription) : "",
    sentence: String(item.sentence).replaceAll("__", String(item.character)),
    words: Array.isArray(item.words) ? item.words.map(String).filter(Boolean) : [],
  };
}

function slugify(value) {
  return Array.from(String(value))
    .map((char) => char.codePointAt(0)?.toString(16) ?? "x")
    .join("-");
}

function safeFilePart(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_");
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

async function generateImages(item, itemDir) {
  const files = [];
  for (let index = 1; index <= imageCandidates; index += 1) {
    const suffix = imageCandidates === 1 ? "" : `-candidate-${index}`;
    const file = path.join(itemDir, `${item.id}${suffix}.jpeg`);
    if (!overwrite && await fileExists(file)) {
      files.push(file);
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
    files.push(file);
  }
  return files;
}

async function generateSpeech(text, file) {
  if (!overwrite && await fileExists(file)) {
    return { file, skipped: true, usageCharacters: text.length, audioSize: null };
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
    pronunciation_dict: {
      tone: [],
    },
    subtitle_enable: false,
  });
  const hex = json.data?.audio;
  if (!hex) {
    throw new Error(`Speech response missing audio for ${text}`);
  }
  await writeFile(file, Buffer.from(hex, "hex"));
  return {
    file,
    usageCharacters: json.extra_info?.usage_characters ?? text.length,
    audioSize: json.extra_info?.audio_size ?? null,
  };
}

await mkdir(outputDir, { recursive: true });

const manifest = [];
for (const [index, item] of batch.entries()) {
  const itemDir = path.join(outputDir, item.id);
  await mkdir(itemDir, { recursive: true });
  console.log(`[${start + index + 1}/${characters.length}] Generating ${item.character}...`);

  const images = only === "audio" ? [] : await generateImages(item, itemDir);
  const characterAudio = only === "image"
    ? null
    : await generateSpeech(item.character, path.join(itemDir, `${item.id}-character.mp3`));
  const sentenceAudio = only === "image"
    ? null
    : await generateSpeech(item.sentence, path.join(itemDir, `${item.id}-sentence.mp3`));
  const wordAudio = [];
  if (only !== "image") {
    for (const word of item.words) {
      wordAudio.push(await generateSpeech(word, path.join(itemDir, `${item.id}-word-${safeFilePart(word)}.mp3`)));
    }
  }

  manifest.push({
    ...item,
    imageFiles: images,
    imageFile: images[0] ?? null,
    characterAudio,
    sentenceAudio,
    wordAudio,
  });
}

const manifestFile = path.join(outputDir, "manifest.json");
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Done. Manifest: ${manifestFile}`);
