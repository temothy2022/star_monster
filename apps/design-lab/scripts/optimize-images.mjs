import { readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve("src/assets");
const checkOnly = process.argv.includes("--check");
const rasterExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_SINGLE_FILE_BYTES = 1_500_000;
const MAX_TOTAL_RASTER_BYTES = 24_000_000;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [absolute];
    }),
  );
  return files.flat();
}

function dimensionLimit(relativePath) {
  // 角色图最高约显示 400 CSS px，1024px 可覆盖 iPad Retina 2x。
  if (relativePath.startsWith("mascots/")) return 1024;

  // 兑换分类图显示在卡片内；1024×683 已高于目标容器的 2x 尺寸。
  if (relativePath.startsWith("reward-categories/")) return 1024;

  // 整屏背景和 Figma 导出页面素材保留原始尺寸，不统一缩小。
  return null;
}

async function optimize(file) {
  const relative = path.relative(root, file);
  const extension = path.extname(file).toLowerCase();
  const before = await stat(file);
  const metadata = await sharp(file).metadata();
  const limit = dimensionLimit(relative);
  const shouldResize =
    limit !== null &&
    Math.max(metadata.width ?? 0, metadata.height ?? 0) > limit;

  if (checkOnly) {
    return {
      relative,
      before: before.size,
      after: before.size,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      limit,
    };
  }

  const temporary = `${file}.optimizing`;
  let pipeline = sharp(file, { failOn: "warning" }).rotate();
  if (shouldResize) {
    pipeline = pipeline.resize({
      width: limit,
      height: limit,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (extension === ".png") {
    pipeline = pipeline.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      effort: 10,
    });
  } else if (extension === ".webp") {
    pipeline = pipeline.webp({
      quality: 82,
      effort: 6,
      smartSubsample: true,
    });
  } else {
    pipeline = pipeline.jpeg({
      quality: 90,
      mozjpeg: true,
    });
  }

  const output = await pipeline.toFile(temporary);
  const useOptimized = shouldResize || output.size < before.size;
  if (useOptimized) {
    await rename(temporary, file);
  } else {
    await unlink(temporary);
  }

  return {
    relative,
    before: before.size,
    after: useOptimized ? output.size : before.size,
    width: useOptimized ? output.width : (metadata.width ?? 0),
    height: useOptimized ? output.height : (metadata.height ?? 0),
    limit,
  };
}

const files = (await walk(root)).filter((file) =>
  rasterExtensions.has(path.extname(file).toLowerCase()),
);
const results = [];
for (const file of files) {
  results.push(await optimize(file));
}

const totalBefore = results.reduce((sum, item) => sum + item.before, 0);
const totalAfter = results.reduce((sum, item) => sum + item.after, 0);
const oversized = results.filter(
  (item) =>
    item.after > MAX_SINGLE_FILE_BYTES ||
    (item.limit !== null && Math.max(item.width, item.height) > item.limit),
);

if (checkOnly) {
  console.log(
    `图片审计：${results.length} 个栅格素材，共 ${(totalAfter / 1024 / 1024).toFixed(2)} MB`,
  );
} else {
  console.log(
    `图片优化：${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`,
  );
}

if (oversized.length > 0) {
  console.error("以下素材超过单文件体积或场景尺寸限制：");
  for (const item of oversized) {
    console.error(
      `- ${item.relative}: ${(item.after / 1024 / 1024).toFixed(2)} MB, ${item.width}×${item.height}`,
    );
  }
  process.exitCode = 1;
}

if (totalAfter > MAX_TOTAL_RASTER_BYTES) {
  console.error(
    `栅格素材总量 ${(totalAfter / 1024 / 1024).toFixed(2)} MB 超过 ${(MAX_TOTAL_RASTER_BYTES / 1024 / 1024).toFixed(2)} MB 预算`,
  );
  process.exitCode = 1;
}
