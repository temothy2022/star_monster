import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

const apiKey = normalizeApiKey(process.env.MINIMAX_API_KEY);
const offlineRequested = process.argv.includes("--validate-only") || process.argv.includes("--plan");
if (!apiKey && !offlineRequested) {
  console.error("Missing MINIMAX_API_KEY. Run: export MINIMAX_API_KEY='你的密钥'");
  process.exit(1);
}
if (apiKey && !isHeaderSafeValue(apiKey)) {
  console.error(
    "MINIMAX_API_KEY contains spaces, newlines, or non-ASCII characters. "
      + "Run export MINIMAX_API_KEY='sk-api-...' again with only the key value.",
  );
  process.exit(1);
}

const imageEndpoints = [
  process.env.MINIMAX_IMAGE_ENDPOINT,
  "https://api.minimaxi.com/v1/image_generation",
].filter(Boolean);
const speechEndpoints = [
  process.env.MINIMAX_SPEECH_ENDPOINT,
  "https://api.minimaxi.com/v1/t2a_v2",
].filter(Boolean);

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.output ?? "packages/assets/generated/hanzi-assets");
const publicBaseUrl = normalizeBaseUrl(args["public-base-url"] ?? process.env.HANZI_ASSET_PUBLIC_BASE_URL ?? "");
const imageCandidates = Number(args["image-candidates"] ?? 1);
const overwrite = Boolean(args.overwrite);
const repairContent = Boolean(args["repair-content"]);
const validateOnly = Boolean(args["validate-only"]);
const planOnly = Boolean(args.plan);
const concurrency = Number(args.concurrency ?? 4);
const requestRetries = Number(args.retries ?? 3);
const speechRpm = Number(args["speech-rpm"] ?? 18);
const imageRpm = Number(args["image-rpm"] ?? 9);
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
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error("--concurrency must be an integer from 1 to 8.");
}
if (!Number.isInteger(requestRetries) || requestRetries < 0 || requestRetries > 6) {
  throw new Error("--retries must be an integer from 0 to 6.");
}
if (!Number.isInteger(speechRpm) || speechRpm < 1 || speechRpm > 20) {
  throw new Error("--speech-rpm must be an integer from 1 to 20.");
}
if (!Number.isInteger(imageRpm) || imageRpm < 1 || imageRpm > 10) {
  throw new Error("--image-rpm must be an integer from 1 to 10.");
}
if (repairContent && only !== "all") {
  throw new Error("--repair-content cannot be combined with --only. It automatically preserves existing images and character audio.");
}
if (repairContent && overwrite) {
  throw new Error("--repair-content cannot be combined with --overwrite because character audio and images must be preserved.");
}
if (validateOnly) {
  console.log(`Validated ${characters.length} hanzi entries. Selected batch: ${batch.length}.`);
  process.exit(0);
}
if (planOnly) {
  console.log(JSON.stringify(await buildGenerationPlan(), null, 2));
  process.exit(0);
}

const imageRateLimiter = createRateLimiter("image", imageRpm, 9);
const speechRateLimiter = createRateLimiter("speech", speechRpm, 9);

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

function normalizeApiKey(value) {
  if (!value) return "";
  return String(value).trim();
}

function isHeaderSafeValue(value) {
  return /^[\x21-\x7e]+$/.test(value);
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
  const pinyin = String(item.pinyin ?? "").trim();
  const meaning = String(item.meaning ?? "").trim();
  const shapeHint = String(item.shapeHint ?? "").trim();
  const imageDescription = String(item.imageDescription ?? "").trim();
  const sentence = String(item.sentence ?? "").trim();
  const words = Array.isArray(item.words) ? item.words.map((word) => String(word).trim()).filter(Boolean) : [];
  const missing = [];
  if (!character) missing.push("character");
  if (!pinyin) missing.push("pinyin");
  if (!meaning) missing.push("meaning");
  if (!shapeHint) missing.push("shapeHint");
  if (!imageDescription) missing.push("imageDescription");
  if (!sentence) missing.push("sentence");
  if (!words.length) missing.push("words");
  if (missing.length) {
    throw new Error(`Character item ${index} is missing: ${missing.join(", ")}`);
  }
  assertProductionReadyContent({
    character,
    pinyin,
    sentence,
    words,
  }, index);
  return {
    id: String(item.id || `hanzi-u${character.codePointAt(0)?.toString(16) ?? index}`).trim(),
    character,
    pinyin,
    meaning,
    shapeHint,
    imageDescription,
    sentence: sentenceWithMarker(sentence, character),
    spokenSentence: sentence.replaceAll("__", character),
    words,
    sortOrder: Number.isInteger(Number(item.sortOrder)) ? Number(item.sortOrder) : (index + 1) * 10,
    isEnabled: item.isEnabled !== false,
  };
}

