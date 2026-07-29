import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/http-error.js";
import {
  contentTypeForHanziMedia,
  resolveHanziMediaFile,
  storeHanziMedia,
} from "../src/services/hanzi-media-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "hanzi-media-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("hanzi media storage", () => {
  it("stores a validated image with a fingerprinted public URL", async () => {
    const uploadDir = await temporaryDirectory();
    const data = await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: "#f47a3f",
      },
    })
      .jpeg()
      .toBuffer();

    const stored = await storeHanziMedia({
      uploadDir,
      characterId: "hanzi-u4e0b",
      kind: "image",
      contentType: "image/jpeg",
      data,
    });

    expect(stored.publicUrl).toMatch(
      /^\/hanzi-assets\/v1\/uploads\/hanzi-u4e0b-image-[a-f0-9]{16}\.webp$/,
    );
    const storedData = await readFile(stored.filePath);
    const metadata = await sharp(storedData).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(768);
    expect(metadata.height).toBe(576);
    expect(contentTypeForHanziMedia(stored.fileName)).toBe("image/webp");

    const repeated = await storeHanziMedia({
      uploadDir,
      characterId: "hanzi-u4e0b",
      kind: "image",
      contentType: "image/jpeg",
      data,
    });
    expect(repeated.created).toBe(false);
  });

  it("keeps word audio files position-specific", async () => {
    const uploadDir = await temporaryDirectory();
    const data = Buffer.from("ID3audio");

    const stored = await storeHanziMedia({
      uploadDir,
      characterId: "hanzi-u4e0b",
      kind: "word-audio",
      wordIndex: 1,
      contentType: "audio/mp3",
      data,
    });

    expect(stored.fileName).toContain("-word-02-");
    expect(stored.fileName.endsWith(".mp3")).toBe(true);
  });

  it("rejects a file whose bytes do not match its media type", async () => {
    const uploadDir = await temporaryDirectory();

    await expect(
      storeHanziMedia({
        uploadDir,
        characterId: "hanzi-u4e0b",
        kind: "character-audio",
        contentType: "audio/mpeg",
        data: Buffer.from("not an mp3"),
      }),
    ).rejects.toMatchObject({
      code: "HANZI_MEDIA_INVALID_FORMAT",
      statusCode: 400,
    });
  });

  it("does not resolve media paths with traversal characters", () => {
    expect(() =>
      resolveHanziMediaFile("/tmp/hanzi", "../secret.mp3"),
    ).toThrowError(HttpError);
  });
});
