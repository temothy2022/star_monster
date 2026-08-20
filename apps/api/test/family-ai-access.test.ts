import { describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/http-error.js";
import {
  assertFamilyAiAccessEnabled,
  FAMILY_AI_ACCESS_DENIED_MESSAGE,
} from "../src/services/system-ai-service.js";

describe("family AI access", () => {
  it("allows an authorized family", () => {
    expect(() => assertFamilyAiAccessEnabled(true)).not.toThrow();
  });

  it("rejects an unauthorized family with the parent-facing message", () => {
    try {
      assertFamilyAiAccessEnabled(false);
      throw new Error("expected access check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({
        statusCode: 403,
        code: "AI_ACCESS_DISABLED",
        message: FAMILY_AI_ACCESS_DENIED_MESSAGE,
      });
    }
  });
});
