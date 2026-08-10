import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "../lib/http-error.js";

export const PET_ROOM_THEME_IMAGE_BODY_LIMIT = 30 * 1024 * 1024;
export const PET_ROOM_THEME_SOURCE_WIDTH = 1920;
export const PET_ROOM_THEME_SOURCE_HEIGHT = 1200;
export const PET_ROOM_THEME_PUBLIC_PATH = "/poem-assets/v1/uploads";

const MAX_INPUT_PIXELS = 80_000_000;
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "tiff", "heif", "gif"]);

type VariantName = "landscape" | "tablet" | "phone" | "preview";

const VARIANTS: Array<{
  name: VariantName;
  width: number;
  height: number;
  quality: number;
}> = [
  { name: "landscape", width: 1920, height: 1200, quality: 78 },
  { name: "tablet", width: 1536, height: 2048, quality: 76 },
  { name: "phone", width: 1080, height: 1920, quality: 75 },
  { name: "preview", width: 480, height: 300, quality: 72 },
];

function normalizedContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function orientedDimensions(metadata: sharp.Metadata) {
  const rotated = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
  };
}

export async function preparePetRoomThemeImage(input: {
  contentType: string;
  data: Buffer;
}) {
  if (!input.data.length) {
    throw new HttpError(400, "PET_ROOM_THEME_IMAGE_EMPTY", "请选择要上传的小屋背景图片");
  }
  if (input.data.length > PET_ROOM_THEME_IMAGE_BODY_LIMIT) {
    throw new HttpError(413, "PET_ROOM_THEME_IMAGE_TOO_LARGE", "背景原图不能超过 30MB");
  }
  const contentType = normalizedContentType(input.contentType);
  if (!contentType.startsWith("image/")) {
    throw new HttpError(400, "PET_ROOM_THEME_IMAGE_INVALID_FORMAT", "请上传 PNG、JPEG、WebP、AVIF 或 TIFF 图片");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input.data, { failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new HttpError(400, "PET_ROOM_THEME_IMAGE_INVALID_FORMAT", "图片已损坏或当前格式无法读取");
  }
  if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
    throw new HttpError(400, "PET_ROOM_THEME_IMAGE_INVALID_FORMAT", "请上传 PNG、JPEG、WebP、AVIF 或 TIFF 图片");
  }
  const dimensions = orientedDimensions(metadata);
  if (!dimensions.width || !dimensions.height) {
    throw new HttpError(400, "PET_ROOM_THEME_IMAGE_INVALID_FORMAT", "无法读取图片尺寸");
  }
  const aspectRatio = dimensions.width / dimensions.height;
  if (
    dimensions.width < PET_ROOM_THEME_SOURCE_WIDTH
    || dimensions.height < PET_ROOM_THEME_SOURCE_HEIGHT
    || aspectRatio < 1.45
    || aspectRatio > 1.8
  ) {
    throw new HttpError(
      400,
      "PET_ROOM_THEME_IMAGE_SIZE_INVALID",
      `请上传至少 ${PET_ROOM_THEME_SOURCE_WIDTH}×${PET_ROOM_THEME_SOURCE_HEIGHT}px 的 16:10 横图`,
    );
  }

  const variants: Record<VariantName, Buffer> = {} as Record<VariantName, Buffer>;
  try {
    for (const variant of VARIANTS) {
      variants[variant.name] = await sharp(input.data, {
        failOn: "warning",
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .rotate()
        .resize(variant.width, variant.height, {
          fit: "cover",
          position: sharp.strategy.attention,
          withoutEnlargement: false,
        })
        .webp({ quality: variant.quality, effort: 6, smartSubsample: true })
        .toBuffer();
    }
  } catch {
    throw new HttpError(400, "PET_ROOM_THEME_IMAGE_PROCESSING_FAILED", "图片处理失败，请换一张原图后重试");
  }

  return {
    source: {
      width: dimensions.width,
      height: dimensions.height,
      bytes: input.data.length,
      format: metadata.format,
    },
    variants,
  };
}

export async function storePetRoomThemeImages(input: {
  uploadDir: string;
  themeKey: string;
  contentType: string;
  data: Buffer;
}) {
  const prepared = await preparePetRoomThemeImage(input);
  const safeKey = input.themeKey.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!safeKey) throw new HttpError(400, "PET_ROOM_THEME_KEY_INVALID", "小屋背景标识无效");
  const fingerprint = createHash("sha256")
    .update(prepared.variants.landscape)
    .digest("hex")
    .slice(0, 16);
  const uploadDir = path.resolve(input.uploadDir);
  await mkdir(uploadDir, { recursive: true });

  const createdPaths: string[] = [];
  const urls = {} as Record<VariantName, string>;
  const files = {} as Record<VariantName, { fileName: string; filePath: string; bytes: number }>;
  try {
    for (const variant of VARIANTS) {
      const fileName = `room-theme-${safeKey}-${fingerprint}-${variant.name}.webp`;
      const filePath = path.join(uploadDir, fileName);
      let created = true;
      try {
        await writeFile(filePath, prepared.variants[variant.name], { flag: "wx", mode: 0o644 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") created = false;
        else throw error;
      }
      if (created) createdPaths.push(filePath);
      files[variant.name] = { fileName, filePath, bytes: prepared.variants[variant.name].length };
      urls[variant.name] = `${PET_ROOM_THEME_PUBLIC_PATH}/${encodeURIComponent(fileName)}`;
    }
  } catch (error) {
    await Promise.all(createdPaths.map((filePath) => unlink(filePath).catch(() => undefined)));
    throw error;
  }

  return {
    source: prepared.source,
    files,
    urls,
    createdPaths,
    outputBytes: Object.values(files).reduce((total, file) => total + file.bytes, 0),
  };
}
