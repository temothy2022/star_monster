import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  contentTypeForPoemMedia,
  storeGeneratedPoemMedia,
} from "../src/services/poem-media-service.js";

describe("poem media storage", () => {
  it("compresses generated images to webp", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "poem-media-"));
    const image = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: "#f7c76d",
      },
    })
      .jpeg()
      .toBuffer();

    const stored = await storeGeneratedPoemMedia({
      uploadDir,
      poemId: "poem-1",
      kind: "image",
      data: image,
    });

    expect(stored.publicUrl).toMatch(
      /^\/poem-assets\/v1\/uploads\/poem-1-image-[a-f0-9]{16}\.webp$/,
    );
    expect(contentTypeForPoemMedia(stored.fileName)).toBe("image/webp");
    expect((await sharp(await readFile(stored.filePath)).metadata()).format).toBe(
      "webp",
    );
  });

  it("stores generated mp3 audio with a content fingerprint", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "poem-media-"));
    const stored = await storeGeneratedPoemMedia({
      uploadDir,
      poemId: "poem-2",
      kind: "audio",
      data: Buffer.from("generated-mp3"),
    });

    expect(stored.publicUrl).toMatch(
      /^\/poem-assets\/v1\/uploads\/poem-2-audio-[a-f0-9]{16}\.mp3$/,
    );
    expect(contentTypeForPoemMedia(stored.fileName)).toBe("audio/mpeg");
    expect((await readFile(stored.filePath)).toString()).toBe("generated-mp3");
  });
});
