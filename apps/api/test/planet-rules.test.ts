import { describe, expect, it } from "vitest";
import {
  PLANET_DEFINITIONS,
  PLANET_KEYS,
} from "../src/services/planet-service.js";

describe("planet map defaults", () => {
  it("contains the eight planets once in journey order", () => {
    expect(PLANET_KEYS).toEqual([
      "MERCURY",
      "VENUS",
      "EARTH",
      "MARS",
      "JUPITER",
      "SATURN",
      "URANUS",
      "NEPTUNE",
    ]);
    expect(new Set(PLANET_KEYS).size).toBe(8);
  });

  it("uses nondecreasing thresholds and nonnegative one-time bonuses", () => {
    PLANET_DEFINITIONS.forEach((definition, index) => {
      expect(definition.requiredLifetimeStars).toBeGreaterThanOrEqual(
        index === 0
          ? 0
          : PLANET_DEFINITIONS[index - 1].requiredLifetimeStars,
      );
      expect(definition.bonusStars).toBeGreaterThanOrEqual(0);
    });
  });
});
