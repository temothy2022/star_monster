#!/usr/bin/env node

import { execFileSync } from "node:child_process";
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

function readReleaseHistory() {
  try {
    const output = execFileSync(
      "git",
      ["log", "-n", "100", "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%aI%x1f%s%x1e"],
      { encoding: "utf8" },
    );
    const commits = output
      .split("\x1e")
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [commit, shortCommit, committedAt, title] = record.split("\x1f");
        return { commit, shortCommit, committedAt, title };
      })
      .filter((record) => record.commit && record.shortCommit && record.committedAt && record.title);

    const currentCommit = commits[0];
    const current = {
      version,
      commit: currentCommit?.commit ?? null,
      shortCommit: currentCommit?.shortCommit ?? version.slice(0, 7),
      publishedAt: payload.builtAt,
      committedAt: currentCommit?.committedAt ?? payload.builtAt,
      title: "本次发布",
      changes: currentCommit ? [currentCommit.title] : [],
    };
    const history = commits
      .filter((record) => record.commit !== current.commit)
      .map((record) => ({
        version: record.shortCommit,
        commit: record.commit,
        shortCommit: record.shortCommit,
        publishedAt: record.committedAt,
        committedAt: record.committedAt,
        title: record.title,
        changes: [record.title],
      }));
    return [current, ...history];
  } catch {
    return [{
      version,
      commit: null,
      shortCommit: version.slice(0, 7),
      publishedAt: payload.builtAt,
      committedAt: payload.builtAt,
      title: "本次发布",
      changes: [],
    }];
  }
}

const releaseHistory = readReleaseHistory();

for (const distDir of distDirs) {
  const target = resolve(distDir, "version.json");
  const tempTarget = `${target}.tmp`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(tempTarget, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tempTarget, target);

  const historyTarget = resolve(distDir, "release-history.json");
  const historyTempTarget = `${historyTarget}.tmp`;
  writeFileSync(historyTempTarget, `${JSON.stringify(releaseHistory, null, 2)}\n`);
  renameSync(historyTempTarget, historyTarget);
}
