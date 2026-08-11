import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error("Usage: tsx process-generated-postcard.ts <input> <output>");
}

await mkdir(path.dirname(outputPath), { recursive: true });
await sharp(inputPath)
  .resize(900, 675, { fit: "cover", position: "attention" })
  .webp({ quality: 84, effort: 6, smartSubsample: true })
  .toFile(outputPath);

const metadata = await sharp(outputPath).metadata();
console.log(JSON.stringify({
  outputPath,
  width: metadata.width,
  height: metadata.height,
  format: metadata.format,
}));
