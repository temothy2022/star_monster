import { describe, expect, it } from "vitest";
import {
  petExperienceForNextLevel,
  petDialogueContext,
  petGrowthStageForLevel,
  petLevelFromExperience,
  settledPetStatus,
} from "../src/services/pet-growth-service.js";

describe("pet growth rules", () => {
  it("derives stable levels from accumulated care and travel experience", () => {
    expect(petLevelFromExperience(0)).toBe(1);
    expect(petLevelFromExperience(24)).toBe(2);
    expect(petLevelFromExperience(96)).toBe(3);
    expect(petLevelFromExperience(100_000)).toBe(30);
  });

  it("moves through the three visible growth stages", () => {
    expect(petGrowthStageForLevel(1)).toBe("BABY");
    expect(petGrowthStageForLevel(5)).toBe("GROWING");
    expect(petGrowthStageForLevel(10)).toBe("MATURE");
  });

  it("reports the next level threshold and caps at level 30", () => {
    expect(petExperienceForNextLevel(1)).toBe(24);
    expect(petExperienceForNextLevel(5)).toBe(600);
    expect(petExperienceForNextLevel(30)).toBeNull();
  });

  it("keeps decay remainders independently for different care intervals", () => {
    const startedAt = new Date("2026-08-07T00:00:00.000Z");
    const now = new Date("2026-08-07T03:10:00.000Z");

    expect(settledPetStatus(80, startedAt, now, 120)).toEqual({
      value: 79,
      settledAt: new Date("2026-08-07T02:00:00.000Z"),
      changed: true,
    });
    expect(settledPetStatus(80, startedAt, now, 90)).toEqual({
      value: 78,
      settledAt: new Date("2026-08-07T03:00:00.000Z"),
      changed: true,
    });
  });

  it("prioritizes care needs over task progress in room dialogue", () => {
    expect(petDialogueContext({ satiety: 20, hydration: 20, totalTasks: 4, completedTasks: 4 }))
      .toBe("PET_NEEDS_CARE");
    expect(petDialogueContext({ satiety: 25, hydration: 80, totalTasks: 4, completedTasks: 4 }))
      .toBe("PET_HUNGRY");
    expect(petDialogueContext({ satiety: 80, hydration: 30, totalTasks: 4, completedTasks: 4 }))
      .toBe("PET_THIRSTY");
  });

  it("uses today's completion state when the pet is comfortable", () => {
    expect(petDialogueContext({ satiety: 80, hydration: 80, totalTasks: 0, completedTasks: 0 }))
      .toBe("PET_RELAX");
    expect(petDialogueContext({ satiety: 80, hydration: 80, totalTasks: 4, completedTasks: 0 }))
      .toBe("PET_TASK_START");
    expect(petDialogueContext({ satiety: 80, hydration: 80, totalTasks: 4, completedTasks: 2 }))
      .toBe("PET_TASK_PROGRESS");
    expect(petDialogueContext({ satiety: 80, hydration: 80, totalTasks: 4, completedTasks: 4 }))
      .toBe("PET_TASK_COMPLETE");
  });
});
