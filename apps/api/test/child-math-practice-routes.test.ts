import { describe, expect, it } from "vitest";
import { mathPracticeAnswerInputSchema } from "../src/routes/child-math-practice-routes.js";

describe("math practice answer input", () => {
  it("accepts all 16 editable values from a four-row V07 answer", () => {
    const values = [
      "5", "+", "1", "6",
      "1", "+", "5", "6",
      "6", "-", "1", "5",
      "6", "-", "5", "1",
    ];

    expect(mathPracticeAnswerInputSchema.parse({
      questionIndex: 3,
      values,
      responseMs: 12_000,
    }).values).toEqual(values);
  });
});
