import { describe, expect, it } from "vitest";
import {
  generateChildLoginCode,
  hashSecret,
  loginCodeLookup,
  normalizeChildLoginCode,
  verifySecret,
} from "../src/lib/crypto.js";
import {
  CHILD_LOGIN_ALPHABET,
  CHILD_LOGIN_CODE_LENGTH,
} from "../src/domain/constants.js";

describe("孩子探险代码", () => {
  it("忽略空格和短横线并统一为大写", () => {
    expect(normalizeChildLoginCode("ab-cd 1234")).toBe("ABCD1234");
  });

  it("生成固定长度且不含易混淆字符的代码", () => {
    for (let index = 0; index < 50; index += 1) {
      const code = generateChildLoginCode();
      expect(code).toHaveLength(CHILD_LOGIN_CODE_LENGTH);
      expect([...code].every((character) => CHILD_LOGIN_ALPHABET.includes(character))).toBe(true);
    }
  });

  it("查找摘要依赖稳定 pepper", () => {
    expect(loginCodeLookup("ABCD1234", "x".repeat(32))).toBe(
      loginCodeLookup("abcd-1234", "x".repeat(32)),
    );
    expect(loginCodeLookup("ABCD1234", "x".repeat(32))).not.toBe(
      loginCodeLookup("ABCD1234", "y".repeat(32)),
    );
  });
});

describe("密码与代码哈希", () => {
  it("只验证正确的原文", async () => {
    const stored = await hashSecret("correct-secret");
    await expect(verifySecret("correct-secret", stored)).resolves.toBe(true);
    await expect(verifySecret("wrong-secret", stored)).resolves.toBe(false);
  });
});
