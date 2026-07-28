import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const inputFile = path.resolve(args.input ?? "work/hanzi-assets-input.json");
const contentFile = path.resolve(args.content ?? "work/hanzi-content-reviewed.tsv");
const outputFile = path.resolve(args.output ?? inputFile);
const PINYIN_OVERRIDES = {
  地: "dì",
  只: "zhī",
  长: "cháng",
  得: "de",
  朝: "zhāo",
  闷: "mēn",
  背: "bēi",
  干: "gān",
  斗: "dǒu",
};

const input = JSON.parse(await readFile(inputFile, "utf8"));
const reviewed = parseReviewedContent(await readFile(contentFile, "utf8"));

if (!Array.isArray(input)) {
  throw new Error("Hanzi input JSON must be an array.");
}
if (input.length !== reviewed.length) {
  throw new Error(`Row count mismatch: input=${input.length}, reviewed=${reviewed.length}.`);
}

const transliterations = transliterateWords(reviewed.map((item) => item.words[0]));
const merged = input.map((item, index) => {
  const review = reviewed[index];
  const character = String(item.character ?? "").trim();
  if (character !== review.character) {
    throw new Error(`Character order mismatch at row ${index + 1}: input=${character}, reviewed=${review.character}.`);
  }
  const pinyin = PINYIN_OVERRIDES[character]
    || pinyinForCharacter(review.words[0], character, transliterations[index])
    || String(item.pinyin ?? "").trim();
  if (!pinyin || pinyin === "待补") {
    throw new Error(`Unable to derive pinyin for ${character} from ${review.words[0]} (${transliterations[index]}).`);
  }
  return {
    ...item,
    pinyin,
    sentence: review.sentence,
    words: review.words,
  };
});

await writeFile(outputFile, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Applied ${merged.length} reviewed hanzi entries: ${outputFile}`);

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

function parseReviewedContent(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const columns = line.split("\t");
      if (columns.length !== 3) {
        throw new Error(`Reviewed row ${index + 1} must have exactly 3 tab-separated columns.`);
      }
      const [character, wordText, sentence] = columns;
      const words = wordText.split("|").map((word) => word.trim()).filter(Boolean);
      if (Array.from(character).length !== 1) {
        throw new Error(`Reviewed row ${index + 1} has invalid character: ${character}.`);
      }
      if (words.length !== 3 || new Set(words).size !== 3) {
        throw new Error(`Reviewed row ${index + 1} (${character}) must have 3 distinct words.`);
      }
      if (words.some((word) => !word.includes(character))) {
        throw new Error(`Reviewed row ${index + 1} (${character}) contains a word without the character: ${words.join("、")}.`);
      }
      if (!sentence.includes(character)) {
        throw new Error(`Reviewed row ${index + 1} (${character}) sentence must contain the character.`);
      }
      if (sentence === `我们来认识${character}。`) {
        throw new Error(`Reviewed row ${index + 1} (${character}) still uses the generic sentence.`);
      }
      return { character, words, sentence };
    });
}

function transliterateWords(words) {
  const script = [
    'ObjC.import("Foundation");',
    "function run(argv) {",
    "  const words = JSON.parse(argv[0]);",
    "  return JSON.stringify(words.map((word) => {",
    "    const value = $.NSMutableString.alloc.initWithUTF8String(word);",
    "    $.CFStringTransform(value, null, $.kCFStringTransformToLatin, false);",
    "    return ObjC.unwrap(value);",
    "  }));",
    "}",
  ].join("\n");
  try {
    const output = execFileSync(
      "osascript",
      ["-l", "JavaScript", "-e", script, JSON.stringify(words)],
      { encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(output.trim());
  } catch (error) {
    throw new Error(`Unable to transliterate reviewed words with macOS: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function pinyinForCharacter(word, character, transliteration) {
  const characterIndex = Array.from(word).indexOf(character);
  const syllables = String(transliteration ?? "").trim().split(/\s+/).filter(Boolean);
  return characterIndex >= 0 ? syllables[characterIndex]?.toLowerCase() ?? "" : "";
}
