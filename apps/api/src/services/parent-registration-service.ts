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

export function buildSmsProviderUrl(
  baseUrl: string,
  phone: string,
  code: string,
  validMinutes = PARENT_CODE_TTL_MS / 60_000,
): string {
  const url = new URL(baseUrl);
  // Spug's current template endpoint is /send/<template> and uses targets.
  // Keep /sms/<template> compatible for existing configurations.
  const usesCurrentSendEndpoint = /^\/send\/[^/]+\/?$/.test(url.pathname);
  url.searchParams.set(usesCurrentSendEndpoint ? "targets" : "to", normalizeParentPhone(phone));
  url.searchParams.set("code", code);
  // The configured /sms template uses ${number} in its message. Without this
  // parameter Spug receives the request but cannot render the template as
  // configured in the dashboard.
  if (!usesCurrentSendEndpoint) url.searchParams.set("number", String(validMinutes));
  return url.toString();
}

type SmsProviderResult = {
  businessCode: string | null;
  requestId: string | null;
  message: string | null;
  accepted: boolean;
};

function truncate(value: string | null | undefined, max = 500): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function parseSmsProviderResponse(body: string): SmsProviderResult {
  const trimmed = body.trim();
  if (!trimmed) {
    return { businessCode: null, requestId: null, message: null, accepted: true };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) {
      return { businessCode: null, requestId: null, message: truncate(trimmed), accepted: true };
    }
    const record = parsed as Record<string, unknown>;
    const rawCode = record.code;
    const businessCode = rawCode === undefined || rawCode === null ? null : String(rawCode);
    const rawMessage = record.msg ?? record.message ?? record.error;
    const message = rawMessage === undefined || rawMessage === null ? null : String(rawMessage);
    const rawRequestId = record.request_id ?? record.requestId;
    const requestId = rawRequestId === undefined || rawRequestId === null ? null : String(rawRequestId);
    const accepted = businessCode === null || businessCode === "0" || businessCode === "200";
    return { businessCode, requestId: truncate(requestId, 120), message: truncate(message ?? trimmed), accepted };
  } catch {
    // Older configurations returned plain text such as "ok". HTTP 2xx is
    // still accepted for that legacy format, while structured failures above
    // are handled by their business code.
    return { businessCode: null, requestId: null, message: truncate(trimmed), accepted: true };
  }
}

function providerLocation(baseUrl: string | undefined): { host: string | null; path: string | null } {
  if (!baseUrl) return { host: null, path: null };
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/[^/]+$/, "/{template}");
    return { host: url.host, path };
  } catch {
    return { host: null, path: null };
  }
}

async function createSmsLog(
  db: PrismaClient,
  data: {
    purpose: string;
    phoneNumber: string;
    status: string;
    providerHost?: string | null;
    providerPath?: string | null;
    providerHttpStatus?: number | null;
    providerCode?: string | null;
    providerRequestId?: string | null;
    providerMessage?: string | null;
    errorMessage?: string | null;
    startedAt?: Date;
    completedAt?: Date | null;
  },
): Promise<string | null> {
  try {
    const log = await db.smsDeliveryLog.create({ data });
    return log.id;
  } catch (error) {
    // Diagnostics must never prevent registration, but keep an operational
    // signal when the new audit table has not been migrated yet.
    console.error("sms delivery log write failed", error instanceof Error ? error.message : error);
    return null;
  }
}

async function updateSmsLog(
  db: PrismaClient,
  id: string | null,
  data: Parameters<PrismaClient["smsDeliveryLog"]["update"]>[0]["data"],
): Promise<void> {
  if (!id) return;
  try {
    await db.smsDeliveryLog.update({ where: { id }, data });
  } catch (error) {
    console.error("sms delivery log update failed", error instanceof Error ? error.message : error);
  }
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
  const location = providerLocation(config.SMS_PROVIDER_URL);
  if (!config.SMS_PROVIDER_URL) {
    await createSmsLog(db, {
      purpose: "PARENT_REGISTRATION",
      phoneNumber,
      status: "NOT_CONFIGURED",
      startedAt: now,
      completedAt: now,
      errorMessage: "SMS_PROVIDER_URL 未配置",
    });
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
  const startedAt = now;
  const logId = await createSmsLog(db, {
    purpose: "PARENT_REGISTRATION",
    phoneNumber,
    status: "STARTED",
    providerHost: location.host,
    providerPath: location.path,
    startedAt,
  });
  let response: Response;
  let providerBody = "";
  try {
    response = await fetch(buildSmsProviderUrl(config.SMS_PROVIDER_URL, phoneNumber, code), {
      method: "GET",
      signal: AbortSignal.timeout(config.SMS_REQUEST_TIMEOUT_MS),
    });
    providerBody = await response.text();
  } catch (error) {
    await updateSmsLog(db, logId, {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: truncate(error instanceof Error ? error.message : "网络请求失败", 300),
    });
    throw new HttpError(502, "SMS_PROVIDER_FAILED", "短信发送失败，请稍后重试");
  }
  const providerResult = parseSmsProviderResponse(providerBody);
  const accepted = response.ok && providerResult.accepted;
  await updateSmsLog(db, logId, {
    status: accepted ? "SUCCESS" : "FAILED",
    completedAt: new Date(),
    providerHttpStatus: response.status,
    providerCode: providerResult.businessCode,
    providerRequestId: providerResult.requestId,
    providerMessage: providerResult.message,
    ...(accepted ? {} : { errorMessage: providerResult.message ?? `HTTP ${response.status}` }),
  });
  if (!accepted) {
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
