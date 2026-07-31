import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";

const IMAGE_ENDPOINT = "https://api.minimaxi.com/v1/image_generation";
const SPEECH_ENDPOINT = "https://api.minimaxi.com/v1/t2a_v2";

type MiniMaxResponse = {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  data?: {
    image_base64?: string[];
    audio?: string;
  };
};

class MiniMaxRequestError extends Error {
  constructor(
    message: string,
    readonly providerCode: number | null,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

function providerErrorMessage(error: MiniMaxRequestError) {
  if (error.providerCode === 1002 || error.httpStatus === 429) {
    return new HttpError(
      429,
      "MINIMAX_RATE_LIMITED",
      "MiniMax 请求过于频繁，请稍后再试",
    );
  }
  if (error.providerCode === 1026) {
    return new HttpError(
      400,
      "MINIMAX_PROMPT_REJECTED",
      "MiniMax 拒绝了当前图片描述，请调整内容后再试",
    );
  }
  if (error.httpStatus === 401 || error.httpStatus === 403) {
    return new HttpError(
      409,
      "MINIMAX_KEY_INVALID",
      "MiniMax 密钥不可用，请在 AI 育儿助手中重新配置",
    );
  }
  return new HttpError(
    502,
    "MINIMAX_REQUEST_FAILED",
    "MiniMax 暂时无法生成内容，请稍后再试",
  );
}

async function postMiniMax(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  config: AppConfig,
) {
  let lastError: MiniMaxRequestError | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.MINIMAX_REQUEST_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => null)) as MiniMaxResponse | null;
      const providerCode = body?.base_resp?.status_code ?? null;
      if (!body || !response.ok || providerCode !== 0) {
        throw new MiniMaxRequestError(
          body?.base_resp?.status_msg || `HTTP ${response.status}`,
          providerCode,
          response.status,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof MiniMaxRequestError) {
        lastError = error;
        if (
          error.providerCode === 1002 ||
          error.providerCode === 1026 ||
          error.httpStatus === 401 ||
          error.httpStatus === 403
        ) {
          break;
        }
      } else {
        lastError = new MiniMaxRequestError(
          error instanceof Error ? error.message : "network error",
          null,
          0,
        );
      }
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    }
  }
  throw providerErrorMessage(
    lastError ?? new MiniMaxRequestError("unknown error", null, 0),
  );
}

export async function generateMiniMaxImage(input: {
  apiKey: string;
  prompt: string;
  safePrompt?: string;
  config: AppConfig;
}) {
  const payload = (prompt: string) => ({
    model: "image-01",
    prompt,
    aspect_ratio: "1:1",
    response_format: "base64",
    n: 1,
    prompt_optimizer: false,
  });
  let response: MiniMaxResponse;
  try {
    response = await postMiniMax(
      IMAGE_ENDPOINT,
      input.apiKey,
      payload(input.prompt),
      input.config,
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.code === "MINIMAX_PROMPT_REJECTED" &&
      input.safePrompt
    ) {
      response = await postMiniMax(
        IMAGE_ENDPOINT,
        input.apiKey,
        payload(input.safePrompt),
        input.config,
      );
    } else {
      throw error;
    }
  }
  const encoded = response.data?.image_base64?.[0];
  if (!encoded) {
    throw new HttpError(
      502,
      "MINIMAX_IMAGE_MISSING",
      "MiniMax 没有返回可用图片，请稍后再试",
    );
  }
  return Buffer.from(encoded, "base64");
}

export async function generateMiniMaxSpeech(input: {
  apiKey: string;
  text: string;
  config: AppConfig;
}) {
  const response = await postMiniMax(
    SPEECH_ENDPOINT,
    input.apiKey,
    {
      model: "speech-2.8-turbo",
      text: input.text,
      stream: false,
      language_boost: "Chinese",
      output_format: "hex",
      voice_setting: {
        voice_id: "female-shaonv",
        speed: 0.88,
        vol: 1,
        pitch: 0,
        emotion: "happy",
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 64000,
        format: "mp3",
        channel: 1,
      },
      pronunciation_dict: { tone: [] },
      subtitle_enable: false,
    },
    input.config,
  );
  const encoded = response.data?.audio;
  if (!encoded) {
    throw new HttpError(
      502,
      "MINIMAX_AUDIO_MISSING",
      "MiniMax 没有返回可用音频，请稍后再试",
    );
  }
  return Buffer.from(encoded, "hex");
}

