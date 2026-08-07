import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = path.join(repoRoot, "packages/assets/images");
const sourceCodeRoot = path.join(repoRoot, "apps");
const sharedCodeRoot = path.join(repoRoot, "packages");
const checkOnly = process.argv.includes("--check");
const sourceExtensions = new Set([".ts", ".tsx", ".css", ".html"]);
const minimumSavingRatio = 0.1;
const minimumSourceBytes = 4_096;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [absolute];
    }),
  );
  return nested.flat();
}

const sourceFiles = (await walk(sourceCodeRoot)).concat(await walk(sharedCodeRoot)).filter((file) =>
  sourceExtensions.has(path.extname(file).toLowerCase()),
);
const references = new Map();

for (const sourceFile of sourceFiles) {
  const source = await readFile(sourceFile, "utf8");
  const matches = source.matchAll(/(@star-monsters\/assets\/images\/[^"'()\s]+\.png)(?=[?"')])/gi);
  for (const match of matches) {
    const reference = match[1];
    const relativeAsset = reference.replace("@star-monsters/assets/images/", "");
    const input = path.join(sourceRoot, relativeAsset);
    if (!input.startsWith(sourceRoot)) continue;
    try {
      await stat(input);
    } catch {
      continue;
    }
    const consumers = references.get(input) ?? [];
    consumers.push({ sourceFile, reference });
    references.set(input, consumers);
  }
}

let totalBefore = 0;
let totalAfter = 0;
let convertedCount = 0;
const changesBySource = new Map();

for (const [input, consumers] of references) {
  const before = (await stat(input)).size;
  const output = input.replace(/\.png$/i, ".webp");
  const encoded = await sharp(input, { failOn: "warning" })
    .rotate()
    .webp({
      quality: 90,
      alphaQuality: 100,
      smartSubsample: true,
      effort: 4,
    })
    .toBuffer();

  totalBefore += before;
  totalAfter += Math.min(before, encoded.length);
  // Tiny UI icons are already compact, and keeping them lossless avoids
  // softening one-pixel outlines for savings of only a few bytes.
  if (before < minimumSourceBytes) continue;
  if (encoded.length >= before * (1 - minimumSavingRatio)) continue;

  convertedCount += 1;
  console.log(
    `${path.relative(sourceRoot, input)}: ${(before / 1024).toFixed(0)} KB → ${(encoded.length / 1024).toFixed(0)} KB`,
  );

  if (checkOnly) continue;
  await writeFile(output, encoded);
  for (const consumer of consumers) {
    const changes = changesBySource.get(consumer.sourceFile) ?? [];
    changes.push({
      from: consumer.reference,
      to: consumer.reference.replace(/\.png$/i, ".webp"),
    });
    changesBySource.set(consumer.sourceFile, changes);
  }
}

if (!checkOnly) {
  for (const [sourceFile, changes] of changesBySource) {
    let source = await readFile(sourceFile, "utf8");
    for (const change of changes) {
      source = source.replaceAll(change.from, change.to);
    }
    await writeFile(sourceFile, source);
  }
}

console.log(
  `网页图片：${references.size} 个 PNG 中 ${convertedCount} 个适合转为 WebP；预计 ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`,
);

if (checkOnly && convertedCount > 0) {
  console.error("仍有体积可明显缩小的网页 PNG，请运行 pnpm assets:webp。");
  process.exitCode = 1;
}
