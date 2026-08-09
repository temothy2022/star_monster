import { describe, expect, it } from "vitest";
import {
  MATH_QUESTION_TYPES,
  answerMathQuestion,
  generateMathQuestion,
  generateMathWorksheet,
} from "../src/index";

describe("math practice question generator", () => {
  it("generates every registered teaching type deterministically", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      for (let offset = 0; offset < 12; offset += 1) {
        const input = { typeId: definition.id, seed: 20260809 + offset };
        const first = generateMathQuestion(input);
        const second = generateMathQuestion(input);

        expect(first, definition.id).toEqual(second);
        expect(first.typeId).toBe(definition.id);
        expect(first.prompt.length).toBeGreaterThan(0);
        expect(first.answer.values.length).toBeGreaterThan(0);
        expect(first.explanation.length).toBeGreaterThan(0);
        expect(answerMathQuestion(first, first.answer.values), definition.id).toBe(true);
      }
    }
  });

  it("rejects an incorrect response for every teaching type", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      const question = generateMathQuestion({ typeId: definition.id, seed: 99 });
      const wrong = [...question.answer.values];
      wrong[0] = `${wrong[0]}-not-correct`;
      expect(answerMathQuestion(question, wrong), definition.id).toBe(false);
    }
  });

  it("builds and shuffles a worksheet without changing its requested mix", () => {
    const worksheet = generateMathWorksheet({ N01: 3, C01: 2, V04: 4, S04: 1 }, 17);
    expect(worksheet).toHaveLength(10);
    expect(
      Object.fromEntries(
        ["N01", "C01", "V04", "S04"].map((typeId) => [
          typeId,
          worksheet.filter((question) => question.typeId === typeId).length,
        ]),
      ),
    ).toEqual({ N01: 3, C01: 2, V04: 4, S04: 1 });
    expect(worksheet).toEqual(generateMathWorksheet({ N01: 3, C01: 2, V04: 4, S04: 1 }, 17));
  });

  it("uses program coordinates as the source of truth for cube counting", () => {
    const structures = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const question = generateMathQuestion({ typeId: "S04", seed });
      expect(question.visual.kind).toBe("CUBES");
      if (question.visual.kind !== "CUBES") continue;
      expect(question.answer.values).toEqual([String(question.visual.cubes.length)]);
      expect(new Set(question.visual.cubes.map((cube) => cube.join(","))).size).toBe(question.visual.cubes.length);
      structures.add(JSON.stringify(question.visual.cubes));
    }
    expect(structures.size).toBeGreaterThan(5);
  });

  it("progresses S04 from easy to medium to hard", () => {
    const worksheet = generateMathWorksheet({ S04: 10 }, 20260809);
    expect(worksheet.map((question) => question.difficulty)).toEqual([
      1, 1, 1, 2, 2, 2, 2, 2, 3, 3,
    ]);
    for (const question of worksheet) {
      expect(question.visual.kind).toBe("CUBES");
      if (question.visual.kind !== "CUBES") continue;
      const maxHeight = Math.max(...question.visual.cubes.map(([, , z]) => z));
      if (question.difficulty === 1) {
        expect(question.visual.cubes.length).toBeLessThanOrEqual(4);
        expect(maxHeight).toBeLessThanOrEqual(1);
      }
      if (question.difficulty === 3) expect(maxHeight).toBeLessThanOrEqual(2);
    }
  });
});