function assertProductionReadyContent(item, index) {
  const problems = [];
  const { character, pinyin, sentence, words } = item;
  const fallbackWordSets = [
    [`${character}光`, `小${character}`, `${character}里`],
    [`${character}好`, `${character}们`, `${character}家`],
    [`${character}个`, `${character}只`, `${character}天`],
    [`${character}子`, `小${character}`, `${character}边`],
    [`${character}本`, `${character}画`, `${character}字`],
    [`${character}一${character}`, `${character}开`, `快${character}`],
    [`小${character}`, `${character}子`, `${character}儿`],
    [`${character}天`, `${character}日`, `${character}时`],
    [`${character}色`, `${character}心`, `很${character}`],
  ];
  if (pinyin === "待补") problems.push("拼音仍为“待补”");
  if (sentence === `我们来认识${character}。`) problems.push("例句仍为机械模板");
  if (fallbackWordSets.some((set) => set.every((word, wordIndex) => words[wordIndex] === word))) {
    problems.push(`词语仍为机械模板：${words.join("、")}`);
  }

  if (problems.length) {
    throw new Error(
      `Character item ${index} (${character}) is not production-ready: ${problems.join("；")}。`
      + " 请先修正全量汉字数据，再调用 MiniMax，避免生成错误的付费音频。",
    );
  }
}

function sentenceWithMarker(sentence, character) {
  if (sentence.includes("__")) return sentence;
  if (sentence.includes(character)) return sentence.replace(character, "__");
  throw new Error(`Sentence must contain ${character} or __ marker: ${sentence}`);
}

function safeFilePart(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "-");
}

function contentToken(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 10);
}

function dirName(item) {
  const order = String(item.sortOrder).padStart(5, "0");
  return `${order}-${safeFilePart(item.id)}`;
}

async function buildGenerationPlan() {
  const plan = {
    entries: batch.length,
    concurrency,
    speechRpm,
    imageRpm,
    existingCanonicalDirectories: 0,
    imageRequests: 0,
    characterAudioRequests: 0,
    sentenceAudioRequests: 0,
    wordAudioRequests: 0,
    totalRequests: 0,
  };
  for (const item of batch) {
    const itemDir = path.join(outputDir, dirName(item));
    if (await fileExists(itemDir)) plan.existingCanonicalDirectories += 1;
    if (only !== "audio") {
      for (let index = 1; index <= imageCandidates; index += 1) {
        const fileName = imageCandidates === 1 ? "image.jpeg" : `image-candidate-${index}.jpeg`;
        if (overwrite || !await fileExists(path.join(itemDir, fileName))) plan.imageRequests += 1;
      }
    }
    if (only !== "image") {
      if ((overwrite && !repairContent) || !await fileExists(path.join(itemDir, "character.mp3"))) {
        plan.characterAudioRequests += 1;
      }
      const spokenSentence = item.spokenSentence;
      const sentenceFileName = repairContent
        ? `sentence-${contentToken(spokenSentence)}.mp3`
        : "sentence.mp3";
      if (overwrite || !await fileExists(path.join(itemDir, sentenceFileName))) {
        plan.sentenceAudioRequests += 1;
      }
      for (const [wordIndex, word] of item.words.entries()) {
        const fileName = `word-${String(wordIndex + 1).padStart(2, "0")}-${safeFilePart(word)}.mp3`;
        if (overwrite || !await fileExists(path.join(itemDir, fileName))) {
          plan.wordAudioRequests += 1;
        }
      }
    }
  }
  plan.totalRequests = plan.imageRequests
    + plan.characterAudioRequests
    + plan.sentenceAudioRequests
    + plan.wordAudioRequests;
  return plan;
}

function imagePrompt(item) {
  const scene = item.imageDescription || item.meaning;
  return [
    `Square semantic illustration for a 5-year-old Chinese learning app. Concept: ${scene}.`,
    "No text, no Chinese characters, no letters, no numbers, no pinyin, no symbols, no labels, no signs, no book pages, no worksheets, no UI, no watermark.",
    "Warm children picture-book style, soft cream background, rounded cute shapes, subtle paper grain, clean edges, low complexity, bright but gentle colors.",
    "One clear centered subject or very simple scene. Keep the full subject inside frame with 18% to 24% empty safe margin on all sides. Do not crop or touch edges.",
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
    const error = new Error(`${url} failed ${response.status}: ${JSON.stringify(json).slice(0, 800)}`);
    error.apiStatusCode = json.base_resp?.status_code;
    throw error;
  }
  return json;
}

async function postJsonWithFallback(urls, payload, rateLimiter) {
  const errors = [];
  for (const url of urls) {
    let transientAttempt = 0;
    let rateLimitAttempt = 0;
    while (transientAttempt <= requestRetries && rateLimitAttempt < 20) {
      await rateLimiter.wait();
      try {
        return await postJson(url, payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error?.apiStatusCode === 1002 || /rate limit exceeded/i.test(message)) {
          rateLimitAttempt += 1;
          errors.push(`${url} rate-limit attempt ${rateLimitAttempt}: ${message}`);
          await rateLimiter.onRateLimit();
          continue;
        }
        errors.push(`${url} attempt ${transientAttempt + 1}: ${message}`);
        if (!isRetryableRequestError(message) || transientAttempt === requestRetries) break;
        await delay(500 * (2 ** transientAttempt) + Math.floor(Math.random() * 250));
        transientAttempt += 1;
      }
    }
  }
  throw new Error(errors.slice(-12).join("\n"));
}

