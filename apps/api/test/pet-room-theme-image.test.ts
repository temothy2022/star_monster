import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  preparePetRoomThemeImage,
  storePetRoomThemeImages,
} from "../src/services/pet-room-theme-image-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function sourceImage(width = 1920, height = 1200) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 102, g: 184, b: 226 },
    },
  }).png().toBuffer();
}

describe("pet room theme image processing", () => {
  it("creates all four WebP variants at the room background dimensions", async () => {
    const data = await sourceImage();
    const prepared = await preparePetRoomThemeImage({ contentType: "image/png", data });
    const expected = {
      landscape: [1920, 1200],
      tablet: [1536, 2048],
      phone: [1080, 1920],
      preview: [480, 300],
    } as const;

    expect(prepared.source).toMatchObject({ width: 1920, height: 1200, format: "png" });
    for (const [name, dimensions] of Object.entries(expected)) {
      const metadata = await sharp(prepared.variants[name as keyof typeof expected]).metadata();
      expect([metadata.width, metadata.height, metadata.format]).toEqual([dimensions[0], dimensions[1], "webp"]);
    }
  });

  it("stores fingerprinted immutable files and returns public URLs", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "pet-room-theme-"));
    temporaryDirectories.push(directory);
    const stored = await storePetRoomThemeImages({
      uploadDir: directory,
      themeKey: "custom-test",
      contentType: "image/png",
      data: await sourceImage(),
    });

    expect(stored.urls.landscape).toMatch(/^\/poem-assets\/v1\/uploads\/room-theme-custom-test-[a-f0-9]{16}-landscape\.webp$/);
    expect(stored.createdPaths).toHaveLength(4);
    expect((await readFile(stored.files.preview.filePath)).subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(stored.outputBytes).toBeGreaterThan(0);
  });

  it("rejects images smaller than the required 1920 by 1200 source", async () => {
    await expect(preparePetRoomThemeImage({
      contentType: "image/png",
      data: await sourceImage(1280, 800),
    })).rejects.toMatchObject({ code: "PET_ROOM_THEME_IMAGE_SIZE_INVALID" });
  });
});
