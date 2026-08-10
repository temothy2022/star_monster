import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  preparePetRoomThemeAnimation,
  storePetRoomThemeAnimation,
} from "../src/services/pet-room-theme-animation-service.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function transparentPetImage() {
  return sharp({
    create: {
      width: 720,
      height: 720,
      channels: 4,
      background: { r: 255, g: 180, b: 40, alpha: 0.72 },
    },
  }).png().toBuffer();
}

describe("pet room mascot animation processing", () => {
  it("validates transparent artwork without converting or recompressing it", async () => {
    const source = await transparentPetImage();
    const prepared = await preparePetRoomThemeAnimation({
      contentType: "image/png",
      data: source,
    });
    const metadata = await sharp(prepared.output).metadata();

    expect(prepared.source).toMatchObject({ width: 720, height: 720, frameCount: 1, format: "png" });
    expect(prepared.processed).toBe(false);
    expect(prepared.output.equals(source)).toBe(true);
    expect(metadata).toMatchObject({ width: 720, height: 720, format: "png", hasAlpha: true });
  });

  it("stores a fingerprinted room and pet specific animation file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "pet-room-animation-"));
    temporaryDirectories.push(directory);
    const stored = await storePetRoomThemeAnimation({
      uploadDir: directory,
      themeKey: "cloud-castle",
      petType: "TUANTUAN",
      contentType: "image/png",
      data: await transparentPetImage(),
    });

    expect(stored.publicUrl).toMatch(/^\/poem-assets\/v1\/uploads\/room-theme-cloud-castle-tuantuan-[a-f0-9]{16}-animation\.png$/);
    expect((await readFile(stored.filePath)).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(stored.outputBytes).toBeGreaterThan(0);
  });

  it("rejects unsupported animation file types", async () => {
    await expect(preparePetRoomThemeAnimation({
      contentType: "image/jpeg",
      data: Buffer.from([0xff, 0xd8, 0xff]),
    })).rejects.toMatchObject({ code: "PET_ROOM_THEME_ANIMATION_INVALID_FORMAT" });
  });
});
