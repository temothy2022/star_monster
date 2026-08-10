import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "../lib/http-error.js";

export const PET_ROOM_THEME_ANIMATION_BODY_LIMIT = 15 * 1024 * 1024;
export const PET_ROOM_THEME_ANIMATION_PUBLIC_PATH = "/poem-assets/v1/uploads";

const MAX_INPUT_PIXELS = 100_000_000;
const MAX_SOURCE_EDGE = 2_048;
const MAX_FRAMES = 180;
const MAX_DURATION_MS = 20_000;
const SUPPORTED_FORMATS = new Set(["gif", "webp", "png"]);
const FORMAT_INFO = {
  gif: { extension: "gif", contentType: "image/gif" },
  webp: { extension: "webp", contentType: "image/webp" },
  png: { extension: "png", contentType: "image/png" },
} as const;

function normalizedContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export async function preparePetRoomThemeAnimation(input: {
  contentType: string;
  data: Buffer;
}) {
  if (!input.data.length) {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_EMPTY", "请选择要上传的星宠动画");
  }
  if (input.data.length > PET_ROOM_THEME_ANIMATION_BODY_LIMIT) {
    throw new HttpError(413, "PET_ROOM_THEME_ANIMATION_TOO_LARGE", "星宠动画不能超过 15MB");
  }
  if (!["image/gif", "image/webp", "image/png", "image/apng"].includes(normalizedContentType(input.contentType))) {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_INVALID_FORMAT", "星宠动画只支持 GIF、动态 WebP 或 PNG");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input.data, {
      animated: true,
      pages: -1,
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
  } catch {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_INVALID_FORMAT", "动画已损坏或当前格式无法读取");
  }

  if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_INVALID_FORMAT", "星宠动画只支持 GIF、动态 WebP 或 PNG");
  }
  const width = metadata.width ?? 0;
  const frameCount = Math.max(1, metadata.pages ?? 1);
  const height = metadata.pageHeight ?? metadata.height ?? 0;
  if (!width || !height || width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_SIZE_INVALID", "动画单帧尺寸不能超过 2048×2048px");
  }
  if (frameCount > MAX_FRAMES) {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_FRAMES_INVALID", `动画不能超过 ${MAX_FRAMES} 帧`);
  }
  const durationMs = (metadata.delay ?? []).reduce((total, delay) => total + delay, 0);
  if (durationMs > MAX_DURATION_MS) {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_DURATION_INVALID", "单次动画不能超过 20 秒");
  }

  const format = FORMAT_INFO[metadata.format as keyof typeof FORMAT_INFO];

  return {
    output: input.data,
    extension: format.extension,
    contentType: format.contentType,
    processed: false,
    source: {
      width,
      height,
      frameCount,
      durationMs,
      bytes: input.data.length,
      format: metadata.format,
    },
  };
}

export async function storePetRoomThemeAnimation(input: {
  uploadDir: string;
  themeKey: string;
  petType: string;
  contentType: string;
  data: Buffer;
}) {
  const prepared = await preparePetRoomThemeAnimation(input);
  const safeThemeKey = input.themeKey.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const safePetType = input.petType.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!safeThemeKey || !safePetType) {
    throw new HttpError(400, "PET_ROOM_THEME_ANIMATION_KEY_INVALID", "小屋或星宠标识无效");
  }
  const fingerprint = createHash("sha256").update(prepared.output).digest("hex").slice(0, 16);
  const fileName = `room-theme-${safeThemeKey}-${safePetType}-${fingerprint}-animation.${prepared.extension}`;
  const uploadDir = path.resolve(input.uploadDir);
  const filePath = path.join(uploadDir, fileName);
  await mkdir(uploadDir, { recursive: true });

  let created = true;
  try {
    await writeFile(filePath, prepared.output, { flag: "wx", mode: 0o644 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") created = false;
    else throw error;
  }

  return {
    created,
    fileName,
    filePath,
    publicUrl: `${PET_ROOM_THEME_ANIMATION_PUBLIC_PATH}/${encodeURIComponent(fileName)}`,
    contentType: prepared.contentType,
    outputBytes: prepared.output.length,
    processed: prepared.processed,
    source: prepared.source,
  };
}
