import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";

try {
  loadEnvFile(".env");
} catch {
  // Production reads DATABASE_URL from the service environment.
}

const prisma = new PrismaClient();
const args = parseArgs(process.argv.slice(2));
const manifestFile = args.manifest;
const publicBaseUrl = normalizeBaseUrl(args["public-base-url"] ?? process.env.POEM_ASSET_PUBLIC_BASE_URL ?? "");
const dryRun = Boolean(args["dry-run"]);
const allowMissingMedia = Boolean(args["allow-missing-media"]);

if (!manifestFile) {
  console.error("Missing --manifest. Example: pnpm poem:import-assets -- --manifest packages/assets/generated/poem-assets/manifest.json --public-base-url https://timothy.run/poem-assets/v1");
  process.exit(1);
}

function parseArgs(values: string[]) {
  const parsed: Record<string, string | boolean> = {};
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

function normalizeBaseUrl(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveInputFile(value: string) {
  if (path.isAbsolute(value)) return value;
  const local = path.resolve(value);
  if (existsSync(local)) return local;
  const repoRootRelative = path.resolve("../..", value);
  if (existsSync(repoRootRelative)) return repoRootRelative;
  return local;
}

function fullUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return publicBaseUrl ? `${publicBaseUrl}/${text.replace(/^\/+/, "")}` : text;
}

function normalizeEntry(entry: Record<string, unknown>, index: number) {
  const title = String(entry.title || "").trim();
  const dynasty = String(entry.dynasty || "").trim();
  const author = String(entry.author || "").trim();
  const grade = Number(entry.grade);
  const semester = String(entry.semester || "").trim();
  const imageUrl = fullUrl(entry.imageUrl || (entry.image as { url?: unknown } | null)?.url);
  const audioUrl = fullUrl(entry.audioUrl || (entry.audio as { url?: unknown } | null)?.url);
  const missing = [];
  if (!title) missing.push("title");
  if (!dynasty) missing.push("dynasty");
  if (!author) missing.push("author");
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) missing.push("grade");
  if (!semester) missing.push("semester");
  if (!allowMissingMedia && !imageUrl) missing.push("imageUrl");
  if (!allowMissingMedia && !audioUrl) missing.push("audioUrl");
  if (missing.length) throw new Error(`Manifest item ${index} is missing or invalid: ${missing.join(", ")}`);
  return {
    title,
    dynasty,
    author,
    grade,
    semester,
    imageUrl: imageUrl || null,
    audioUrl: audioUrl || null,
  };
}

try {
  const raw = JSON.parse(await readFile(resolveInputFile(String(manifestFile)), "utf8"));
  if (!Array.isArray(raw)) throw new Error("Manifest must be a JSON array.");
  const entries = raw.map(normalizeEntry);

  console.log(
    `Ready to import ${entries.length} poem asset entries${dryRun ? " (dry run)" : ""}` +
      `${allowMissingMedia ? " (missing media allowed)" : ""}.`,
  );

  let updatedCount = 0;
  if (!dryRun) {
    for (const entry of entries) {
      const result = await prisma.poem.updateMany({
        where: {
          title: entry.title,
          dynasty: entry.dynasty,
          author: entry.author,
          grade: entry.grade,
          semester: entry.semester,
        },
        data: {
          imageUrl: entry.imageUrl,
          audioUrl: entry.audioUrl,
        },
      });
      if (result.count !== 1) {
        throw new Error(`Expected to update exactly 1 poem for ${entry.title}, updated ${result.count}.`);
      }
      updatedCount += result.count;
    }
  }

  console.log(JSON.stringify({ ok: true, dryRun, entries: entries.length, updatedCount }, null, 2));
} finally {
  await prisma.$disconnect();
}
