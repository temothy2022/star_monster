import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const input = args.input;
const output = path.resolve(args.output ?? "work/hanzi-assets-input.json");

if (!input) {
  console.error("Missing --input. Example: node scripts/prepare-hanzi-assets-input.mjs --input /path/to/一年级生字710.txt");
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function uniqueHanzi(text) {
  const seen = new Set();
  return Array.from(text)
    .filter((character) => /\p{Script=Han}/u.test(character))
    .filter((character) => {
      if (seen.has(character)) return false;
      seen.add(character);
      return true;
    });
}

function idFor(character) {
  return `hanzi-u${character.codePointAt(0)?.toString(16) ?? "unknown"}`;
}

const source = await readFile(path.resolve(input), "utf8");
const characters = uniqueHanzi(source);
const rows = characters.map((character, index) => ({
  id: idFor(character),
  character,
  pinyin: "",
  meaning: "",
  shapeHint: "",
  imageDescription: "",
  sentence: "",
  words: [],
  sortOrder: (index + 1) * 10,
  isEnabled: true,
}));

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(rows, null, 2)}\n`);

console.log(`Prepared ${rows.length} unique hanzi rows: ${output}`);
console.log("Next: fill pinyin, meaning, shapeHint, imageDescription, sentence, and words before generating assets.");
