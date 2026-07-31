import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import {
  generateMiniMaxImage,
  generateMiniMaxSpeech,
  hanziImagePrompts,
  poemSpeechText,
} from "../src/services/minimax-media-generation-service.js";

const config: AppConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 8787,
  DATABASE_URL: "file:test.db",
  COOKIE_SECRET: "c".repeat(32),
  LOGIN_CODE_PEPPER: "p".repeat(32),
  CHILD_SESSION_DAYS: 365,
  STAFF_SESSION_DAYS: 30,
  APP_TIME_ZONE: "Asia/Shanghai",
  CHILD_APP_ORIGIN: "http://127.0.0.1:5175",
  PARENT_APP_ORIGIN: "http://127.0.0.1:5176",
  ADMIN_APP_ORIGIN: "http://127.0.0.1:5177",
  AI_CONFIG_ENCRYPTION_KEY: "e".repeat(32),
  AI_REQUEST_TIMEOUT_MS: 5000,
  MINIMAX_REQUEST_TIMEOUT_MS: 10000,
  HANZI_ASSET_UPLOAD_DIR: "../../hanzi-assets/v1/uploads",
  POEM_ASSET_UPLOAD_DIR: "../../poem-assets/v1/uploads",
};

function providerResponse(data: Record<string, unknown>, statusCode = 0) {
  return new Response(
    JSON.stringify({
      data,
      base_resp: {
        status_code: statusCode,
        status_msg: statusCode === 0 ? "success" : "rejected",
      },
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

describe("MiniMax media generation", () => {
  it("decodes generated image data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      providerResponse({
        image_base64: [Buffer.from("image-data").toString("base64")],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateMiniMaxImage({
      apiKey: "secret-key",
      prompt: "standard prompt",
      config,
    });

    expect(result.toString()).toBe("image-data");
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(request.headers).toMatchObject({
      Authorization: "Bearer secret-key",
    });
  });

  it("retries a rejected image with the safe prompt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse({}, 1026))
      .mockResolvedValueOnce(
        providerResponse({
          image_base64: [Buffer.from("safe-image").toString("base64")],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateMiniMaxImage({
      apiKey: "secret-key",
      prompt: "standard prompt",
      safePrompt: "safe prompt",
      config,
    });

    expect(result.toString()).toBe("safe-image");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequest = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(String(secondRequest.body))).toMatchObject({
      prompt: "safe prompt",
    });
  });

  it("uses compressed Chinese speech settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      providerResponse({
        audio: Buffer.from("audio-data").toString("hex"),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateMiniMaxSpeech({
      apiKey: "secret-key",
      text: "山",
      config,
    });

    expect(result.toString()).toBe("audio-data");
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      text: "山",
      language_boost: "Chinese",
      audio_setting: {
        sample_rate: 32000,
        bitrate: 64000,
        format: "mp3",
        channel: 1,
      },
    });
  });

  it("builds no-text prompts and complete poem narration", () => {
    const prompts = hanziImagePrompts({
      meaning: "高高的大山",
      shapeHint: "像三座山峰",
      sentence: "我们爬上高山。",
    });
    expect(prompts.prompt).toContain("No text");
    expect(prompts.safePrompt).not.toContain("高高的大山");
    expect(
      poemSpeechText({
        title: "春晓",
        dynasty: "唐",
        author: "孟浩然",
        content: "春眠不觉晓。",
      }),
    ).toBe("《春晓》。唐代，孟浩然。春眠不觉晓。");
  });
});
