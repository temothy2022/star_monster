import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

const requireFromApi = createRequire(resolve("apps/api/package.json"));
const sharp = requireFromApi("sharp");

const [inputPath, petKey] = process.argv.slice(2);

if (!inputPath || !petKey) {
  console.error("Usage: node scripts/process-pet-state-assets.mjs <sheet.png> <pet-key>");
  process.exit(1);
}

const states = ["hungry", "eating", "drinking", "travel"];
const outputDir = resolve("apps/design-lab/src/assets/mascots/states");
const tempDir = resolve(".tmp/pet-state-assets", `${petKey}-${Date.now()}`);
const codexHome = process.env.CODEX_HOME || resolve(homedir(), ".codex");
const chromaScript = resolve(codexHome, "skills/.system/imagegen/scripts/remove_chroma_key.py");

await mkdir(outputDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

const metadata = await sharp(inputPath).metadata();
if (!metadata.width || !metadata.height) {
  throw new Error(`Unable to read image dimensions: ${basename(inputPath)}`);
}

const panelWidth = Math.floor(metadata.width / 2);
const panelHeight = Math.floor(metadata.height / 2);

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

try {
  for (const [index, state] of states.entries()) {
    const left = (index % 2) * panelWidth;
    const top = Math.floor(index / 2) * panelHeight;
    const cropPath = resolve(tempDir, `${state}-crop.png`);
    const transparentPath = resolve(tempDir, `${state}-transparent.png`);
    const outputPath = resolve(outputDir, `${petKey}-${state}.webp`);

    await sharp(inputPath)
      .extract({ left, top, width: panelWidth, height: panelHeight })
      .png()
      .toFile(cropPath);

    await run("python3", [
      chromaScript,
      "--input", cropPath,
      "--out", transparentPath,
      "--auto-key", "border",
      "--soft-matte",
      "--transparent-threshold", "12",
      "--opaque-threshold", "175",
      "--edge-feather", "0.6",
      "--despill",
      "--force",
    ]);

    await sharp(transparentPath)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({ width: 560, height: 560, fit: "contain" })
      .webp({ quality: 88, alphaQuality: 100, effort: 6 })
      .toFile(outputPath);

    console.log(outputPath);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
