import { describe, expect, it } from "vitest";
import {
  petExperienceForNextLevel,
  petDialogueContext,
  petGrowthStageForLevel,
  petLevelFromExperience,
  petManualRedPacketGrantPlan,
  parsePetRoomAmbience,
  petRedPacketGrantPlan,
  petWasteSchedulePlan,
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

  it("grants every packet for every crossed pet level with stable keys", () => {
    expect(petRedPacketGrantPlan({
      profileId: "profile-1",
      childId: "child-1",
      currentLevel: 2,
      nextLevel: 4,
      packetsPerLevel: 2,
      minStars: 2,
      maxStars: 6,
    })).toEqual([
      expect.objectContaining({ sourceLevel: 3, grantKey: "pet-level:profile-1:3:packet:1", minStarsSnapshot: 2, maxStarsSnapshot: 6 }),
      expect.objectContaining({ sourceLevel: 3, grantKey: "pet-level:profile-1:3:packet:2", minStarsSnapshot: 2, maxStarsSnapshot: 6 }),
      expect.objectContaining({ sourceLevel: 4, grantKey: "pet-level:profile-1:4:packet:1", minStarsSnapshot: 2, maxStarsSnapshot: 6 }),
      expect.objectContaining({ sourceLevel: 4, grantKey: "pet-level:profile-1:4:packet:2", minStarsSnapshot: 2, maxStarsSnapshot: 6 }),
    ]);
  });

  it("normalizes red packet settings and allows parents to disable future grants", () => {
    expect(petRedPacketGrantPlan({
      profileId: "profile-1",
      childId: "child-1",
      currentLevel: 1,
      nextLevel: 2,
      packetsPerLevel: 0,
      minStars: 8,
      maxStars: 3,
    })).toEqual([]);
    expect(petRedPacketGrantPlan({
      profileId: "profile-1",
      childId: "child-1",
      currentLevel: 1,
      nextLevel: 2,
      packetsPerLevel: 1,
      minStars: 8,
      maxStars: 3,
    })[0]).toEqual(expect.objectContaining({ minStarsSnapshot: 3, maxStarsSnapshot: 8 }));
  });

  it("creates separately keyed parent-granted red packets with current reward settings", () => {
    expect(petManualRedPacketGrantPlan({
      profileId: "profile-1",
      childId: "child-1",
      sourceLevel: 6,
      count: 2,
      minStars: 5,
      maxStars: 2,
      batchKey: "batch-1",
    })).toEqual([
      expect.objectContaining({
        sourceLevel: 6,
        minStarsSnapshot: 2,
        maxStarsSnapshot: 5,
        grantKey: "pet-manual:profile-1:batch-1:packet:1",
      }),
      expect.objectContaining({ grantKey: "pet-manual:profile-1:batch-1:packet:2" }),
    ]);
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

  it("spreads the configured pet waste count across stable daytime windows", () => {
    const schedule = petWasteSchedulePlan({
      childId: "child-1",
      profileId: "profile-1",
      wasteDate: new Date("2026-08-10T00:00:00.000Z"),
      count: 3,
      costStars: 1,
      randomValue: () => 0,
    });

    expect(schedule).toHaveLength(3);
    expect(schedule.map((item) => item.appearsMinute)).toEqual([480, 740, 1000]);
    expect(schedule.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(schedule.every((item) => item.costStarsSnapshot === 1)).toBe(true);
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

  it("keeps only valid room ambience layers from database configuration", () => {
    expect(parsePetRoomAmbience([
      { imageUrl: "/clouds.webp", motion: "DRIFT", placement: "TOP" },
      null,
      { imageUrl: 42, motion: "FLY", placement: "UPPER_RIGHT" },
    ])).toEqual([
      { imageUrl: "/clouds.webp", motion: "DRIFT", placement: "TOP" },
    ]);
    expect(parsePetRoomAmbience("not-an-array")).toEqual([]);
  });
});
