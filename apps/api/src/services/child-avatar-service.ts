import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "../lib/http-error.js";

export const CHILD_AVATAR_BODY_LIMIT = 5 * 1024 * 1024;
export const CHILD_AVATAR_PUBLIC_PATH = "/poem-assets/v1/uploads";

export async function storeChildAvatar(input: {
  uploadDir: string;
  childId: string;
  data: Buffer;
}) {
  if (!input.data.length) {
    throw new HttpError(400, "CHILD_AVATAR_EMPTY", "请选择孩子头像");
  }
  if (input.data.length > CHILD_AVATAR_BODY_LIMIT) {
    throw new HttpError(413, "CHILD_AVATAR_TOO_LARGE", "头像文件不能超过 5MB");
  }

  let output: Buffer;
  try {
    output = await sharp(input.data, { failOn: "warning", limitInputPixels: 24_000_000 })
      .rotate()
      .resize(384, 384, { fit: "cover", position: "attention", withoutEnlargement: false })
      .webp({ quality: 78, effort: 6, smartSubsample: true })
      .toBuffer();
  } catch {
    throw new HttpError(400, "CHILD_AVATAR_INVALID", "头像图片无法识别，请选择 JPG、PNG 或 WebP 图片");
  }

  const fingerprint = createHash("sha256").update(output).digest("hex").slice(0, 16);
  const safeChildId = input.childId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `child-avatar-${safeChildId}-${fingerprint}.webp`;
  const uploadDir = path.resolve(input.uploadDir);
  const filePath = path.join(uploadDir, fileName);
  await mkdir(uploadDir, { recursive: true });
  let created = true;
  try {
    await writeFile(filePath, output, { flag: "wx", mode: 0o644 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") created = false;
    else throw error;
  }
  return {
    created,
    fileName,
    filePath,
    publicUrl: `${CHILD_AVATAR_PUBLIC_PATH}/${encodeURIComponent(fileName)}`,
  };
}

export function childAvatarFileName(url: string | null | undefined) {
  if (!url) return null;
  const fileName = path.basename(url);
  return /^child-avatar-[a-zA-Z0-9_-]+-[a-f0-9]{16}\.webp$/.test(fileName)
    ? fileName
    : null;
}
