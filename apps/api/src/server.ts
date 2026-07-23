import { loadEnvFile } from "node:process";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { startDailyScheduler } from "./services/daily-scheduler.js";

try {
  loadEnvFile(".env");
} catch {
  // Production environments normally inject variables directly.
}

const config = loadConfig();
const app = await buildApp(config);
let stopDailyScheduler: (() => void) | undefined;

async function shutdown(signal: string) {
  app.log.info({ signal }, "正在关闭服务");
  stopDailyScheduler?.();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.HOST, port: config.PORT });
stopDailyScheduler = startDailyScheduler(config, app.log);
