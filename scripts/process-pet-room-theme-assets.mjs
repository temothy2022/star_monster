import { access, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const requireFromDesignLab = createRequire(resolve("apps/design-lab/package.json"));
const sharp = requireFromDesignLab("sharp");

const sourceRoot = resolve(process.argv[2] ?? "tmp/imagegen-room-themes");
const outputRoot = resolve("packages/assets/static/pet-assets/v1/room-themes");
const tempRoot = resolve(".tmp/pet-room-theme-processing");
const codexHome = process.env.CODEX_HOME || resolve(homedir(), ".codex");
const chromaScript = resolve(codexHome, "skills/.system/imagegen/scripts/remove_chroma_key.py");

const themes = [
  { key: "sunny-garden", background: resolve("packages/assets/static/pet-assets/v1/scenes/pet-room.webp"), ambience: ["clouds", "birds"] },
  { key: "cloud-castle", ambience: ["clouds", "balloon"] },
  { key: "forest-treehouse", ambience: ["leaves", "fireflies"] },
  { key: "underwater-observatory", ambience: ["bubbles", "fish"] },
  { key: "cherry-courtyard", ambience: ["petals", "butterflies"] },
  { key: "snow-lodge", ambience: ["snowflakes", "warm-sparkles"] },
  { key: "starlight-camp", ambience: ["stars", "comet"] },
  { key: "lunar-station", ambience: ["planets", "satellite"] },
  { key: "osaka-castle", ambience: [], backgroundPosition: sharp.gravity.west },
  { key: "great-wall", ambience: [], backgroundPosition: sharp.gravity.west },
  { key: "basketball-court", ambience: [], backgroundPosition: sharp.gravity.west },
  { key: "space-guardian", ambience: [], backgroundPosition: sharp.gravity.center },
];

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

async function writeBackgroundVariants(source, outputDir, backgroundPosition = sharp.strategy.attention) {
  const common = { fit: "cover", position: backgroundPosition, withoutEnlargement: false };
  await Promise.all([
    sharp(source).resize(1920, 1200, common).webp({ quality: 78, effort: 6, smartSubsample: true }).toFile(resolve(outputDir, "background-landscape.webp")),
    sharp(source).resize(1536, 2048, common).webp({ quality: 76, effort: 6, smartSubsample: true }).toFile(resolve(outputDir, "background-tablet.webp")),
    sharp(source).resize(1080, 1920, common).webp({ quality: 75, effort: 6, smartSubsample: true }).toFile(resolve(outputDir, "background-phone.webp")),
    sharp(source).resize(480, 300, common).webp({ quality: 72, effort: 6, smartSubsample: true }).toFile(resolve(outputDir, "preview.webp")),
  ]);
}

async function writeAmbienceVariants(theme, outputDir) {
  if (theme.ambience.length === 0) return;
  const source = resolve(sourceRoot, `${theme.key}-ambient.png`);
  try {
    await access(source);
  } catch {
    console.warn(`Skipping ambience for ${theme.key}; source not found: ${source}`);
    return;
  }
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Missing dimensions for ${source}`);
  const panelWidth = Math.floor(metadata.width / 2);
  for (const [index, name] of theme.ambience.entries()) {
    const cropPath = resolve(tempRoot, `${theme.key}-${name}-crop.png`);
    const transparentPath = resolve(tempRoot, `${theme.key}-${name}-transparent.png`);
    await sharp(source)
      .extract({ left: index * panelWidth, top: 0, width: panelWidth, height: metadata.height })
      .png()
      .toFile(cropPath);
    await run("python3", [
      chromaScript,
      "--input", cropPath,
      "--out", transparentPath,
      "--auto-key", "border",
      "--soft-matte",
      "--transparent-threshold", "12",
      "--opaque-threshold", "220",
      "--despill",
    ]);
    await sharp(transparentPath)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: true })
      .webp({ quality: 80, alphaQuality: 90, effort: 6 })
      .toFile(resolve(outputDir, `${name}.webp`));
  }
}

await rm(tempRoot, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });

try {
  for (const theme of themes) {
    const outputDir = resolve(outputRoot, theme.key);
    const background = theme.background ?? resolve(sourceRoot, `${theme.key}-background.png`);
    if (!theme.background) {
      try {
        await access(background);
      } catch {
        console.warn(`Skipping ${theme.key}; source not found: ${background}`);
        continue;
      }
    }
    await mkdir(outputDir, { recursive: true });
    await writeBackgroundVariants(background, outputDir, theme.backgroundPosition);
    await writeAmbienceVariants(theme, outputDir);
    console.log(`Prepared ${theme.key}`);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