function isRetryableRequestError(message) {
  return !/invalid params|invalid api key|unauthorized|forbidden|prompt length/i.test(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createRateLimiter(label, initialRpm, safeRpm) {
  let rpm = initialRpm;
  let nextStartAt = 0;
  let blockedUntil = 0;
  let lastPenaltyAt = 0;
  let queue = Promise.resolve();

  return {
    async wait() {
      let release;
      const previous = queue;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      const now = Date.now();
      const waitMilliseconds = Math.max(0, blockedUntil - now, nextStartAt - now);
      if (waitMilliseconds > 0) await delay(waitMilliseconds);
      nextStartAt = Date.now() + Math.ceil(60_000 / rpm);
      release();
    },
    async onRateLimit() {
      const now = Date.now();
      if (now - lastPenaltyAt > 30_000) {
        const previousRpm = rpm;
        rpm = Math.max(1, Math.min(safeRpm, Math.floor(rpm / 2)));
        lastPenaltyAt = now;
        console.warn(
          `[rate-limit] ${label} exceeded RPM. Reducing ${previousRpm} -> ${rpm} RPM and waiting 61 seconds.`,
        );
      }
      blockedUntil = Math.max(blockedUntil, now + 61_000);
      await delay(Math.max(0, blockedUntil - Date.now()));
    },
  };
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
    }, imageRateLimiter);
    const encoded = json.data?.image_base64?.[0];
    if (!encoded) {
      throw new Error(`Image response missing image_base64 for ${item.character}`);
    }
    await writeFile(file, Buffer.from(encoded, "base64"));
    files.push({ file, relativePath: relativeAssetPath(item, fileName), skipped: false });
  }
  return files;
}

async function generateSpeech(text, file, relativePath, options = {}) {
  const force = options.force === true;
  if (!force && !overwrite && await fileExists(file)) {
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
  }, speechRateLimiter);
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

const manifest = new Array(batch.length);
let checkpointQueue = Promise.resolve();
let completed = 0;

await runWithConcurrency(batch, concurrency, async (item, index) => {
  const itemDir = path.join(outputDir, dirName(item));
  await mkdir(itemDir, { recursive: true });
  console.log(`[${start + index + 1}/${characters.length}] Processing ${item.character} (${item.id})...`);

  const images = only === "audio" ? [] : await generateImages(item, itemDir);
  const characterAudio = only === "image"
    ? null
    : await generateSpeech(
        item.character,
        path.join(itemDir, "character.mp3"),
        relativeAssetPath(item, "character.mp3"),
        { force: overwrite && !repairContent },
      );
  const sentenceFileName = repairContent
    ? `sentence-${contentToken(item.spokenSentence)}.mp3`
    : "sentence.mp3";
  const sentenceAudio = only === "image"
    ? null
    : await generateSpeech(
        item.spokenSentence,
        path.join(itemDir, sentenceFileName),
        relativeAssetPath(item, sentenceFileName),
        { force: overwrite },
      );
  const wordAudio = [];
  if (only !== "image") {
    for (const [wordIndex, word] of item.words.entries()) {
      const fileName = `word-${String(wordIndex + 1).padStart(2, "0")}-${safeFilePart(word)}.mp3`;
      wordAudio.push(await generateSpeech(
        word,
        path.join(itemDir, fileName),
        relativeAssetPath(item, fileName),
        { force: overwrite },
      ));
    }
    if (repairContent) {
      await removeStaleContentAudio(
        itemDir,
        new Set([
          sentenceFileName,
          ...wordAudio.map((audio) => path.basename(audio.file)),
        ]),
      );
    }
  }

  manifest[index] = {
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
  };

  completed += 1;
  console.log(`[${completed}/${batch.length}] Completed ${item.character}.`);
  if (completed % 10 === 0 || completed === batch.length) {
    const partialManifestFile = path.join(outputDir, "manifest.partial.json");
    checkpointQueue = checkpointQueue.then(() => writeFile(
      partialManifestFile,
      `${JSON.stringify(manifest.filter(Boolean), null, 2)}\n`,
    ));
    await checkpointQueue;
  }
});

const manifestFile = path.join(outputDir, "manifest.json");
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Done. Manifest: ${manifestFile}`);

async function removeStaleContentAudio(itemDir, expectedFileNames) {
  const fileNames = await readdir(itemDir);
  await Promise.all(fileNames
    .filter((fileName) => /^word-\d{2}-.*\.mp3$/u.test(fileName) || /^sentence(?:-[a-f0-9]+)?\.mp3$/u.test(fileName))
    .filter((fileName) => !expectedFileNames.has(fileName))
    .map((fileName) => unlink(path.join(itemDir, fileName))));
}

async function runWithConcurrency(items, workerCount, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(workerCount, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}
