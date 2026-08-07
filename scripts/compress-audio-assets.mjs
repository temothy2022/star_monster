import { execFile } from "node:child_process";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const inputDir = resolvePath(args.input ?? "packages/assets/generated/hanzi-assets");
const outputDir = args.output ? resolvePath(args.output) : inputDir;
const inPlace = Boolean(args["in-place"]);
const bitrate = String(args.bitrate ?? "64k");
const sampleRate = String(args["sample-rate"] ?? "24000");

if (!inPlace && !args.output) {
  throw new Error("Use --in-place or provide --output so the original assets are protected.");
}
if (!/^\d+k$/u.test(bitrate)) throw new Error("--bitrate must look like 64k.");
if (!/^\d+$/.test(sampleRate)) throw new Error("--sample-rate must be an integer.");

await assertCommand("ffmpeg", ["-version"]);
await assertDirectory(inputDir);
if (!inPlace) await mkdir(outputDir, { recursive: true });

const files = (await walk(inputDir))
  .filter((file) => path.extname(file).toLowerCase() === ".mp3")
  .sort();
if (!files.length) {
  console.log(`No MP3 files found in ${inputDir}`);
  process.exit(0);
}

let beforeTotal = 0;
let afterTotal = 0;
for (const [index, inputFile] of files.entries()) {
  const relative = path.relative(inputDir, inputFile);
  const outputFile = path.join(outputDir, relative);
  const temporary = `${outputFile}.compressing`;
  await mkdir(path.dirname(outputFile), { recursive: true });
  const before = await stat(inputFile);
  beforeTotal += before.size;

  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-y",
    "-i", inputFile,
    "-map_metadata", "-1",
    "-ac", "1",
    "-ar", sampleRate,
    "-c:a", "libmp3lame",
    "-b:a", bitrate,
    "-f", "mp3",
    temporary,
  ]);

  const after = await stat(temporary);
  afterTotal += after.size;
  if (inPlace) {
    await rename(temporary, inputFile);
  } else {
    await rename(temporary, outputFile);
  }
  if ((index + 1) % 250 === 0 || index === files.length - 1) {
    console.log(`[${index + 1}/${files.length}] ${relative}`);
  }
}

console.log(
  `Compressed ${files.length} MP3 files: ${formatBytes(beforeTotal)} -> ${formatBytes(afterTotal)} `
    + `(${(((beforeTotal - afterTotal) / beforeTotal) * 100).toFixed(1)}% smaller).`,
);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

async function assertCommand(command, commandArgs) {
  try {
    await execFileAsync(command, commandArgs);
  } catch {
    throw new Error("ffmpeg is required. Install it first, then rerun this script.");
  }
}

async function assertDirectory(directory) {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Input directory does not exist: ${directory}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  }));
  return nested.flat();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
