import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [inputPath, outputPath, rawSize = "192"] = process.argv.slice(2);
const size = Number.parseInt(rawSize, 10);

if (!inputPath || !outputPath || !Number.isInteger(size) || size < 32 || size > 1024) {
  throw new Error("Usage: tsx process-generated-ui-icon.ts <input> <output> [size]");
}

const source = sharp(inputPath).ensureAlpha();
const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
const pixelCount = info.width * info.height;
const background = new Uint8Array(pixelCount);
const queued = new Uint8Array(pixelCount);
const queue = new Int32Array(pixelCount);
let queueHead = 0;
let queueTail = 0;

function isGeneratedBackdrop(pixelIndex: number) {
  const offset = pixelIndex * info.channels;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  return high - low <= 20 && (red + green + blue) / 3 >= 178;
}

function enqueue(pixelIndex: number) {
  if (queued[pixelIndex] || !isGeneratedBackdrop(pixelIndex)) return;
  queued[pixelIndex] = 1;
  queue[queueTail++] = pixelIndex;
}

for (let x = 0; x < info.width; x += 1) {
  enqueue(x);
  enqueue((info.height - 1) * info.width + x);
}
for (let y = 0; y < info.height; y += 1) {
  enqueue(y * info.width);
  enqueue(y * info.width + info.width - 1);
}

while (queueHead < queueTail) {
  const pixelIndex = queue[queueHead++];
  background[pixelIndex] = 1;
  const x = pixelIndex % info.width;
  const y = Math.floor(pixelIndex / info.width);
  if (x > 0) enqueue(pixelIndex - 1);
  if (x + 1 < info.width) enqueue(pixelIndex + 1);
  if (y > 0) enqueue(pixelIndex - info.width);
  if (y + 1 < info.height) enqueue(pixelIndex + info.width);
}

for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
  if (!background[pixelIndex]) continue;
  data[pixelIndex * info.channels + 3] = 0;
}

const resized = await sharp(data, { raw: info })
  .resize(size, size, { fit: "contain", withoutEnlargement: true })
  .raw()
  .toBuffer({ resolveWithObject: true });
const resizedPixels = resized.info.width * resized.info.height;
const visited = new Uint8Array(resizedPixels);
const componentStack = new Int32Array(resizedPixels);

for (let start = 0; start < resizedPixels; start += 1) {
  if (visited[start] || resized.data[start * resized.info.channels + 3] <= 8) continue;
  let stackSize = 0;
  let componentSize = 0;
  let hasVisualColor = false;
  const component: number[] = [];
  componentStack[stackSize++] = start;
  visited[start] = 1;
  while (stackSize > 0) {
    const pixelIndex = componentStack[--stackSize];
    component.push(pixelIndex);
    componentSize += 1;
    const offset = pixelIndex * resized.info.channels;
    const red = resized.data[offset];
    const green = resized.data[offset + 1];
    const blue = resized.data[offset + 2];
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 22 || (red + green + blue) / 3 < 165) {
      hasVisualColor = true;
    }
    const x = pixelIndex % resized.info.width;
    const y = Math.floor(pixelIndex / resized.info.width);
    const neighbors = [
      x > 0 ? pixelIndex - 1 : -1,
      x + 1 < resized.info.width ? pixelIndex + 1 : -1,
      y > 0 ? pixelIndex - resized.info.width : -1,
      y + 1 < resized.info.height ? pixelIndex + resized.info.width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor] || resized.data[neighbor * resized.info.channels + 3] <= 8) continue;
      visited[neighbor] = 1;
      componentStack[stackSize++] = neighbor;
    }
  }
  if (componentSize >= 24 || hasVisualColor) continue;
  for (const pixelIndex of component) resized.data[pixelIndex * resized.info.channels + 3] = 0;
}

await mkdir(path.dirname(outputPath), { recursive: true });
await sharp(resized.data, { raw: resized.info })
  .webp({ quality: 88, alphaQuality: 100, effort: 6 })
  .toFile(outputPath);

const metadata = await sharp(outputPath).metadata();
console.log(JSON.stringify({
  inputPath,
  outputPath,
  width: metadata.width,
  height: metadata.height,
  hasAlpha: metadata.hasAlpha,
}));
