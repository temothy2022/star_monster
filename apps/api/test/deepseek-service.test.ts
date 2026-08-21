import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AppConfig } from "../src/config.js";
import { callDeepSeekJson } from "../src/services/deepseek-service.js";

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
  MINIMAX_REQUEST_TIMEOUT_MS: 120000,
  SMS_REQUEST_TIMEOUT_MS: 10000,
  HANZI_ASSET_UPLOAD_DIR: "../../hanzi-assets/v1/uploads",
  POEM_ASSET_UPLOAD_DIR: "../../poem-assets/v1/uploads",
};

const outputSchema = z.object({
  title: z.string().min(1),
  count: z.number().int().min(1).max(7),
});

function providerResponse(
  content: string,
  finishReason: "stop" | "length" = "stop",
): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content },
          finish_reason: finishReason,
        },
      ],
      model: "deepseek-v4-flash",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeepSeek 结构化输出", () => {
  it("直接接受通过结构校验的 JSON，并关闭思考模式", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(providerResponse('{"title":"指读 RAZ","count":4}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callDeepSeekJson({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      systemPrompt: "只返回 JSON 对象",
      userPayload: { request: "每周读四次" },
      outputSchema,
      config,
    });

    expect(result.data).toEqual({ title: "指读 RAZ", count: 4 });
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.max_tokens).toBe(8192);
  });

  it("把字段校验问题反馈给模型，并接受修正后的完整方案", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse('{"title":"复习汉字","count":10}'),
      )
      .mockResolvedValueOnce(
        providerResponse('{"title":"复习汉字","count":3}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callDeepSeekJson({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      systemPrompt: "只返回 JSON 对象",
      userPayload: { request: "每周复习三次" },
      outputSchema,
      config,
    });

    expect(result.data.count).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(retry.messages.at(-1).content).toContain("count");
    expect(retry.messages.at(-1).content).toContain("只返回完整、有效的 JSON");
  });

  it("识别被截断的 JSON，并要求精简后重新生成", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse('{"title":"整理玩具"', "length"))
      .mockResolvedValueOnce(
        providerResponse('{"title":"整理玩具","count":5}'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callDeepSeekJson({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      systemPrompt: "只返回 JSON 对象",
      userPayload: { request: "工作日整理玩具" },
      outputSchema,
      config,
    });

    expect(result.data).toEqual({ title: "整理玩具", count: 5 });
    const retry = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(retry.messages.at(-1).content).toContain("长度限制被截断");
  });
});
