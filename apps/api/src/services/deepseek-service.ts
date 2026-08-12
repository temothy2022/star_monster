import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  model: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

const modelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      owned_by: z.string().optional().default("deepseek"),
    }),
  ),
});

type DeepSeekResult<T> = {
  data: T;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export async function callDeepSeekText(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPayload: unknown;
  config: AppConfig;
  maxTokens?: number;
}): Promise<{ text: string; model: string; usage?: DeepSeekResult<unknown>["usage"] }> {
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        thinking: { type: "disabled" },
        temperature: 0.35,
        max_tokens: input.maxTokens ?? 80,
        messages: [
          { role: "system", content: input.systemPrompt },
          {
            role: "user",
            content: `请根据以下匿名化数据只返回一句中文短句，不要 JSON，不要解释。\n${JSON.stringify(input.userPayload)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(input.config.AI_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, "AI_PROVIDER_UNAVAILABLE", "DeepSeek 暂时无法连接，请稍后再试");
  }

  if (!response.ok) {
    await response.text();
    throw new HttpError(
      response.status === 401 ? 400 : 502,
      "AI_PROVIDER_ERROR",
      response.status === 401
        ? "DeepSeek 密钥无效或已失效"
        : response.status === 429
          ? "DeepSeek 请求过于频繁，请稍后再试"
          : `DeepSeek 暂时无法完成请求（${response.status}）`,
    );
  }

  const providerResponse = responseSchema.parse(await response.json());
  const text = providerResponse.choices[0]?.message.content?.trim();
  if (!text) throw new HttpError(502, "AI_INVALID_RESPONSE", "DeepSeek 没有返回来信内容，请重试");
  return {
    text,
    model: providerResponse.model ?? input.model,
    usage: providerResponse.usage,
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("模型没有返回有效 JSON");
  }
}

function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 20)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}

function boundedModelOutput(content: string): string {
  const limit = 12_000;
  return content.length <= limit
    ? content
    : `${content.slice(0, limit)}\n（上一次输出过长，已截断）`;
}

export async function listDeepSeekModels(input: {
  apiKey: string;
  config: AppConfig;
}): Promise<Array<{ id: string; ownedBy: string }>> {
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(input.config.AI_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(
      502,
      "AI_PROVIDER_UNAVAILABLE",
      "暂时无法获取 DeepSeek 模型列表，请稍后再试",
    );
  }

  if (!response.ok) {
    throw new HttpError(
      response.status === 401 ? 400 : 502,
      "AI_PROVIDER_ERROR",
      response.status === 401
        ? "DeepSeek 密钥无效或已失效"
        : `DeepSeek 模型列表暂时无法读取（${response.status}）`,
    );
  }

  const parsed = modelsResponseSchema.parse(await response.json());
  return parsed.data
    .map((model) => ({ id: model.id, ownedBy: model.owned_by }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function callDeepSeekJson<T>(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPayload: unknown;
  outputSchema: z.ZodType<T>;
  config: AppConfig;
  maxTokens?: number;
}): Promise<DeepSeekResult<T>> {
  let repair:
    | {
        previousOutput: string;
        issues: string;
      }
    | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const messages = [
        { role: "system", content: input.systemPrompt },
        {
          role: "user",
          content: `请根据以下匿名化数据返回 json 对象。不得输出额外文字。\n${JSON.stringify(input.userPayload)}`,
        },
      ];

      if (repair) {
        messages.push(
          { role: "assistant", content: repair.previousOutput },
          {
            role: "user",
            content: `上一次输出未通过结构校验。请根据下面的校验问题修正所有字段，只返回完整、有效的 JSON 对象，不要解释，也不要省略任何必填字段。\n校验问题：\n${repair.issues}`,
          },
        );
      }

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          temperature: 0.2,
          max_tokens: input.maxTokens ?? 8192,
          messages,
        }),
        signal: AbortSignal.timeout(input.config.AI_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        await response.text();
        const providerMessage =
          response.status === 401
            ? "DeepSeek 密钥无效或已失效"
            : response.status === 429
              ? "DeepSeek 请求过于频繁，请稍后再试"
              : `DeepSeek 暂时无法完成请求（${response.status}）`;
        throw new HttpError(
          response.status === 401 ? 400 : 502,
          "AI_PROVIDER_ERROR",
          providerMessage,
        );
      }

      const providerResponse = responseSchema.parse(await response.json());
      const content = providerResponse.choices[0]?.message.content?.trim();
      if (!content) {
        repair = {
          previousOutput: "{}",
          issues: "模型返回内容为空；请重新输出完整 JSON 对象",
        };
        throw new Error("模型返回内容为空");
      }

      let parsedContent: unknown;
      try {
        parsedContent = parseJsonContent(content);
      } catch {
        repair = {
          previousOutput: boundedModelOutput(content),
          issues:
            providerResponse.choices[0]?.finish_reason === "length"
              ? "输出因长度限制被截断；请精简自然语言字段并重新输出完整 JSON 对象"
              : "输出不是有效的 JSON 对象；请检查引号、逗号、括号和转义字符",
        };
        throw new Error("模型没有返回有效 JSON");
      }

      const validation = input.outputSchema.safeParse(parsedContent);
      if (!validation.success) {
        repair = {
          previousOutput: boundedModelOutput(content),
          issues: formatValidationIssues(validation.error),
        };
        throw validation.error;
      }

      return {
        data: validation.data,
        model: providerResponse.model ?? input.model,
        usage: providerResponse.usage,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
    }
  }

  throw new HttpError(
    502,
    "AI_INVALID_RESPONSE",
    "AI 返回的方案格式不完整，请重新生成一次",
  );
}
