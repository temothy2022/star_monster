import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import {
  buildSmsProviderUrl,
  generateParentVerificationCode,
  isParentPhone,
  normalizeParentPhone,
  sendParentRegistrationCode,
  verifyAndConsumeParentRegistrationCode,
} from "../src/services/parent-registration-service.js";
import { hashSecret } from "../src/lib/crypto.js";

const config: AppConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 8787,
  DATABASE_URL: "file:test.db",
  COOKIE_SECRET: "c".repeat(32),
  LOGIN_CODE_PEPPER: "p".repeat(32),
  CHILD_SESSION_DAYS: 365,
  STAFF_SESSION_DAYS: 30,
  PARENT_SESSION_DAYS: 365,
  APP_TIME_ZONE: "Asia/Shanghai",
  CHILD_APP_ORIGIN: "http://127.0.0.1:5175",
  PARENT_APP_ORIGIN: "http://127.0.0.1:5176",
  ADMIN_APP_ORIGIN: "http://127.0.0.1:5177",
  AI_CONFIG_ENCRYPTION_KEY: "e".repeat(32),
  AI_REQUEST_TIMEOUT_MS: 5000,
  MINIMAX_REQUEST_TIMEOUT_MS: 10000,
  SMS_PROVIDER_URL: "https://push.spug.cc/sms/provider-token",
  SMS_REQUEST_TIMEOUT_MS: 10000,
  HANZI_ASSET_UPLOAD_DIR: "../../hanzi-assets/v1/uploads",
  POEM_ASSET_UPLOAD_DIR: "../../poem-assets/v1/uploads",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("家长手机号注册验证码", () => {
  it("规范化并校验大陆手机号", () => {
    expect(normalizeParentPhone("138 0000-0000")).toBe("13800000000");
    expect(isParentPhone("13800000000")).toBe(true);
    expect(isParentPhone("12800000000")).toBe(false);
  });

  it("构造短信 URL 时只追加编码后的手机号和验证码", () => {
    const url = buildSmsProviderUrl(
      "https://push.spug.cc/sms/provider-token",
      "13800000000",
      "012345",
    );
    expect(url).toBe(
      "https://push.spug.cc/sms/provider-token?to=13800000000&code=012345",
    );
  });

  it("发送成功后保存哈希验证码，并返回 10 分钟有效期和 60 秒冷却", async () => {
    const create = vi.fn().mockResolvedValue({ id: "verification-1" });
    const db = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      parentRegistrationVerification: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
    } as never;
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendParentRegistrationCode(
      db,
      config,
      "13800000000",
      new Date("2026-08-21T00:00:00.000Z"),
    );

    expect(result).toEqual({ expiresInSeconds: 600, retryAfterSeconds: 60 });
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/push\.spug\.cc\/sms\/provider-token\?to=13800000000&code=\d{6}$/,
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phoneNumber: "13800000000",
        codeHash: expect.stringMatching(/^scrypt:/),
      }),
    });
  });

  it("验证码只能消费一次", async () => {
    const codeHash = await hashSecret("012345");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      parentRegistrationVerification: {
        findFirst: vi.fn().mockResolvedValue({
          id: "verification-1",
          phoneNumber: "13800000000",
          codeHash,
          sentAt: new Date("2026-08-21T00:00:00.000Z"),
          expiresAt: new Date("2026-08-21T00:10:00.000Z"),
          attempts: 0,
          consumedAt: null,
        }),
        updateMany,
      },
    } as never;

    await verifyAndConsumeParentRegistrationCode(
      tx,
      "13800000000",
      "012345",
      new Date("2026-08-21T00:05:00.000Z"),
    );
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("发送冷却期间拒绝再次发送", async () => {
    const db = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      parentRegistrationVerification: {
        findFirst: vi.fn().mockResolvedValue({
          sentAt: new Date("2026-08-21T00:00:30.000Z"),
        }),
      },
    } as never;

    await expect(
      sendParentRegistrationCode(
        db,
        config,
        "13800000000",
        new Date("2026-08-21T00:01:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "SMS_CODE_COOLDOWN", statusCode: 429 });
  });

  it("验证码格式固定为 6 位数字", () => {
    expect(generateParentVerificationCode()).toMatch(/^\d{6}$/);
  });
});
