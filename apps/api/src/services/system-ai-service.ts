import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { decryptSecret } from "../lib/secret-encryption.js";

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
