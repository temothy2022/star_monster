import { prisma } from "../lib/prisma.js";

export type AiModelProvider = "DEEPSEEK" | "MINIMAX";
export type AiModelCallStatus = "SUCCESS" | "ERROR";

export function recordAiModelCall(input: {
  provider: AiModelProvider;
  operation: string;
  model: string;
  status: AiModelCallStatus;
  startedAt: number;
  httpStatus?: number | null;
  providerCode?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}) {
  const durationMs = Math.max(0, Math.round(Date.now() - input.startedAt));
  void prisma.aiModelCall
    .create({
      data: {
        provider: input.provider,
        operation: input.operation,
        model: input.model,
        status: input.status,
        httpStatus: input.httpStatus ?? null,
        providerCode: input.providerCode ?? null,
        durationMs,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        totalTokens: input.totalTokens ?? null,
      },
    })
    .catch(() => {
      // Metrics must never make an AI request fail or become slower.
    });
}
