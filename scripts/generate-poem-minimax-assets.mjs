import { access, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("../apps/design-lab/node_modules/sharp");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = parseArgs(process.argv.slice(2));
const apiKey = normalizeApiKey(process.env.MINIMAX_API_KEY);
const offlineRequested = Boolean(args.plan || args["validate-only"]);
if (!apiKey && !offlineRequested) {
  console.error("Missing MINIMAX_API_KEY. Run: export MINIMAX_API_KEY='你的密钥'");
  process.exit(1);
}
if (apiKey && !/^[\x21-\x7e]+$/.test(apiKey)) {
  console.error("MINIMAX_API_KEY contains spaces, newlines, or non-ASCII characters.");
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

const inputFile = resolveFromRepoRoot(args.input ?? "work/poems.json");
const outputDir = resolveFromRepoRoot(args.output ?? "packages/assets/generated/poem-assets");
const publicBaseUrl = normalizeBaseUrl(args["public-base-url"] ?? process.env.POEM_ASSET_PUBLIC_BASE_URL ?? "");
const overwrite = Boolean(args.overwrite);
const only = String(args.only ?? "all");
const start = Number(args.offset ?? 0);
const limit = args.limit === undefined ? null : Number(args.limit);
const concurrency = Number(args.concurrency ?? 3);
const requestRetries = Number(args.retries ?? 3);
const imageRpm = Number(args["image-rpm"] ?? 8);
const speechRpm = Number(args["speech-rpm"] ?? 12);
const imageSize = Number(args["image-size"] ?? 768);
const imageQuality = Number(args["image-quality"] ?? 76);
const audioBitrate = Number(args["audio-bitrate"] ?? 64000);
const audioSampleRate = Number(args["audio-sample-rate"] ?? 24000);
const voiceId = String(args.voice ?? "female-shaonv");
const useFfmpeg = Boolean(args["ffmpeg-audio"]);
const ffmpegPath = String(args.ffmpeg ?? "ffmpeg");
const validateOnly = Boolean(args["validate-only"]);
const planOnly = Boolean(args.plan);

validateOptions();

const poems = (await loadPoems(inputFile)).sort((left, right) =>
  left.grade - right.grade ||
  left.semester.localeCompare(right.semester, "zh-Hans-CN") ||
  left.sortOrder - right.sortOrder,
);
const selected = poems.slice(start, limit === null ? poems.length : start + limit);

if (validateOnly) {
  console.log(`Validated ${poems.length} poem entries. Selected batch: ${selected.length}.`);
  process.exit(0);
}
if (planOnly) {
  console.log(JSON.stringify(await buildGenerationPlan(), null, 2));
  process.exit(0);
}

const imageRateLimiter = createRateLimiter("image", imageRpm, 8);
const speechRateLimiter = createRateLimiter("speech", speechRpm, 9);

await mkdir(outputDir, { recursive: true });

const manifest = new Array(selected.length);
let checkpointQueue = Promise.resolve();
let completed = 0;

await runWithConcurrency(selected, concurrency, async (poem, index) => {
  const itemDir = path.join(outputDir, dirName(poem));
  await mkdir(itemDir, { recursive: true });
  console.log(`[${start + index + 1}/${poems.length}] Processing ${poem.title} (${poem.dynasty} ${poem.author})...`);

  const image = only === "audio" ? null : await generateImage(poem, itemDir);
  const audio = only === "image" ? null : await generatePoemAudio(poem, itemDir);

  manifest[index] = {
    id: poem.id,
    title: poem.title,
    dynasty: poem.dynasty,
    author: poem.author,
    grade: poem.grade,
    semester: poem.semester,
    content: poem.content,
    sortOrder: poem.sortOrder,
    image,
    imageUrl: image?.url ?? null,
    audio,
    audioUrl: audio?.url ?? null,
  };

  completed += 1;
  console.log(`[${completed}/${selected.length}] Completed ${poem.title}.`);
  if (completed % 10 === 0 || completed === selected.length) {
    checkpointQueue = checkpointQueue.then(() => writeFile(
      path.join(outputDir, "manifest.partial.json"),
      `${JSON.stringify(manifest.filter(Boolean), null, 2)}\n`,
    ));
    await checkpointQueue;
  }
});

const manifestFile = path.join(outputDir, "manifest.json");
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Done. Manifest: ${manifestFile}`);

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

function validateOptions() {
  if (!["all", "image", "audio"].includes(only)) {
    throw new Error("--only must be all, image, or audio.");
  }
  if (!Number.isInteger(start) || start < 0) throw new Error("--offset must be a non-negative integer.");
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) throw new Error("--concurrency must be 1 to 6.");
  if (!Number.isInteger(requestRetries) || requestRetries < 0 || requestRetries > 6) throw new Error("--retries must be 0 to 6.");
  if (!Number.isInteger(imageRpm) || imageRpm < 1 || imageRpm > 10) throw new Error("--image-rpm must be 1 to 10.");
  if (!Number.isInteger(speechRpm) || speechRpm < 1 || speechRpm > 20) throw new Error("--speech-rpm must be 1 to 20.");
  if (!Number.isInteger(imageSize) || imageSize < 384 || imageSize > 1280) throw new Error("--image-size must be 384 to 1280.");
  if (!Number.isInteger(imageQuality) || imageQuality < 45 || imageQuality > 92) throw new Error("--image-quality must be 45 to 92.");
  if (!Number.isInteger(audioBitrate) || audioBitrate < 32000 || audioBitrate > 128000) throw new Error("--audio-bitrate must be 32000 to 128000.");
  if (!Number.isInteger(audioSampleRate) || audioSampleRate < 16000 || audioSampleRate > 44100) throw new Error("--audio-sample-rate must be 16000 to 44100.");
}

function normalizeApiKey(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveFromRepoRoot(value) {
  const text = String(value);
  return path.isAbsolute(text) ? text : path.resolve(repoRoot, text);
}

async function loadPoems(file) {
  const source = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(source)) throw new Error("Input JSON must be an array of poems.");
  return source.map((item, index) => normalizePoem(item, index));
}

function normalizePoem(item, index) {
  const poem = {
    id: String(item.id || `poem-${String(index + 1).padStart(3, "0")}`),
    title: String(item.title ?? "").trim(),
    dynasty: String(item.dynasty ?? "").trim(),
    author: String(item.author ?? "").trim(),
    grade: Number(item.grade),
    semester: String(item.semester ?? "").trim(),
    content: normalizePoemContent(item.content),
    sortOrder: Number.isInteger(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
  };
  const missing = [];
  if (!poem.title) missing.push("title");
  if (!poem.dynasty) missing.push("dynasty");
  if (!poem.author) missing.push("author");
  if (!Number.isInteger(poem.grade) || poem.grade < 1 || poem.grade > 6) missing.push("grade");
  if (!poem.semester) missing.push("semester");
  if (!poem.content) missing.push("content");
  if (missing.length) throw new Error(`Poem item ${index} is missing or invalid: ${missing.join(", ")}`);
  return poem;
}

function normalizePoemContent(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function safeFilePart(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "-");
}

function contentToken(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 10);
}

function dirName(poem) {
  const order = String(poem.sortOrder + 1).padStart(4, "0");
  return `${order}-g${poem.grade}${poem.semester}-${safeFilePart(poem.title)}-${safeFilePart(poem.author)}`;
}

function relativeAssetPath(poem, fileName) {
  return `${dirName(poem)}/${fileName}`;
}

function publicUrl(relativePath) {
  return publicBaseUrl ? `${publicBaseUrl}/${relativePath}` : relativePath;
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function findExistingAsset(directory, pattern) {
  try {
    const fileNames = await readdir(directory);
    const fileName = fileNames.find((name) => pattern.test(name));
    return fileName ? { fileName, file: path.join(directory, fileName) } : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function buildGenerationPlan() {
  const plan = {
    entries: selected.length,
    concurrency,
    imageRpm,
    speechRpm,
    imageRequests: 0,
    audioRequests: 0,
    existingDirectories: 0,
    totalRequests: 0,
    estimatedSpeechCharacters: 0,
  };
  for (const poem of selected) {
    const itemDir = path.join(outputDir, dirName(poem));
    if (await fileExists(itemDir)) plan.existingDirectories += 1;
    const imageFile = path.join(itemDir, imageFileName(poem));
    const audioFile = path.join(itemDir, audioFileName(poem));
    if (only !== "audio" && (overwrite || !await fileExists(imageFile))) plan.imageRequests += 1;
    if (only !== "image" && (overwrite || !await fileExists(audioFile))) plan.audioRequests += 1;
    plan.estimatedSpeechCharacters += poemAudioText(poem).length;
  }
  plan.totalRequests = plan.imageRequests + plan.audioRequests;
  return plan;
}

function imageFileName(poem) {
  return `image-${contentToken(`${poem.title}|${poem.dynasty}|${poem.author}|${poem.content}|v2`)}.webp`;
}

function audioFileName(poem) {
  return `recitation-${contentToken(poemAudioText(poem))}.mp3`;
}

function poemAudioText(poem) {
  return `《${poem.title}》。${poem.dynasty}代，${poem.author}。${poem.content}`;
}

function safePoemTheme(poem) {
  const text = `${poem.title}${poem.content}`;
  const themes = [
    [/鹅|鸭|鸟|鹭|黄鹂|蝉|蜂|蝶|燕/u, "gentle birds or small animals in a bright natural setting"],
    [/柳|草|花|梅|菊|荷|莲|竹|松|蔷薇/u, "plants and flowers in a peaceful garden or riverside scene"],
    [/月|夜|星|宿/u, "a quiet moonlit night with soft light and a peaceful landscape"],
    [/春|晓|雨|风/u, "a fresh spring morning with soft breeze, flowers, and gentle rain"],
    [/夏|暑/u, "a bright summer scene with green shade and warm sunlight"],
    [/秋|霜|枫/u, "a calm autumn scene with golden leaves and clear sky"],
    [/冬|雪|寒/u, "a cozy winter scene with soft snow and warm colors"],
    [/山|峰|岭|岳/u, "rounded mountains, clouds, and a wide peaceful landscape"],
    [/江|河|湖|溪|水|海|泉|波|舟|船/u, "a river or lake with a small boat and gentle ripples"],
    [/乡|家|村|回/u, "an elder returning to a familiar village, with friendly children and warm countryside homes"],
    [/送|别|友/u, "friends saying goodbye on a quiet path beside water and trees"],
    [/牧|童|儿童|小儿/u, "children playing or walking in a safe countryside setting"],
    [/楼|寺|城|关|宫/u, "an ancient building seen from a peaceful outdoor landscape"],
    [/田|农|麦|禾|稻/u, "fields, crops, and a sunny countryside farming scene"],
  ];
  for (const [pattern, theme] of themes) {
    if (pattern.test(text)) return theme;
  }
  return "a peaceful ancient Chinese nature scene inspired by classical poetry";
}

function imagePrompt(poem, mode = "standard") {
  if (mode === "safe") {
    return [
      "Create a square illustration for a children's classical poem recitation app.",
      `Theme: ${safePoemTheme(poem)}.`,
      "Show a calm ancient Chinese outdoor scene with nature, warm light, gentle weather, and a clear child-friendly mood.",
      "Warm picture-book style for a children's iPad learning product: soft cream background, rounded cute forms, subtle paper grain, clean edges, gentle bright colors.",
      "One clear scene with a strong central composition and 14% to 22% empty safe margin. Avoid dark, scary, crowded, photorealistic, or overly complex imagery.",
      "No text, no Chinese characters, no letters, no numbers, no pinyin, no titles, no labels, no book pages, no scroll calligraphy, no signs, no watermark, no logo.",
    ].join(" ");
  }
  return [
    `Create a square semantic illustration for a 5-year-old Chinese poem recitation app.`,
    `Poem title: ${poem.title}. Dynasty: ${poem.dynasty}. Author: ${poem.author}. Theme: ${safePoemTheme(poem)}.`,
    "Show the concrete scene, mood, season, objects, people, animals, plants, and landscape suggested by the theme. Keep it understandable for a young child.",
    "Warm picture-book style matching a children's iPad learning product: soft cream background, rounded cute forms, subtle paper grain, clean edges, gentle bright colors.",
    "One clear scene with a strong central composition and 14% to 22% empty safe margin. Avoid dark, scary, crowded, photorealistic, or overly complex imagery.",
    "No text, no Chinese characters, no letters, no numbers, no pinyin, no titles, no labels, no book pages, no scroll calligraphy, no signs, no watermark, no logo.",
  ].join(" ");
}

async function generateImage(poem, itemDir) {
  const finalName = imageFileName(poem);
  const finalFile = path.join(itemDir, finalName);
  const relativePath = relativeAssetPath(poem, finalName);
  if (!overwrite && await fileExists(finalFile)) {
    return imageResult(finalFile, relativePath, true);
  }
  if (!overwrite) {
    const existing = await findExistingAsset(itemDir, /^image-[a-f0-9]{10}\.webp$/u);
    if (existing) {
      return imageResult(existing.file, relativeAssetPath(poem, existing.fileName), true);
    }
  }

  const rawFile = path.join(itemDir, `image-raw-${contentToken(`${poem.title}|${poem.content}`)}.jpeg`);
  const json = await postImageWithSafePrompt(poem);
  const encoded = json.data?.image_base64?.[0];
  if (!encoded) throw new Error(`Image response missing image_base64 for ${poem.title}`);
  await writeFile(rawFile, Buffer.from(encoded, "base64"));
  await sharp(rawFile, { failOn: "warning" })
    .rotate()
    .resize({ width: imageSize, height: imageSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: imageQuality, effort: 6 })
    .toFile(finalFile);
  await unlinkIfExists(rawFile);
  return imageResult(finalFile, relativePath, false);
}

async function postImageWithSafePrompt(poem) {
  try {
    return await requestImage(poem, "standard");
  } catch (error) {
    if (!isSensitiveInputError(error)) throw error;
    console.warn(`[sensitive-prompt] ${poem.title} triggered MiniMax input filter. Retrying with safe prompt.`);
    return requestImage(poem, "safe");
  }
}

async function requestImage(poem, mode) {
  return postJsonWithFallback(imageEndpoints, {
    model: "image-01",
    prompt: imagePrompt(poem, mode),
    aspect_ratio: "1:1",
    response_format: "base64",
    n: 1,
    prompt_optimizer: false,
  }, imageRateLimiter);
}

async function imageResult(file, relativePath, skipped) {
  const info = await stat(file);
  const metadata = await sharp(file, { failOn: "warning" }).metadata();
  return {
    file,
    relativePath,
    url: publicUrl(relativePath),
    bytes: info.size,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    skipped,
  };
}

async function generatePoemAudio(poem, itemDir) {
  const text = poemAudioText(poem);
  const finalName = audioFileName(poem);
  const finalFile = path.join(itemDir, finalName);
  const relativePath = relativeAssetPath(poem, finalName);
  if (!overwrite && await fileExists(finalFile)) {
    return audioResult(finalFile, relativePath, text, true);
  }
  if (!overwrite) {
    const existing = await findExistingAsset(itemDir, /^recitation-[a-f0-9]{10}\.mp3$/u);
    if (existing) {
      return audioResult(existing.file, relativeAssetPath(poem, existing.fileName), text, true);
    }
  }

  const temporary = `${finalFile}.tmp`;
  const json = await postJsonWithFallback(speechEndpoints, {
    model: "speech-2.8-turbo",
    text,
    stream: false,
    language_boost: "Chinese",
    output_format: "hex",
    voice_setting: {
      voice_id: voiceId,
      speed: 0.82,
      vol: 1,
      pitch: 0,
      emotion: "happy",
    },
    audio_setting: {
      sample_rate: audioSampleRate,
      bitrate: audioBitrate,
      format: "mp3",
      channel: 1,
    },
    pronunciation_dict: { tone: [] },
    subtitle_enable: false,
  }, speechRateLimiter);
  const hex = json.data?.audio;
  if (!hex) throw new Error(`Speech response missing audio for ${poem.title}`);
  await writeFile(temporary, Buffer.from(hex, "hex"));

  if (useFfmpeg && hasExecutable(ffmpegPath)) {
    const compressed = `${finalFile}.ffmpeg.mp3`;
    const result = spawnSync(ffmpegPath, [
      "-y",
      "-i", temporary,
      "-ac", "1",
      "-ar", String(audioSampleRate),
      "-b:a", String(audioBitrate),
      compressed,
    ], { stdio: "pipe" });
    if (result.status === 0) {
      await rename(compressed, finalFile);
      await unlinkIfExists(temporary);
    } else {
      await rename(temporary, finalFile);
      await unlinkIfExists(compressed);
      console.warn(`[ffmpeg] Compression failed for ${poem.title}; kept MiniMax MP3 output.`);
    }
  } else {
    if (useFfmpeg) console.warn("[ffmpeg] ffmpeg not found; kept MiniMax MP3 output.");
    await rename(temporary, finalFile);
  }

  return audioResult(finalFile, relativePath, text, false, json.extra_info);
}

async function audioResult(file, relativePath, text, skipped, extraInfo = {}) {
  const info = await stat(file);
  return {
    file,
    relativePath,
    url: publicUrl(relativePath),
    bytes: info.size,
    skipped,
    usageCharacters: extraInfo?.usage_characters ?? text.length,
  };
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
  return !/invalid params|invalid api key|unauthorized|forbidden|prompt length|input new_sensitive/i.test(message);
}

function isSensitiveInputError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.apiStatusCode === 1026 || /input new_sensitive/i.test(message);
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
        console.warn(`[rate-limit] ${label} exceeded RPM. Reducing ${previousRpm} -> ${rpm} RPM and waiting 61 seconds.`);
      }
      blockedUntil = Math.max(blockedUntil, now + 61_000);
      await delay(Math.max(0, blockedUntil - Date.now()));
    },
  };
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

async function unlinkIfExists(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function hasExecutable(command) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  return result.status === 0;
}
