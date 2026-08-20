import { randomUUID } from "node:crypto";
import { access, opendir, readFile, readdir, stat, statfs } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { prepareDailyTasks } from "./task-service.js";
import { generateDueWeeklyGrowthReports } from "./weekly-growth-report-service.js";

const PERFORMANCE_RETENTION_DAYS = 30;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const BACKUP_TIMEOUT_MS = 120_000;

export const SYSTEM_OPERATION_DEFINITIONS = {
  RECONCILE_DAILY_TASKS: {
    label: "修复今日任务",
    description: "为全部启用孩子重新生成并核对今天的任务快照，修复任务缺失或配置不同步。",
    confirmation: "修复今日任务",
    risk: "medium",
  },
  CLEAN_EXPIRED_DATA: {
    label: "清理过期数据",
    description: `删除过期登录会话和 ${PERFORMANCE_RETENTION_DAYS} 天以前的性能明细，不删除任务、星星或学习记录。`,
    confirmation: "清理过期数据",
    risk: "medium",
  },
  GENERATE_WEEKLY_REPORTS: {
    label: "补生成成长周报",
    description: "立即检查全部启用孩子，并为符合条件且尚未生成的周期补生成 AI 成长周报。",
    confirmation: "补生成成长周报",
    risk: "high",
  },
} as const;

export type SystemOperationName = keyof typeof SYSTEM_OPERATION_DEFINITIONS;

type MigrationRow = {
  migration_name: string;
  started_at: Date;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs: string | null;
};

type OperationResult = Record<string, string | number | boolean | null>;

let activeOperation: { id: string; operation: SystemOperationName; startedAt: Date } | null = null;

function formatBytes(value: bigint | number) {
  const bytes = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

async function countDirectoryFiles(directory: string) {
  let files = 0;
  let bytes = 0;
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop()!;
    const handle = await opendir(current);
    for await (const entry of handle) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await stat(entryPath)).size;
      }
    }
  }
  return { files, bytes };
}

async function inspectStorage(label: string, directory: string) {
  const resolved = path.resolve(directory);
  try {
    await access(resolved, fsConstants.R_OK | fsConstants.W_OK);
    const [usage, fileSystem] = await Promise.all([
      countDirectoryFiles(resolved),
      statfs(resolved),
    ]);
    const availableBytes = fileSystem.bavail * fileSystem.bsize;
    return {
      label,
      path: resolved,
      status: "ready" as const,
      writable: true,
      fileCount: usage.files,
      usedBytes: usage.bytes,
      usedDisplay: formatBytes(usage.bytes),
      availableBytes: Number(availableBytes),
      availableDisplay: formatBytes(availableBytes),
      message: null,
    };
  } catch (error) {
    return {
      label,
      path: resolved,
      status: "error" as const,
      writable: false,
      fileCount: 0,
      usedBytes: 0,
      usedDisplay: "0 B",
      availableBytes: null,
      availableDisplay: null,
      message: error instanceof Error ? error.message : "目录不可访问",
    };
  }
}

async function findMigrationDirectory() {
  const candidates = [
    path.resolve(process.cwd(), "prisma/migrations"),
    path.resolve(process.cwd(), "apps/api/prisma/migrations"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // Try the next supported working directory.
    }
  }
  return null;
}

