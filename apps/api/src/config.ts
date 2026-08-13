import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().min(1),
  COOKIE_SECRET: z.string().min(32),
  LOGIN_CODE_PEPPER: z.string().min(32),
  CHILD_SESSION_DAYS: z.coerce.number().int().positive().default(365),
  STAFF_SESSION_DAYS: z.coerce.number().int().positive().default(30),
  PARENT_SESSION_DAYS: z.coerce.number().int().positive().default(365),
  APP_TIME_ZONE: z.string().default("Asia/Shanghai"),
  CHILD_APP_ORIGIN: z.string().url().default("http://127.0.0.1:5175"),
  PARENT_APP_ORIGIN: z.string().url().default("http://127.0.0.1:5176"),
  ADMIN_APP_ORIGIN: z.string().url().default("http://127.0.0.1:5177"),
  AI_CONFIG_ENCRYPTION_KEY: z.string().min(32),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5000).max(120000).default(45000),
  MINIMAX_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(10000)
    .max(300000)
    .default(120000),
  HANZI_ASSET_UPLOAD_DIR: z
    .string()
    .min(1)
    .default("../../hanzi-assets/v1/uploads"),
  POEM_ASSET_UPLOAD_DIR: z
    .string()
    .min(1)
    .default("../../poem-assets/v1/uploads"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`环境变量配置无效：\n${details}`);
  }
  return parsed.data;
}
