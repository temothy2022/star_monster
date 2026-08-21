import { randomInt } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config.js";
import { hashSecret, verifySecret } from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";

export const PARENT_CODE_TTL_MS = 10 * 60 * 1000;
export const PARENT_CODE_RESEND_INTERVAL_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export function normalizeParentPhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

export function isParentPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(normalizeParentPhone(phone));
}

export function generateParentVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function buildSmsProviderUrl(baseUrl: string, phone: string, code: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("to", normalizeParentPhone(phone));
  url.searchParams.set("code", code);
  return url.toString();
}

function invalidCode(): never {
  throw new HttpError(400, "INVALID_SMS_CODE", "验证码错误或已失效，请重新获取");
}

export async function sendParentRegistrationCode(
  db: PrismaClient,
  config: AppConfig,
  rawPhone: string,
  now = new Date(),
): Promise<{ expiresInSeconds: number; retryAfterSeconds: number }> {
  const phoneNumber = normalizeParentPhone(rawPhone);
  if (!isParentPhone(phoneNumber)) {
    throw new HttpError(400, "INVALID_PHONE_NUMBER", "请输入有效的中国大陆手机号");
  }
  if (!config.SMS_PROVIDER_URL) {
    throw new HttpError(503, "SMS_NOT_CONFIGURED", "短信服务暂未配置，请联系管理员");
  }

  const existingUser = await db.user.findFirst({
    where: { OR: [{ phoneNumber }, { username: phoneNumber }] },
    select: { id: true },
  });
  if (existingUser) {
    throw new HttpError(409, "PHONE_REGISTERED", "这个手机号已经注册过家长账号");
  }

  const latest = await db.parentRegistrationVerification.findFirst({
    where: { phoneNumber },
    orderBy: { createdAt: "desc" },
    select: { sentAt: true },
  });
  if (latest) {
    const elapsed = now.getTime() - latest.sentAt.getTime();
    if (elapsed < PARENT_CODE_RESEND_INTERVAL_MS) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((PARENT_CODE_RESEND_INTERVAL_MS - elapsed) / 1000),
      );
      throw new HttpError(429, "SMS_CODE_COOLDOWN", `验证码发送过于频繁，请 ${retryAfterSeconds} 秒后重试`);
    }
  }

  const code = generateParentVerificationCode();
  let response: Response;
  try {
    response = await fetch(buildSmsProviderUrl(config.SMS_PROVIDER_URL, phoneNumber, code), {
      method: "GET",
      signal: AbortSignal.timeout(config.SMS_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, "SMS_PROVIDER_FAILED", "短信发送失败，请稍后重试");
  }
  if (!response.ok) {
    throw new HttpError(502, "SMS_PROVIDER_FAILED", "短信发送失败，请稍后重试");
  }

  await db.parentRegistrationVerification.create({
    data: {
      phoneNumber,
      codeHash: await hashSecret(code),
      sentAt: now,
      expiresAt: new Date(now.getTime() + PARENT_CODE_TTL_MS),
    },
  });
  return {
    expiresInSeconds: PARENT_CODE_TTL_MS / 1000,
    retryAfterSeconds: PARENT_CODE_RESEND_INTERVAL_MS / 1000,
  };
}

export async function verifyAndConsumeParentRegistrationCode(
  tx: Prisma.TransactionClient,
  rawPhone: string,
  code: string,
  now = new Date(),
): Promise<void> {
  const phoneNumber = normalizeParentPhone(rawPhone);
  const record = await tx.parentRegistrationVerification.findFirst({
    where: { phoneNumber },
    orderBy: { createdAt: "desc" },
  });
  if (
    !record ||
    record.consumedAt ||
    record.expiresAt.getTime() <= now.getTime() ||
    record.attempts >= MAX_CODE_ATTEMPTS
  ) {
    invalidCode();
  }

  if (!(await verifySecret(code, record.codeHash))) {
    await tx.parentRegistrationVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    invalidCode();
  }

  const consumed = await tx.parentRegistrationVerification.updateMany({
    where: {
      id: record.id,
      consumedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: MAX_CODE_ATTEMPTS },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) invalidCode();
}
