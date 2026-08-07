import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../lib/http-error.js";

export const MASCOT_ASSET_BODY_LIMIT = 8 * 1024 * 1024;
export const MASCOT_ASSET_PUBLIC_PATH = "/poem-assets/v1/uploads";

export type MascotAssetSlot =
  | "TASK_IDLE"
  | "NEUTRAL"
  | "FOCUS"
  | "CELEBRATE"
  | "HUNGRY"
  | "EATING"
  | "DRINKING"
  | "TRAVEL"
  | "SLEEPING";

type ImageFormat = {
  extension: string;
  contentType: string;
  matches: (data: Buffer) => boolean;
};

const IMAGE_FORMATS: Record<string, ImageFormat> = {
  "image/webp": {
    extension: "webp",
    contentType: "image/webp",
    matches: (data) =>
      data.length >= 12 &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP",
  },
  "image/gif": {
    extension: "gif",
    contentType: "image/gif",
    matches: (data) =>
      data.length >= 6 &&
      (data.subarray(0, 6).toString("ascii") === "GIF87a" ||
        data.subarray(0, 6).toString("ascii") === "GIF89a"),
  },
  "image/png": {
    extension: "png",
    contentType: "image/png",
    matches: (data) =>
      data.length >= 8 &&
      data.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
  },
  "image/jpeg": {
    extension: "jpeg",
    contentType: "image/jpeg",
    matches: (data) =>
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff,
  },
};

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
};

function normalizedContentType(value: string) {
  const contentType = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return CONTENT_TYPE_ALIASES[contentType] ?? contentType;
}

function imageFormat(contentType: string, data: Buffer) {
  if (!data.length) {
    throw new HttpError(400, "MASCOT_ASSET_EMPTY", "请选择要上传的星宠图片");
  }
  if (data.length > MASCOT_ASSET_BODY_LIMIT) {
    throw new HttpError(413, "MASCOT_ASSET_TOO_LARGE", "单个星宠图片不能超过 8MB");
  }
  const normalized = normalizedContentType(contentType);
  const format = IMAGE_FORMATS[normalized];
  if (!format || !format.matches(data)) {
    throw new HttpError(
      400,
      "MASCOT_ASSET_INVALID_FORMAT",
      "星宠图片只支持 WebP、GIF、PNG 或 JPEG",
    );
  }
  return format;
}

export async function storeMascotAsset(input: {
  uploadDir: string;
  petType: string;
  slot: MascotAssetSlot;
  contentType: string;
  data: Buffer;
}) {
  const format = imageFormat(input.contentType, input.data);
  const fingerprint = createHash("sha256")
    .update(input.data)
    .digest("hex")
    .slice(0, 16);
  const safePetType = input.petType.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const safeSlot = input.slot.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const fileName = `mascot-${safePetType}-${safeSlot}-${fingerprint}.${format.extension}`;
  const uploadDir = path.resolve(input.uploadDir);
  const filePath = path.join(uploadDir, fileName);

  await mkdir(uploadDir, { recursive: true });
  let created = true;
  try {
    await writeFile(filePath, input.data, { flag: "wx", mode: 0o644 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      created = false;
    } else {
      throw error;
    }
  }

  return {
    created,
    fileName,
    filePath,
    contentType: format.contentType,
    publicUrl: `${MASCOT_ASSET_PUBLIC_PATH}/${encodeURIComponent(fileName)}`,
  };
}
