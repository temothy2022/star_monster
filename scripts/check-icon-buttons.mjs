import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const APP_ROOT = path.resolve("apps");
const ICON_ONLY_TEXT = new Set(["+", "＋", "-", "−", "×", "✕", "✖", "≡", "‹", "›", "←", "→", "↑", "↓", "⋮", "…"]);
const ICON_ONLY_ELEMENT_PATTERN = /<(span|b|i)\b[^>]*>\s*([+＋\-−×✕✖≡‹›←→↑↓⋮…])\s*<\/\1>/g;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filePath);
    return entry.isFile() && filePath.endsWith(".tsx") ? [filePath] : [];
  }));
  return nested.flat();
}

const failures = [];
for (const filePath of await sourceFiles(APP_ROOT)) {
  const source = await readFile(filePath, "utf8");
  for (const match of source.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    const buttonBody = match[1];
    const visibleText = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^{}]*\}/g, "")
      .trim();
    const line = source.slice(0, match.index).split("\n").length;

    if (ICON_ONLY_TEXT.has(visibleText)) {
      failures.push(`${path.relative(process.cwd(), filePath)}:${line} uses the character icon ${JSON.stringify(visibleText)}`);
      continue;
    }

    const embeddedCharacterIcon = [...buttonBody.matchAll(ICON_ONLY_ELEMENT_PATTERN)][0];
    if (embeddedCharacterIcon && !embeddedCharacterIcon[0].includes("data-numeric-sign")) {
      failures.push(`${path.relative(process.cwd(), filePath)}:${line} embeds the character icon ${JSON.stringify(embeddedCharacterIcon[2])}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Character-only icon buttons are not allowed. Use a shared image icon asset instead:\n");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Icon button audit passed.");