async function migrationStatus() {
  try {
    const rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, started_at, finished_at, rolled_back_at, logs
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `;
    const migrationDirectory = await findMigrationDirectory();
    const local = migrationDirectory
      ? (await readdir(migrationDirectory, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      : [];
    const applied = new Set(
      rows
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name),
    );
    const failed = rows.filter((row) => !row.finished_at && !row.rolled_back_at);
    const pending = local.filter((name) => !applied.has(name));
    return {
      status: failed.length || pending.length ? "attention" as const : "ready" as const,
      appliedCount: applied.size,
      localCount: local.length,
      pending,
      failed: failed.map((row) => ({
        name: row.migration_name,
        startedAt: row.started_at,
        message: row.logs?.slice(-500) ?? null,
      })),
      migrationDirectory,
    };
  } catch (error) {
    return {
      status: "error" as const,
      appliedCount: 0,
      localCount: 0,
      pending: [] as string[],
      failed: [],
      migrationDirectory: null,
      message: error instanceof Error ? error.message : "无法读取迁移状态",
    };
  }
}

async function releaseVersion() {
  const candidates = [
    path.resolve(process.cwd(), "../../.release-version"),
    path.resolve(process.cwd(), ".release-version"),
  ];
  for (const candidate of candidates) {
    try {
      return (await readFile(candidate, "utf8")).trim() || null;
    } catch {
      // Local development normally has no release marker.
    }
  }
  return null;
}

async function pgDumpExecutable() {
  for (const candidate of ["/usr/bin/pg_dump", "/usr/local/bin/pg_dump"]) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue.
    }
  }
  return null;
}

export async function getSystemOperationsDashboard(config: AppConfig) {
  const startedAt = new Date(Date.now() - process.uptime() * 1000);
  const [databaseProbe, migrations, storages, counts, version, pgDump] = await Promise.all([
    prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`
      .then((rows) => ({ status: "ready" as const, serverTime: rows[0]?.now ?? null, message: null }))
      .catch((error) => ({ status: "error" as const, serverTime: null, message: error instanceof Error ? error.message : "数据库连接失败" })),
    migrationStatus(),
    Promise.all([
      inspectStorage("汉字上传目录", config.HANZI_ASSET_UPLOAD_DIR),
      inspectStorage("古诗与平台媒体目录", config.POEM_ASSET_UPLOAD_DIR),
    ]),
    Promise.all([
      prisma.family.count(),
      prisma.childProfile.count(),
      prisma.userSession.count(),
      prisma.childSession.count(),
      prisma.childPerformanceMetric.count(),
    ]),
    releaseVersion(),
    pgDumpExecutable(),
  ]);

  const recentRuns = await prisma.auditLog.findMany({
    where: { action: { in: ["SYSTEM_OPERATION_SUCCEEDED", "SYSTEM_OPERATION_FAILED", "DATABASE_BACKUP_CREATED"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const memory = process.memoryUsage();

  return {
    checkedAt: new Date(),
    service: {
      status: "ready" as const,
      environment: config.NODE_ENV,
      nodeVersion: process.version,
      processId: process.pid,
      startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      releaseVersion: version,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        rssDisplay: formatBytes(memory.rss),
        heapDisplay: `${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}`,
      },
    },
    database: databaseProbe,
    migrations,
    storages,
    counts: {
      families: counts[0],
      children: counts[1],
      userSessions: counts[2],
      childSessions: counts[3],
      performanceMetrics: counts[4],
    },
    backup: { available: Boolean(pgDump), executable: pgDump },
    activeOperation,
    operations: Object.entries(SYSTEM_OPERATION_DEFINITIONS).map(([key, value]) => ({ key, ...value })),
    recentRuns,
  };
}

async function auditOperation(input: {
  actorId: string;
  action: string;
  runId: string;
  operation: string;
  ipAddress?: string;
  metadata?: OperationResult;
}) {
  await prisma.auditLog.create({
    data: {
      actorType: "USER",
      actorId: input.actorId,
      action: input.action,
      resourceType: "SystemOperation",
      resourceId: input.runId,
      ipAddress: input.ipAddress,
      metadata: { operation: input.operation, ...(input.metadata ?? {}) },
    },
  });
}

export async function runSystemOperation(input: {
  operation: SystemOperationName;
  confirmation: string;
  actorId: string;
  ipAddress?: string;
  config: AppConfig;
  logger: FastifyBaseLogger;
}) {
  const definition = SYSTEM_OPERATION_DEFINITIONS[input.operation];
  if (input.confirmation !== definition.confirmation) {
    throw new Error("确认文字不匹配，操作未执行");
  }
  if (activeOperation) {
    throw new Error(`“${SYSTEM_OPERATION_DEFINITIONS[activeOperation.operation].label}”正在执行，请稍后再试`);
  }

  const runId = randomUUID();
  const startedAt = new Date();
  activeOperation = { id: runId, operation: input.operation, startedAt };
  await auditOperation({
    actorId: input.actorId,
    action: "SYSTEM_OPERATION_STARTED",
    runId,
    operation: input.operation,
    ipAddress: input.ipAddress,
  });

  try {
    let result: OperationResult;
    if (input.operation === "RECONCILE_DAILY_TASKS") {
      const children = await prisma.childProfile.findMany({
        where: { status: "ACTIVE", family: { status: "ACTIVE" } },
        select: { id: true },
      });
      let succeeded = 0;
      let failed = 0;
      for (const child of children) {
        try {
          await prepareDailyTasks(child.id, input.config);
          succeeded += 1;
        } catch (error) {
          failed += 1;
          input.logger.error({ error, childId: child.id, runId }, "超级后台修复每日任务失败");
        }
      }
      result = { processed: children.length, succeeded, failed };
    } else if (input.operation === "CLEAN_EXPIRED_DATA") {
      const now = new Date();
      const cutoff = new Date(now.getTime() - PERFORMANCE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const [users, children, metrics] = await prisma.$transaction([
        prisma.userSession.deleteMany({ where: { expiresAt: { lte: now } } }),
        prisma.childSession.deleteMany({ where: { expiresAt: { lte: now } } }),
        prisma.childPerformanceMetric.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      ]);
      result = {
        userSessionsRemoved: users.count,
        childSessionsRemoved: children.count,
        performanceMetricsRemoved: metrics.count,
        retentionDays: PERFORMANCE_RETENTION_DAYS,
      };
    } else {
      const reportResult = await generateDueWeeklyGrowthReports(input.config, input.logger);
      result = reportResult;
    }

    const durationMs = Date.now() - startedAt.getTime();
    await auditOperation({
      actorId: input.actorId,
      action: "SYSTEM_OPERATION_SUCCEEDED",
      runId,
      operation: input.operation,
      ipAddress: input.ipAddress,
      metadata: { ...result, durationMs },
    });
    return { runId, operation: input.operation, status: "SUCCEEDED" as const, durationMs, result };
  } catch (error) {
    const durationMs = Date.now() - startedAt.getTime();
    await auditOperation({
      actorId: input.actorId,
      action: "SYSTEM_OPERATION_FAILED",
      runId,
      operation: input.operation,
      ipAddress: input.ipAddress,
      metadata: {
        durationMs,
        error: error instanceof Error ? error.message.slice(0, 500) : "未知错误",
      },
    }).catch(() => undefined);
    throw error;
  } finally {
    activeOperation = null;
  }
}

export function databaseEnvironment(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (!parsed.protocol.startsWith("postgres")) throw new Error("仅支持 PostgreSQL 数据库备份");
  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.replace(/^\//, ""),
    ...(parsed.searchParams.get("sslmode") ? { PGSSLMODE: parsed.searchParams.get("sslmode")! } : {}),
  };
}

async function collectPgDump(executable: string, databaseUrl: string) {
  const environment = databaseEnvironment(databaseUrl);
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(executable, ["--format=custom", "--no-owner", "--no-acl"], {
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (error?: Error, data?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(data!);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("数据库备份超过 120 秒，已停止"));
    }, BACKUP_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BACKUP_BYTES) {
        child.kill("SIGKILL");
        finish(new Error("数据库备份超过 100 MB，请改用服务器离线备份"));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(Buffer.concat(errors).toString("utf8").trim() || `pg_dump 退出码 ${code}`));
        return;
      }
      finish(undefined, Buffer.concat(chunks));
    });
  });
}

export async function createDatabaseBackup(input: {
  databaseUrl: string;
  actorId: string;
  ipAddress?: string;
}) {
  const executable = await pgDumpExecutable();
  if (!executable) throw new Error("服务器未安装 pg_dump，暂时无法从后台下载备份");
  const startedAt = Date.now();
  const data = await collectPgDump(executable, input.databaseUrl);
  const runId = randomUUID();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `star-monsters-${timestamp}.dump`;
  await auditOperation({
    actorId: input.actorId,
    action: "DATABASE_BACKUP_CREATED",
    runId,
    operation: "DATABASE_BACKUP",
    ipAddress: input.ipAddress,
    metadata: { bytes: data.length, durationMs: Date.now() - startedAt },
  });
  return { data, fileName };
}
