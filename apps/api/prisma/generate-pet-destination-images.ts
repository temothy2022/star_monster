import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  EXPANDED_PET_DESTINATIONS,
  type PetDestinationScene,
} from "./pet-destination-expansion.js";

const OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/assets/static/pet-assets/v1/destinations/expanded",
);
const force = process.argv.includes("--force");

const PALETTES = [
  ["#9ddcf8", "#fff0b6", "#4f9e77", "#23618a"],
  ["#b9e6d3", "#fff4d0", "#ef8b72", "#3d6f6d"],
  ["#c8c5ff", "#ffe0b5", "#6f91cc", "#4b4b80"],
  ["#ffd2c7", "#fff3c2", "#70af86", "#6f4f68"],
  ["#a9e1e8", "#fde1a8", "#d87b62", "#346b7b"],
] as const;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function seedNumber(value: string) {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

function commonClouds(accent: string) {
  return `
    <g fill="#fff" opacity=".88">
      <ellipse cx="145" cy="120" rx="82" ry="27"/><circle cx="115" cy="98" r="37"/><circle cx="165" cy="91" r="46"/>
      <ellipse cx="748" cy="152" rx="94" ry="30"/><circle cx="710" cy="126" r="37"/><circle cx="770" cy="116" r="50"/>
    </g>
    <g fill="${accent}" opacity=".16"><circle cx="78" cy="225" r="18"/><circle cx="820" cy="258" r="13"/></g>`;
}

function sceneMarkup(scene: PetDestinationScene, primary: string, ink: string) {
  const roof = `<path d="M285 345 450 218 615 345Z" fill="${primary}"/><rect x="315" y="338" width="270" height="164" rx="10" fill="#fff3d6"/><rect x="410" y="386" width="80" height="116" rx="36" fill="${ink}" opacity=".76"/><rect x="342" y="375" width="44" height="52" rx="8" fill="#8fd1ef"/><rect x="514" y="375" width="44" height="52" rx="8" fill="#8fd1ef"/>`;
  switch (scene) {
    case "mountain":
      return `<path d="M70 510 300 205 495 510Z" fill="${ink}" opacity=".86"/><path d="m300 205-78 104 56-21 40 22 39-22Z" fill="#fff"/><path d="M345 510 610 245 835 510Z" fill="${primary}"/><path d="m610 245-70 70 58-19 32 19 39-21Z" fill="#fff"/>`;
    case "lake":
      return `<path d="M0 360 Q190 305 360 365T900 355V520H0Z" fill="${primary}"/><path d="M0 415 Q180 365 360 425T900 410V525H0Z" fill="#3e91bf" opacity=".82"/><path d="M160 352 310 214 440 352Z" fill="${ink}" opacity=".72"/><path d="M510 348 650 230 780 348Z" fill="${ink}" opacity=".55"/>`;
    case "ocean":
    case "island":
      return `<path d="M0 338 Q105 300 210 338T420 338T630 338T900 338V530H0Z" fill="#48a9d6"/><path d="M0 396 Q105 358 210 396T420 396T630 396T900 396" fill="none" stroke="#fff" stroke-width="14" opacity=".65"/><ellipse cx="530" cy="340" rx="155" ry="58" fill="#f3d084"/><path d="M535 330q-9-115 31-174M535 250q-72-58-122-9M551 226q66-67 125-37" fill="none" stroke="${ink}" stroke-width="20" stroke-linecap="round"/><path d="M530 170q-20 70 8 160" stroke="${ink}" stroke-width="10" fill="none"/>`;
    case "forest":
    case "grassland":
      return `<path d="M0 405 Q180 330 365 402T900 385V525H0Z" fill="${primary}"/><g fill="${ink}"><path d="m190 410 75-188 74 188Z"/><path d="m360 420 96-238 97 238Z"/><path d="m600 410 72-180 72 180Z"/></g><g fill="#8b5e45"><rect x="253" y="383" width="25" height="93"/><rect x="444" y="389" width="27" height="95"/><rect x="660" y="382" width="24" height="94"/></g>`;
    case "garden":
      return `<path d="M0 418 Q180 330 360 404T900 390V525H0Z" fill="${primary}"/><g fill="#fff4d0" stroke="${ink}" stroke-width="8"><circle cx="260" cy="360" r="42"/><circle cx="450" cy="330" r="52"/><circle cx="650" cy="372" r="45"/></g><g fill="#f18b72"><circle cx="260" cy="360" r="16"/><circle cx="450" cy="330" r="19"/><circle cx="650" cy="372" r="17"/></g><path d="M260 405v78M450 382v102M650 417v66" stroke="${ink}" stroke-width="13"/>`;
    case "waterfall":
      return `<path d="M0 255 285 205 360 525H0Z" fill="${ink}"/><path d="M900 220 625 210 550 525H900Z" fill="${primary}"/><path d="M358 188h270l-35 337H330Z" fill="#d9f6ff"/><path d="M430 205q-30 155 8 312M545 210q38 142-8 307" fill="none" stroke="#fff" stroke-width="24" opacity=".8"/>`;
    case "desert":
      return `<path d="M0 405 Q185 285 360 398T900 365V525H0Z" fill="#e8b65c"/><path d="M0 455 Q240 355 455 460T900 420V530H0Z" fill="#cf8b4e"/><path d="M345 405 455 220 570 405Z" fill="${primary}"/><path d="M455 220 560 405h75L535 245Z" fill="${ink}" opacity=".35"/>`;
    case "ice":
      return `<path d="M0 365 Q210 325 430 375T900 350V525H0Z" fill="#76bddb"/><path d="m120 390 155-220 120 220Z" fill="#ecfbff"/><path d="m520 385 120-190 155 190Z" fill="#d9f4ff"/><path d="m275 170-54 77 63-12 48 24Z" fill="#fff"/>`;
    case "wildlife":
      return `<path d="M0 418 Q210 335 430 405T900 395V525H0Z" fill="${primary}"/><g fill="${ink}"><circle cx="450" cy="325" r="98"/><circle cx="375" cy="250" r="38"/><circle cx="525" cy="250" r="38"/></g><ellipse cx="450" cy="355" rx="62" ry="47" fill="#fff0d2"/><circle cx="417" cy="315" r="13" fill="#fff"/><circle cx="483" cy="315" r="13" fill="#fff"/><circle cx="450" cy="346" r="15" fill="#5b433a"/>`;
    case "science":
      return `<path d="M0 430 Q250 355 450 420T900 395V525H0Z" fill="${primary}"/><path d="M450 155c85 70 105 180 30 310h-60c-75-130-55-240 30-310Z" fill="#fff" stroke="${ink}" stroke-width="14"/><circle cx="450" cy="285" r="38" fill="#71c7e8"/><path d="m420 435-70 62 87-16M480 435l70 62-87-16" fill="${ink}"/><path d="M420 462h60l-30 72Z" fill="#f18b72"/>`;
    case "tower":
    case "city":
      return `<path d="M0 430 Q220 350 420 425T900 405V525H0Z" fill="${primary}"/><g fill="${ink}"><rect x="180" y="302" width="130" height="205" rx="8"/><rect x="350" y="235" width="165" height="272" rx="8"/><rect x="555" y="275" width="145" height="232" rx="8"/><path d="m432 112 42 123h-84Z"/></g><g fill="#ffd982"><rect x="208" y="338" width="24" height="28"/><rect x="258" y="338" width="24" height="28"/><rect x="388" y="280" width="27" height="31"/><rect x="452" y="280" width="27" height="31"/><rect x="590" y="315" width="27" height="31"/><rect x="645" y="315" width="27" height="31"/></g>`;
    case "museum":
    case "palace":
    case "temple":
    case "ancient-town":
    default:
      return `${roof}<path d="M255 347h390" stroke="${ink}" stroke-width="15" stroke-linecap="round"/><path d="M280 325q170-62 340 0" fill="none" stroke="#fff1c8" stroke-width="12" opacity=".85"/>`;
  }
}

function postcardSvg(input: typeof EXPANDED_PET_DESTINATIONS[number]) {
  const seed = seedNumber(input.slug);
  const palette = PALETTES[seed % PALETTES.length]!;
  const [sky, sun, primary, ink] = palette;
  const titleSize = input.name.length > 11 ? 40 : input.name.length > 8 ? 46 : 54;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="675" viewBox="0 0 900 675">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="${sun}"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#28455e" flood-opacity=".18"/></filter>
    </defs>
    <rect width="900" height="675" rx="34" fill="url(#sky)"/>
    <circle cx="${705 + seed % 65}" cy="${82 + seed % 38}" r="56" fill="#fff7b9" opacity=".96"/>
    ${commonClouds(ink)}
    <g filter="url(#shadow)">${sceneMarkup(input.scene, primary, ink)}</g>
    <rect x="34" y="500" width="832" height="143" rx="28" fill="#fffdf7" opacity=".96"/>
    <circle cx="92" cy="571" r="34" fill="${primary}"/><path d="m92 548 7 15 17 2-12 12 3 17-15-8-15 8 3-17-12-12 17-2Z" fill="#fff7ca"/>
    <text x="145" y="560" fill="${ink}" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="${titleSize}" font-weight="800">${escapeXml(input.name)}</text>
    <text x="147" y="610" fill="#77655a" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="25" font-weight="600">${escapeXml(input.city)} · ${escapeXml(input.country)}</text>
    <text x="790" y="610" fill="${primary}" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="22" font-weight="800" text-anchor="end">星宠旅行</text>
  </svg>`;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  let generated = 0;
  for (const [index, destination] of EXPANDED_PET_DESTINATIONS.entries()) {
    const filePath = path.join(OUTPUT_DIR, `${destination.slug}.webp`);
    if (!force) {
      try {
        await sharp(filePath).metadata();
        continue;
      } catch {
        // Generate missing or unreadable images below.
      }
    }
    const image = await sharp(Buffer.from(postcardSvg(destination)))
      .webp({ quality: 80, effort: 6, smartSubsample: true })
      .toBuffer();
    await writeFile(filePath, image, { mode: 0o644 });
    generated += 1;
    if ((index + 1) % 25 === 0) console.log(`Prepared ${index + 1}/${EXPANDED_PET_DESTINATIONS.length} destination cards.`);
  }
  console.log(`Destination postcard images ready: ${generated} generated, ${EXPANDED_PET_DESTINATIONS.length} total.`);
}

await main();
