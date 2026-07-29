import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { buildPerformanceDashboard } from "../src/domain/performance-metrics.js";

try {
  loadEnvFile(".env");
} catch {
  // Production may provide DATABASE_URL through the process environment.
}

const args = parseArgs(process.argv.slice(2));
const days = Math.min(30, Math.max(1, Number(args.days ?? 30)));
const outputFile = path.resolve(
  String(args.output ?? "performance-metrics-export.json"),
);
const from = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
const prisma = new PrismaClient();

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

try {
  const [children, records] = await Promise.all([
    prisma.childProfile.findMany({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.childPerformanceMetric.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: 50_000,
    }),
  ]);

  const dashboards = children.map((child) => {
    const childRecords = records.filter((record) => record.childId === child.id);
    return {
      child,
      dashboard: buildPerformanceDashboard(
        childRecords,
        days,
        process.env.APP_TIME_ZONE || "Asia/Shanghai",
      ),
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    days,
    from: from.toISOString(),
    totalRecords: records.length,
    dashboards,
    records,
  };

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        output: outputFile,
        days,
        children: children.length,
        records: records.length,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
