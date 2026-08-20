import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const apiKey = String(process.env.MINIMAX_API_KEY || "").trim();
const input = path.resolve(String(args.input || "work/hanzi-replacement-20260820/missing-characters.json"));
const output = path.resolve(String(args.output || "work/hanzi-replacement-20260820/missing-content.json"));
const progressFile = path.resolve(String(args.progress || `${output}.progress.json`));
const model = String(args.model || process.env.MINIMAX_TEXT_MODEL || "MiniMax-M2.7");
const batchSize = Number(args["batch-size"] || 16);
const requestRetries = Number(args.retries ?? 3);
const dryRun = Boolean(args.plan || args["validate-only"]);

if (!dryRun && !apiKey) {
  throw new Error("Missing MINIMAX_API_KEY. Run: export MINIMAX_API_KEY='你的密钥'");
}
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 24) {
  throw new Error("--batch-size must be an integer from 1 to 24.");
}
if (!Number.isInteger(requestRetries) || requestRetries < 0 || requestRetries > 6) {
  throw new Error("--retries must be an integer from 0 to 6.");
}

const characters = JSON.parse(await readFile(input, "utf8"));
if (!Array.isArray(characters) || characters.some((item) => !isSingleHanzi(String(item.character || "")))) {
  throw new Error(`Input must be an array of single Han characters: ${input}`);
}

if (dryRun) {
  console.log(JSON.stringify({ input, output, model, characters: characters.length, batchSize }, null, 2));
  process.exit(0);
}

const previous = await readJsonIfExists(output, []);
const previousByCharacter = new Map(previous.map((item) => [item.character, item]));
const pending = characters.filter((item) => !isComplete(previousByCharacter.get(item.character)));
console.log(`Need MiniMax content for ${pending.length}/${characters.length} characters, model=${model}, batch=${batchSize}.`);

const progressByCharacter = await readProgress(progressFile, characters);
// Reconcile the checkpoint with the content manifest before deciding what to
// request. This matters when a previous run saved content successfully but
// was interrupted before updating the per-character status file.
for (const source of characters) {
  const existing = previousByCharacter.get(source.character);
  if (!isComplete(existing)) continue;
  const progress = progressByCharacter.get(source.character);
  if (progress?.status === "completed") continue;
  progressByCharacter.set(source.character, {
    character: source.character,
    status: "completed",
    attempts: progress?.attempts || 0,
    lastError: null,
    updatedAt: progress?.updatedAt || new Date().toISOString(),
  });
}
await writeProgress(progressFile, progressByCharacter);

for (let offset = 0; offset < pending.length; offset += batchSize) {
  const batch = pending.slice(offset, offset + batchSize);
  const results = await generateValidatedBatch(batch);
  for (const result of results) {
    const character = result.source.character;
    if (result.content) {
      previousByCharacter.set(character, result.content);
      progressByCharacter.set(character, {
        character,
        status: "completed",
        attempts: (progressByCharacter.get(character)?.attempts || 0) + result.attempts,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });
    } else {
      progressByCharacter.set(character, {
        character,
        status: "failed",
        attempts: (progressByCharacter.get(character)?.attempts || 0) + result.attempts,
        lastError: result.error,
        updatedAt: new Date().toISOString(),
      });
    }
    await saveCheckpoint(output, progressFile, characters, previousByCharacter, progressByCharacter);
  }
  const saved = characters.filter((item) => isComplete(previousByCharacter.get(item.character))).length;
  console.log(`Saved ${saved}/${characters.length} content rows.`);
}

const result = characters.map((item) => previousByCharacter.get(item.character)).filter(Boolean);
if (result.length !== characters.length) {
  const failed = characters
    .map((item) => progressByCharacter.get(item.character))
    .filter((item) => item?.status === "failed")
    .map((item) => `${item.character}: ${item.lastError}`);
  throw new Error([
    `Only generated ${result.length}/${characters.length} content rows.`,
    failed.length ? `Failed characters:\n${failed.join("\n")}` : "",
    `Resume with the same command. Progress is saved in ${progressFile}.`,
  ].filter(Boolean).join("\n"));
}
console.log(`Done. Content manifest: ${output}`);

