import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const inputDir = resolvePath(args.input);
const manifestFile = resolvePath(args.manifest);
const publicBaseUrl = normalizeBaseUrl(args["public-base-url"]);
const dryRun = Boolean(args["dry-run"]);
const inPlace = Boolean(args["in-place"]);

if (!args.input || !args.manifest) {
  throw new Error(
    "Usage: node scripts/fingerprint-media-assets.mjs --input outputs/hanzi-assets "
      + "--manifest outputs/hanzi-assets/manifest.json --public-base-url https://... --in-place",
  );
}
if (!inPlace && !dryRun) {
  throw new Error("Use --in-place to rename media and update the manifest, or --dry-run to inspect changes.");
}

await assertDirectory(inputDir);
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
if (!Array.isArray(manifest)) throw new Error("Manifest must be a JSON array.");

const references = new Map();
walkStrings(manifest, (value) => {
  const relative = resolveRelativeMediaPath(value);
  if (!relative) return;
  const source = path.join(inputDir, relative);
  references.set(source, references.get(source) ?? { relative });
});

let renamed = 0;
let totalBefore = 0;
const replacementMap = new Map();
const replacementByAlias = new Map();

for (const [source, entry] of references) {
  const before = await stat(source).catch(() => null);
  if (!before?.isFile()) continue;
  const extension = path.extname(source).toLowerCase();
  const digest = await sha256(source);
  const stem = path.basename(source, extension);
  const nextName = /-[0-9a-f]{12}$/iu.test(stem)
    ? `${stem}${extension}`
    : `${stem}-${digest.slice(0, 12)}${extension}`;
  const nextRelative = path.join(path.dirname(entry.relative), nextName);
  const target = path.join(inputDir, nextRelative);
  totalBefore += before.size;
  const replacement = { relative: nextRelative, target };
  replacementMap.set(source, replacement);
  replacementByAlias.set(mediaAlias(entry.relative), replacement);
  if (source === target) continue;
  renamed += 1;
  console.log(`${entry.relative} -> ${nextRelative}`);
  if (dryRun) continue;
  await mkdir(path.dirname(target), { recursive: true });
  const existing = await stat(target).catch(() => null);
  if (existing?.isFile()) {
    const existingDigest = await sha256(target);
    if (existingDigest !== digest) {
      throw new Error(`Refusing to overwrite a different file: ${target}`);
    }
    await unlink(source);
    continue;
  }
  await rename(source, target);
}

if (!dryRun) {
  rewriteManifest(manifest, (value) => {
    const relative = resolveRelativeMediaPath(value);
    if (!relative) return value;
    const source = path.join(inputDir, relative);
    const replacement =
      replacementMap.get(source) ?? replacementByAlias.get(mediaAlias(relative));
    return replacement ? formatReference(value, replacement.relative) : value;
  });
  const temporary = `${manifestFile}.fingerprinting`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporary, manifestFile);
}

console.log(JSON.stringify({
  ok: true,
  dryRun,
  referencedMediaFiles: references.size,
  renamed,
  referencedBytes: totalBefore,
}, null, 2));

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
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/u, "");
}

function isMediaPath(value) {
  return /\.(?:mp3|jpe?g|png|webp)$/iu.test(value);
}

function mediaAlias(relative) {
  const extension = path.extname(relative).toLowerCase();
  const stem = path.basename(relative, extension)
    .replace(/(?:-[0-9a-f]{10,12})+$/iu, "");
  return `${path.dirname(relative).replaceAll("\\", "/")}/${stem}${extension}`;
}

function resolveRelativeMediaPath(value) {
  const text = String(value || "").trim();
  if (!text || !isMediaPath(text)) return null;
  if (/^https?:\/\//iu.test(text)) {
    if (!publicBaseUrl) return null;
    const base = new URL(publicBaseUrl);
    const url = new URL(text);
    if (!url.pathname.startsWith(`${base.pathname}/`)) return null;
    return decodeURIComponent(url.pathname.slice(base.pathname.length + 1));
  }
  const normalized = text.replaceAll("\\", "/");
  if (path.isAbsolute(text)) {
    const relative = path.relative(inputDir, text);
    return relative && !relative.startsWith("..") ? relative : null;
  }
  return normalized.replace(/^\.\//u, "");
}

function formatReference(original, relative) {
  const text = String(original);
  if (/^https?:\/\//iu.test(text)) {
    const url = new URL(text);
    const base = publicBaseUrl ? new URL(publicBaseUrl) : null;
    const prefix = base?.pathname.replace(/\/+$/u, "") ?? "";
    if (base) {
      url.protocol = base.protocol;
      url.host = base.host;
    }
    url.pathname = `${prefix}/${relative}`.replaceAll("\\", "/");
    return url.toString();
  }
  if (path.isAbsolute(text)) return path.join(inputDir, relative);
  return text.startsWith("./") ? `./${relative}` : relative;
}

function walkStrings(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") visit(item, (next) => { value[index] = next; });
      else walkStrings(item, visit);
    });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") visit(child, (next) => { value[key] = next; });
    else walkStrings(child, visit);
  }
}

function rewriteManifest(value, rewrite) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") value[index] = rewrite(item);
      else rewriteManifest(item, rewrite);
    });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") value[key] = rewrite(child);
    else rewriteManifest(child, rewrite);
  }
}

async function assertDirectory(directory) {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Input directory does not exist: ${directory}`);
}

async function sha256(file) {
  const data = await readFile(file);
  return createHash("sha256").update(data).digest("hex");
}