export function hanziImagePrompts(input: {
  meaning: string;
  shapeHint: string;
  sentence: string;
}) {
  const style = [
    "No text, no Chinese characters, no letters, no numbers, no pinyin, no symbols, no labels, no signs, no book pages, no worksheets, no UI, no watermark.",
    "Warm children's picture-book style, soft cream background, rounded cute shapes, subtle paper grain, clean edges, low complexity, bright but gentle colors.",
    "One clear centered subject or simple scene. Keep the full subject inside frame with 18% to 24% empty safe margin on all sides.",
  ].join(" ");
  return {
    prompt: [
      "Square semantic illustration for a 5-year-old Chinese learning app.",
      `Concept meaning: ${input.meaning}. Visual clue: ${input.shapeHint}. Example context: ${input.sentence}.`,
      style,
    ].join(" "),
    safePrompt: [
      "Square semantic illustration for a 5-year-old Chinese learning app.",
      "Show one friendly everyday object or a simple peaceful nature scene that a young child can understand.",
      style,
    ].join(" "),
  };
}

function safePoemTheme(title: string, content: string) {
  const text = `${title}${content}`;
  const themes: Array<[RegExp, string]> = [
    [/鹅|鸭|鸟|鹭|黄鹂|蝉|蜂|蝶|燕/u, "gentle birds or small animals in a bright natural setting"],
    [/柳|草|花|梅|菊|荷|莲|竹|松/u, "plants and flowers in a peaceful garden or riverside scene"],
    [/月|夜|星|宿/u, "a quiet moonlit night with soft light and a peaceful landscape"],
    [/春|晓|雨|风/u, "a fresh spring morning with soft breeze, flowers, and gentle rain"],
    [/秋|霜|枫/u, "a calm autumn scene with golden leaves and clear sky"],
    [/冬|雪|寒/u, "a cozy winter scene with soft snow and warm colors"],
    [/山|峰|岭|岳/u, "rounded mountains, clouds, and a wide peaceful landscape"],
    [/江|河|湖|溪|水|海|泉|舟/u, "a river or lake with a small boat and gentle ripples"],
    [/乡|家|村|回/u, "a warm familiar village with children and countryside homes"],
    [/田|农|麦|禾|稻/u, "fields, crops, and a sunny countryside farming scene"],
  ];
  return themes.find(([pattern]) => pattern.test(text))?.[1] ??
    "a peaceful ancient Chinese nature scene inspired by classical poetry";
}

export function poemImagePrompts(input: {
  title: string;
  dynasty: string;
  author: string;
  content: string;
}) {
  const theme = safePoemTheme(input.title, input.content);
  const style = [
    "Warm picture-book style for a children's iPad learning product: soft cream background, rounded cute forms, subtle paper grain, clean edges, gentle bright colors.",
    "One clear scene with a strong central composition and 14% to 22% empty safe margin.",
    "No text, no Chinese characters, no letters, no numbers, no pinyin, no titles, no labels, no book pages, no calligraphy, no signs, no watermark, no logo.",
  ].join(" ");
  return {
    prompt: [
      "Create a square semantic illustration for a 5-year-old Chinese poem recitation app.",
      `Poem title: ${input.title}. Dynasty: ${input.dynasty}. Author: ${input.author}. Theme: ${theme}.`,
      "Show the concrete scene, mood, season, objects, people, plants, and landscape suggested by the theme.",
      style,
    ].join(" "),
    safePrompt: [
      "Create a square illustration for a children's classical poem recitation app.",
      `Theme: ${theme}.`,
      "Show a calm ancient Chinese outdoor scene with nature, warm light, and a clear child-friendly mood.",
      style,
    ].join(" "),
  };
}

export function poemSpeechText(input: {
  title: string;
  dynasty: string;
  author: string;
  content: string;
}) {
  return `《${input.title}》。${input.dynasty}代，${input.author}。${input.content}`;
}