async function generateBatch(batch, feedback = "") {
  const characterList = batch.map((item) => item.character).join("、");
  const system = [
    "你是儿童识字课程编辑，只输出严格 JSON，不要 Markdown，不要解释，不要思考过程。",
    "为 5 岁儿童制作汉字学习资料。每个字生成普通话拼音（带声调）、儿童能理解的简短含义、一个帮助记忆字形的简短提示、一个自然且适合儿童的短例句、三个常用词语。",
    "三个词语必须各自包含目标汉字，不能使用生造词、单字、重复词或机械模板。例句必须包含目标汉字，不能使用‘我们来认识X’。",
    "返回格式必须是 JSON 数组，每项严格包含 character、pinyin、meaning、shapeHint、sentence、words 六个字段；words 必须是长度为 3 的字符串数组。",
  ].join("\n");
  const user = [
    `请生成这些字的资料：${characterList}`,
    "不要遗漏任何一个字，不要返回列表之外的字。",
    feedback,
    "JSON 示例：[{\"character\":\"天\",\"pinyin\":\"tiān\",\"meaning\":\"头顶上很大的天空\",\"shapeHint\":\"像一个人头上有一片天空\",\"sentence\":\"今天的天空很蓝。\",\"words\":[\"天空\",\"白天\",\"今天\"]}]",
  ].join("\n");

  const request = {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  };
  let lastError;
  for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
    try {
      const response = await fetch("https://api.minimaxi.com/v1/chat/completions", request);
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`MiniMax text API returned non-JSON ${response.status}: ${text.slice(0, 500)}`);
      }
      if (!response.ok || (json.base_resp?.status_code !== undefined && json.base_resp.status_code !== 0)) {
        throw new Error(`MiniMax text API failed ${response.status}: ${JSON.stringify(json).slice(0, 900)}`);
      }
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("MiniMax text API response has no assistant content.");
      return parseJsonArray(content);
    } catch (error) {
      lastError = error;
      if (attempt === requestRetries || /invalid api key|unauthorized|forbidden/i.test(String(error))) break;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function generateValidatedBatch(batch) {
  let generated;
  let batchError = null;
  try {
    generated = await generateBatch(batch);
  } catch (error) {
    batchError = error.message;
    generated = [];
  }
  const byCharacter = new Map();
  for (const item of generated) {
    const character = String(item.character || "").trim();
    if (isSingleHanzi(character) && !byCharacter.has(character)) byCharacter.set(character, item);
  }

  const results = [];
  const repairs = [];
  for (const source of batch) {
    const item = byCharacter.get(source.character);
    if (!item) {
      repairs.push({ source, reason: batchError || "模型没有返回这个字的资料" });
      continue;
    }
    try {
      results.push({ source, content: normalizeGenerated(item, source), attempts: 0 });
    } catch (error) {
      repairs.push({ source, reason: error.message });
    }
  }

  for (const repair of repairs) {
    try {
      const repaired = await repairSingleCharacter(repair.source, repair.reason);
      results.push({ source: repair.source, content: repaired.content, attempts: repaired.attempts });
    } catch (error) {
      results.push({ source: repair.source, content: null, attempts: error.attempts || 6, error: error.message });
    }
  }

  return batch.map((source) => results.find((result) => result.source.character === source.character));
}

async function repairSingleCharacter(source, initialReason) {
  let reason = initialReason;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const generated = await generateBatch([source], [
      `只修复汉字“${source.character}”，不要返回其他汉字。`,
      `上一次失败原因：${reason}`,
      `三个词语必须逐个包含字符“${source.character}”，例如目标字为“乳”时，不能输出“酸奶”这种不含“乳”的词。`,
      `例句中必须出现字符“${source.character}”，例如目标字为“仗”时，不能返回不含“仗”的句子。`,
      "只返回这个字的资料；不要用相关但不含目标字的词语代替，不要输出单字或重复词语。",
    ].join("\n"));
    const item = generated.find((candidate) => String(candidate.character || "").trim() === source.character);
    try {
      if (!item) throw new Error(`没有返回汉字 ${source.character}`);
      return { content: normalizeGenerated(item, source), attempts: attempt };
    } catch (error) {
      reason = error.message;
      console.warn(`[single-content-retry ${source.character} ${attempt}/6] ${reason}`);
      if (attempt === 6) {
        error.attempts = attempt;
        throw error;
      }
    }
  }
  throw new Error(`Unable to repair content for ${source.character}`);
}

