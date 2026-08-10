import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  childAvatarFileName,
  storeChildAvatar,
} from "../src/services/child-avatar-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("child avatar storage", () => {
  it("crops and compresses uploaded images to a fingerprinted square webp", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "child-avatar-"));
    temporaryDirectories.push(uploadDir);
    const data = await sharp({
      create: {
        width: 960,
        height: 640,
        channels: 3,
        background: "#f6b26b",
      },
    }).jpeg().toBuffer();

    const stored = await storeChildAvatar({ uploadDir, childId: "child-1", data });
    const metadata = await sharp(await readFile(stored.filePath)).metadata();

    expect(stored.publicUrl).toMatch(
      /^\/poem-assets\/v1\/uploads\/child-avatar-child-1-[a-f0-9]{16}\.webp$/,
    );
    expect(metadata).toMatchObject({ format: "webp", width: 384, height: 384 });
    expect(childAvatarFileName(stored.publicUrl)).toBe(stored.fileName);
    expect(childAvatarFileName("/poem-assets/v1/uploads/another-file.webp")).toBeNull();
  });
});
