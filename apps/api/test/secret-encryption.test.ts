import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/lib/secret-encryption.js";

describe("AI secret encryption", () => {
  const masterKey = "a-unique-master-key-that-is-longer-than-32-characters";

  it("round trips without exposing plaintext", () => {
    const encrypted = encryptSecret("sk-example-sensitive-key", masterKey);
    expect(encrypted.ciphertext).not.toContain("sk-example");
    expect(decryptSecret(encrypted, masterKey)).toBe("sk-example-sensitive-key");
  });

  it("rejects a modified authentication tag", () => {
    const encrypted = encryptSecret("sk-example-sensitive-key", masterKey);
    expect(() =>
      decryptSecret({ ...encrypted, tag: Buffer.alloc(16).toString("base64") }, masterKey),
    ).toThrow();
  });
});