function normalizeGenerated(item, source) {
  const character = String(item.character || "").trim();
  const pinyin = String(item.pinyin || "").trim();
  const meaning = String(item.meaning || "").trim();
  const shapeHint = String(item.shapeHint || "").trim();
  const sentence = String(item.sentence || "").trim();
  const words = Array.isArray(item.words) ? item.words.map((word) => String(word).trim()) : [];
  if (character !== source.character || !isSingleHanzi(character)) throw new Error(`Invalid character in generated content: ${character}`);
  if (!pinyin || !meaning || !shapeHint || !sentence) throw new Error(`Incomplete generated content for ${character}`);
  if (words.length !== 3 || new Set(words).size !== 3 || words.some((word) => !isValidWord(word, character))) {
    throw new Error(`Invalid words for ${character}: ${JSON.stringify(words)}`);
  }
  if (!sentence.includes(character) || sentence === `我们来认识${character}。`) {
    throw new Error(`Invalid sentence for ${character}: ${sentence}`);
  }
  return {
    id: source.id,
    character,
    pinyin,
    meaning,
    shapeHint,
    imageDescription: `simple child-friendly scene showing ${meaning}`,
    sentence,
    words,
    sortOrder: source.sortOrder,
    isEnabled: true,
  };
}

function parseJsonArray(content) {
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || withoutThinking.match(/\[[\s\S]*\]/)?.[0];
  if (!candidate) throw new Error(`MiniMax response did not contain a JSON array: ${content.slice(0, 800)}`);
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed)) throw new Error("MiniMax response JSON is not an array.");
  return parsed;
}

function isComplete(item) {
  return item && isSingleHanzi(String(item.character || "")) && String(item.pinyin || "").trim()
    && String(item.meaning || "").trim() && String(item.shapeHint || "").trim()
    && String(item.sentence || "").includes(String(item.character))
    && Array.isArray(item.words) && item.words.length === 3 && new Set(item.words).size === 3
    && item.words.every((word) => isValidWord(String(word), item.character));
}

function isValidWord(word, character) {
  return word.length >= 2 && word.length <= 8 && word.includes(character) && /^[\p{Script=Han}·]+$/u.test(word);
}

async function readProgress(file, sources) {
  const existing = await readJsonIfExists(file, {});
  const progress = new Map();
  for (const source of sources) {
    const item = existing[source.character];
    progress.set(source.character, item || {
      character: source.character,
      status: "pending",
      attempts: 0,
      lastError: null,
      updatedAt: null,
    });
  }
  return progress;
}

async function writeProgress(file, progress) {
  await mkdir(path.dirname(file), { recursive: true });
  const object = Object.fromEntries([...progress.entries()].map(([character, item]) => [character, item]));
  await writeFile(file, `${JSON.stringify(object, null, 2)}\n`);
}

async function saveCheckpoint(file, progressFilePath, sources, contentByCharacter, progress) {
  const rows = sources.map((item) => contentByCharacter.get(item.character)).filter(Boolean);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(rows, null, 2)}\n`);
  await writeProgress(progressFilePath, progress);
}

function isSingleHanzi(value) {
  return /^\p{Script=Han}$/u.test(value);
}

async function readJsonIfExists(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else { parsed[key] = next; index += 1; }
  }
  return parsed;
}
