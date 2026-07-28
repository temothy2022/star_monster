import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("../apps/design-lab/node_modules/sharp");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = parseArgs(process.argv.slice(2));
const inputDir = resolveFromRepoRoot(args.input ?? "outputs/hanzi-assets");
const checkOnly = Boolean(args.check);
const dryRun = Boolean(args["dry-run"]);
const overwrite = !checkOnly && !dryRun;
const quality = Number(args.quality ?? 82);
const pngQuality = Number(args["png-quality"] ?? 86);
const maxSize = Number(args["max-size"] ?? 1024);
const limit = args.limit === undefined ? null : Number(args.limit);
const minSavingBytes = Number(args["min-saving-bytes"] ?? 512);
const extensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

validateOptions();

const startedAt = Date.now();
await assertDirectory(inputDir);

let files = (await walk(inputDir))
  .filter((file) => extensions.has(path.extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b));

if (limit !== null) {
  files = files.slice(0, limit);
}

if (files.length === 0) {
  console.log(`No image files found in ${inputDir}`);
  process.exit(0);
}

const results = [];
for (const [index, file] of files.entries()) {
  results.push(await optimizeImage(file, index + 1, files.length));
}

const totalBefore = results.reduce((sum, item) => sum + item.before, 0);
const totalAfter = results.reduce((sum, item) => sum + item.after, 0);
const saved = totalBefore - totalAfter;
const changed = results.filter((item) => item.changed).length;
const resized = results.filter((item) => item.resized).length;
const mode = checkOnly ? "Audit" : dryRun ? "Dry run" : "Compressed";

console.log(
  `${mode}: ${files.length} image(s), ${changed} optimized, ${resized} resized, `
    + `${formatBytes(totalBefore)} -> ${formatBytes(totalAfter)}, saved ${formatBytes(saved)} `
    + `(${savingPercent(totalBefore, totalAfter)}%) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
);

const largest = [...results]
  .sort((a, b) => b.after - a.after)
  .slice(0, 8);

if (largest.length) {
  console.log("Largest images after compression:");
  for (const item of largest) {
    console.log(
      `- ${item.relative}: ${formatBytes(item.after)}, ${item.width}x${item.height}`,
    );
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") continue;
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
  if (!Number.isInteger(quality) || quality < 40 || quality > 95) {
    throw new Error("--quality must be an integer from 40 to 95.");
  }
  if (!Number.isInteger(pngQuality) || pngQuality < 40 || pngQuality > 100) {
    throw new Error("--png-quality must be an integer from 40 to 100.");
  }
  if (!Number.isInteger(maxSize) || maxSize < 320 || maxSize > 2048) {
    throw new Error("--max-size must be an integer from 320 to 2048.");
  }
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }
  if (!Number.isInteger(minSavingBytes) || minSavingBytes < 0) {
    throw new Error("--min-saving-bytes must be a non-negative integer.");
  }
}

function resolveFromRepoRoot(value) {
  const text = String(value);
  return path.isAbsolute(text) ? text : path.resolve(repoRoot, text);
}

async function assertDirectory(directory) {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) throw new Error(`${directory} is not a directory.`);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Input directory does not exist: ${directory}`);
    }
    throw error;
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  }));
  return nested.flat();
}

async function optimizeImage(file, index, total) {
  const relative = path.relative(inputDir, file);
  const before = await stat(file);
  const metadata = await sharp(file, { failOn: "warning" }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const shouldResize = Math.max(width, height) > maxSize;
  const extension = path.extname(file).toLowerCase();

  if (checkOnly) {
    return {
      relative,
      before: before.size,
      after: before.size,
      width,
      height,
      changed: false,
      resized: false,
    };
  }

  const temporary = `${file}.compressing`;
  await mkdir(path.dirname(temporary), { recursive: true });

  let pipeline = sharp(file, { failOn: "warning" }).rotate();
  if (shouldResize) {
    pipeline = pipeline.resize({
      width: maxSize,
      height: maxSize,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (extension === ".png") {
    pipeline = pipeline.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      effort: 10,
      palette: true,
      quality: pngQuality,
    });
  } else if (extension === ".webp") {
    pipeline = pipeline.webp({
      quality,
      effort: 6,
    });
  } else {
    pipeline = pipeline.jpeg({
      quality,
      mozjpeg: true,
      progressive: true,
      chromaSubsampling: "4:2:0",
    });
  }

  const output = await pipeline.toFile(temporary);
  await sharp(temporary, { failOn: "warning" }).metadata();

  const changed = shouldResize || before.size - output.size >= minSavingBytes;
  if (overwrite && changed) {
    await rename(temporary, file);
  } else {
    await unlinkIfExists(temporary);
  }

  if (index % 50 === 0 || index === total) {
    console.log(`[${index}/${total}] ${dryRun ? "Checked" : "Processed"} ${relative}`);
  }

  return {
    relative,
    before: before.size,
    after: changed ? output.size : before.size,
    width: changed ? output.width : width,
    height: changed ? output.height : height,
    changed,
    resized: shouldResize && changed,
  };
}

async function unlinkIfExists(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function savingPercent(before, after) {
  if (!before) return "0.0";
  return (((before - after) / before) * 100).toFixed(1);
}
