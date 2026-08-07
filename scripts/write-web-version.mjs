#!/usr/bin/env node

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , version, ...distDirs] = process.argv;

if (!version || distDirs.length === 0) {
  console.error("Usage: node scripts/write-web-version.mjs <version> <dist-dir...>");
  process.exit(1);
}

const payload = {
  version,
  builtAt: new Date().toISOString(),
};

for (const distDir of distDirs) {
  const target = resolve(distDir, "version.json");
  const tempTarget = `${target}.tmp`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(tempTarget, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tempTarget, target);
}
