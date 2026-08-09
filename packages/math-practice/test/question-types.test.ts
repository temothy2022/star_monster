import { describe, expect, it } from "vitest";
import {
  getMathQuestionTypesByDomain,
  MATH_CORE_GENERATOR_IDS,
  MATH_QUESTION_DOMAINS,
  MATH_QUESTION_TYPES,
  MATH_QUESTION_TYPES_BY_ID,
  MATH_RESPONSE_MODES,
} from "../src/index";

describe("math practice question type registry", () => {
  it("registers 42 teaching types across the expected six domains", () => {
    expect(MATH_QUESTION_TYPES).toHaveLength(42);
    expect(MATH_QUESTION_DOMAINS.map((domain) => domain.id)).toEqual([
      "N",
      "P",
      "C",
      "V",
      "W",
      "S",
    ]);

    expect(
      Object.fromEntries(
        MATH_QUESTION_DOMAINS.map((domain) => [
          domain.id,
          getMathQuestionTypesByDomain(domain.id).length,
        ]),
      ),
    ).toEqual({ N: 11, P: 7, C: 6, V: 7, W: 7, S: 4 });
  });

  it("maps the teaching types onto exactly 35 used core generators", () => {
    const usedCoreGenerators = new Set(
      MATH_QUESTION_TYPES.map((definition) => definition.coreGeneratorId),
    );

    expect(MATH_CORE_GENERATOR_IDS).toHaveLength(35);
    expect(usedCoreGenerators.size).toBe(35);
    expect([...usedCoreGenerators].sort()).toEqual(
      [...MATH_CORE_GENERATOR_IDS].sort(),
    );
  });

  it("keeps ids, slugs and preview fixture ids unique", () => {
    for (const key of ["id", "slug", "previewFixtureId"] as const) {
      const values = MATH_QUESTION_TYPES.map((definition) => definition[key]);
      expect(new Set(values).size, `${key} must be unique`).toBe(values.length);
    }
  });

  it("provides a complete lookup by teaching type id", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      expect(MATH_QUESTION_TYPES_BY_ID[definition.id]).toBe(definition);
    }
    expect(Object.keys(MATH_QUESTION_TYPES_BY_ID)).toHaveLength(42);
  });

  it("only references registered response modes and source images", () => {
    const responseModeIds = new Set(MATH_RESPONSE_MODES.map((mode) => mode.id));

    for (const definition of MATH_QUESTION_TYPES) {
      expect(definition.responseModes.length).toBeGreaterThan(0);
      expect(
        definition.responseModes.every((mode) => responseModeIds.has(mode)),
      ).toBe(true);
      expect(definition.sourceImageNumbers.length).toBeGreaterThan(0);
      expect(
        definition.sourceImageNumbers.every(
          (imageNumber) => imageNumber >= 1 && imageNumber <= 26,
        ),
      ).toBe(true);
      expect(definition.difficultyRange[0]).toBeLessThanOrEqual(
        definition.difficultyRange[1],
      );
    }
  });

  it("shares only the intended mathematical cores across presentation types", () => {
    const typesByCore = new Map<string, string[]>();
    for (const definition of MATH_QUESTION_TYPES) {
      const ids = typesByCore.get(definition.coreGeneratorId) ?? [];
      ids.push(definition.id);
      typesByCore.set(definition.coreGeneratorId, ids);
    }

    const shared = Object.fromEntries(
      [...typesByCore.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([core, ids]) => [core, ids]),
    );

    expect(shared).toEqual({
      COMPARE_QUANTITIES: ["N10", "W06"],
      PART_WHOLE_TOTAL: ["V01", "W01", "W02", "W07"],
      PART_WHOLE_MISSING: ["V02", "W04", "W05"],
      TAKE_AWAY_REMAINING: ["V04", "W03"],
    });
  });
});
