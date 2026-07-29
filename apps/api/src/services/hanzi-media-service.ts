import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "../lib/http-error.js";

export const HANZI_MEDIA_BODY_LIMIT = 5 * 1024 * 1024;
export const HANZI_MEDIA_PUBLIC_PATH = "/hanzi-assets/v1/uploads";

export type HanziMediaKind =
  | "image"
  | "character-audio"
  | "sentence-audio"
  | "word-audio";

type MediaFormat = {
  extension: string;
  contentType: string;
  matches: (data: Buffer) => boolean;
};

const MEDIA_FORMATS: Record<string, MediaFormat> = {
  "image/jpeg": {
    extension: "jpeg",
    contentType: "image/jpeg",
    matches: (data) =>
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff,
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
  "image/webp": {
    extension: "webp",
    contentType: "image/webp",
    matches: (data) =>
      data.length >= 12 &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP",
  },
  "audio/mpeg": {
    extension: "mp3",
    contentType: "audio/mpeg",
    matches: (data) =>
      data.length >= 3 &&
      (data.subarray(0, 3).toString("ascii") === "ID3" ||
        (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)),
  },
  "audio/mp4": {
    extension: "m4a",
    contentType: "audio/mp4",
    matches: (data) =>
      data.length >= 12 &&
      data.subarray(4, 8).toString("ascii") === "ftyp",
  },
  "audio/wav": {
    extension: "wav",
    contentType: "audio/wav",
    matches: (data) =>
      data.length >= 12 &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WAVE",
  },
};

const CONTENT_TYPE_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-wav": "audio/wav",
};

function normalizedContentType(value: string) {
  const contentType = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return CONTENT_TYPE_ALIASES[contentType] ?? contentType;
}

function mediaFormat(kind: HanziMediaKind, contentType: string, data: Buffer) {
  if (!data.length) {
    throw new HttpError(400, "HANZI_MEDIA_EMPTY", "请选择要上传的媒体文件");
  }
  if (data.length > HANZI_MEDIA_BODY_LIMIT) {
    throw new HttpError(
      413,
      "HANZI_MEDIA_TOO_LARGE",
      "单个媒体文件不能超过 5MB",
    );
  }

  const normalized = normalizedContentType(contentType);
  const format = MEDIA_FORMATS[normalized];
  const acceptsType =
    kind === "image"
      ? normalized.startsWith("image/")
      : normalized.startsWith("audio/");
  if (!format || !acceptsType || !format.matches(data)) {
    throw new HttpError(
      400,
      "HANZI_MEDIA_INVALID_FORMAT",
      kind === "image"
        ? "图片只支持 JPEG、PNG 或 WebP"
        : "音频只支持 MP3、M4A 或 WAV",
    );
  }
  return format;
}

export async function storeHanziMedia(input: {
  uploadDir: string;
  characterId: string;
  kind: HanziMediaKind;
  wordIndex?: number;
  contentType: string;
  data: Buffer;
}) {
  let format = mediaFormat(input.kind, input.contentType, input.data);
  let storedData = input.data;
  if (input.kind === "image") {
    try {
      storedData = await sharp(input.data)
        .rotate()
        .resize({
          width: 768,
          height: 768,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78, smartSubsample: true })
        .toBuffer();
      format = MEDIA_FORMATS["image/webp"];
    } catch {
      throw new HttpError(
        400,
        "HANZI_MEDIA_INVALID_FORMAT",
        "图片文件已经损坏或无法读取",
      );
    }
  }
  const fingerprint = createHash("sha256")
    .update(storedData)
    .digest("hex")
    .slice(0, 16);
  const safeCharacterId = input.characterId.replace(/[^a-zA-Z0-9_-]/g, "");
  const mediaLabel =
    input.kind === "word-audio"
      ? `word-${String((input.wordIndex ?? 0) + 1).padStart(2, "0")}`
      : input.kind;
  const fileName = `${safeCharacterId}-${mediaLabel}-${fingerprint}.${format.extension}`;
  const uploadDir = path.resolve(input.uploadDir);
  const finalPath = path.join(uploadDir, fileName);

  await mkdir(uploadDir, { recursive: true });
  let created = true;
  try {
    await writeFile(finalPath, storedData, { flag: "wx", mode: 0o644 });
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
    filePath: finalPath,
    contentType: format.contentType,
    publicUrl: `${HANZI_MEDIA_PUBLIC_PATH}/${encodeURIComponent(fileName)}`,
  };
}

export function resolveHanziMediaFile(uploadDir: string, fileName: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(fileName)) {
    throw new HttpError(404, "HANZI_MEDIA_NOT_FOUND", "没有找到这个媒体文件");
  }
  return path.join(path.resolve(uploadDir), fileName);
}

export function contentTypeForHanziMedia(fileName: string) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  const format = Object.values(MEDIA_FORMATS).find(
    (candidate) => candidate.extension === extension,
  );
  if (!format) {
    throw new HttpError(404, "HANZI_MEDIA_NOT_FOUND", "没有找到这个媒体文件");
  }
  return format.contentType;
}
