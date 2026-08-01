import { describe, expect, it } from "vitest";
import {
  PLANET_DEFINITIONS,
  PLANET_KEYS,
  resolveLifetimeStarsEarned,
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

describe("航行能量", () => {
  it("uses the highest reliable historical star count", () => {
    expect(
      resolveLifetimeStarsEarned({
        storedLifetimeStarsEarned: 38,
        starBalance: 52,
        ledgerLifetimeStars: 44,
      }),
    ).toBe(52);

    expect(
      resolveLifetimeStarsEarned({
        storedLifetimeStarsEarned: 120,
        starBalance: 12,
        ledgerLifetimeStars: 96,
      }),
    ).toBe(120);
  });

  it("keeps refunded task rewards out of the reconciled lifetime total", () => {
    expect(
      resolveLifetimeStarsEarned({
        storedLifetimeStarsEarned: 100,
        starBalance: 36,
        ledgerLifetimeStars: 100,
      }),
    ).toBe(100);
  });
});
