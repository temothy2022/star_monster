import { describe, expect, it } from "vitest";
import { encryptSecret } from "../src/lib/secret-encryption.js";
import { revealChildLoginCode } from "../src/services/account-service.js";

describe("child login code storage", () => {
  const encryptionKey = "a-stable-child-code-encryption-key-over-32-characters";

  it("reveals a code from authenticated encrypted storage", () => {
    const encrypted = encryptSecret("ABCD2345", encryptionKey);
    expect(revealChildLoginCode({
      loginCodeCiphertext: encrypted.ciphertext,
      loginCodeEncryptionIv: encrypted.iv,
      loginCodeEncryptionTag: encrypted.tag,
    }, encryptionKey)).toBe("ABCD2345");
  });

  it("marks historical hash-only codes as unavailable", () => {
    expect(revealChildLoginCode({
      loginCodeCiphertext: null,
      loginCodeEncryptionIv: null,
      loginCodeEncryptionTag: null,
    }, encryptionKey)).toBeNull();
  });
});
