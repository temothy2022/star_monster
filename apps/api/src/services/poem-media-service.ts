import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "../lib/http-error.js";

export const POEM_MEDIA_PUBLIC_PATH = "/poem-assets/v1/uploads";
export type PoemMediaKind = "image" | "audio";

export async function storeGeneratedPoemMedia(input: {
  uploadDir: string;
  poemId: string;
  kind: PoemMediaKind;
  data: Buffer;
}) {
  let storedData = input.data;
  let extension = "mp3";
  let contentType = "audio/mpeg";
  if (input.kind === "image") {
    try {
      storedData = await sharp(input.data, { failOn: "warning" })
        .rotate()
        .resize({
          width: 1024,
          height: 1024,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78, effort: 6, smartSubsample: true })
        .toBuffer();
    } catch {
      throw new HttpError(
        502,
        "MINIMAX_IMAGE_INVALID",
        "MiniMax 返回的图片无法处理，请稍后再试",
      );
    }
    extension = "webp";
    contentType = "image/webp";
  }

  const fingerprint = createHash("sha256")
    .update(storedData)
    .digest("hex")
    .slice(0, 16);
  const safePoemId = input.poemId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${safePoemId}-${input.kind}-${fingerprint}.${extension}`;
  const uploadDir = path.resolve(input.uploadDir);
  const filePath = path.join(uploadDir, fileName);
  await mkdir(uploadDir, { recursive: true });
  let created = true;
  try {
    await writeFile(filePath, storedData, { flag: "wx", mode: 0o644 });
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
    contentType,
    publicUrl: `${POEM_MEDIA_PUBLIC_PATH}/${encodeURIComponent(fileName)}`,
  };
}

export function resolvePoemMediaFile(uploadDir: string, fileName: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(fileName)) {
    throw new HttpError(404, "POEM_MEDIA_NOT_FOUND", "没有找到这个媒体文件");
  }
  return path.join(path.resolve(uploadDir), fileName);
}

export function contentTypeForPoemMedia(fileName: string) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  if (extension === "webp") return "image/webp";
  if (extension === "mp3") return "audio/mpeg";
  throw new HttpError(404, "POEM_MEDIA_NOT_FOUND", "没有找到这个媒体文件");
}
