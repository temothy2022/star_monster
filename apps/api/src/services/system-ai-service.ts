import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { decryptSecret } from "../lib/secret-encryption.js";

export const FAMILY_AI_ACCESS_DENIED_MESSAGE =
  "当前用户暂时没有 AI 成长顾问的访问权限，如需开放请联系管理员。";

export async function familyAiAccessEnabled(familyId: string) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { aiAccessEnabled: true },
  });
  return Boolean(family?.aiAccessEnabled);
}

export function assertFamilyAiAccessEnabled(enabled: boolean) {
  if (enabled) return;
  throw new HttpError(
    403,
    "AI_ACCESS_DISABLED",
    FAMILY_AI_ACCESS_DENIED_MESSAGE,
  );
}

export async function requireFamilyAiAccess(familyId: string) {
  assertFamilyAiAccessEnabled(await familyAiAccessEnabled(familyId));
}

export async function systemAiCredentials(
  config: AppConfig,
  requireEnabled = true,
) {
  const stored = await prisma.systemAiConfig.findUnique({
    where: { id: "default" },
  });
  if (!stored || (requireEnabled && !stored.enabled)) {
    throw new HttpError(
      409,
      "AI_NOT_CONFIGURED",
      "请先在超级后台保存并启用 DeepSeek 密钥",
    );
  }
  if (
    !stored.encryptedApiKey ||
    !stored.encryptionIv ||
    !stored.encryptionTag
  ) {
    throw new HttpError(
      409,
      "AI_KEY_INCOMPLETE",
      "DeepSeek 密钥配置不完整，请在超级后台重新保存密钥",
    );
  }
  return {
    model: stored.model,
    apiKey: decryptSecret(
      {
        ciphertext: stored.encryptedApiKey,
        iv: stored.encryptionIv,
        tag: stored.encryptionTag,
      },
      config.AI_CONFIG_ENCRYPTION_KEY,
    ),
  };
}
