export type LeaderboardPetType =
  | "DOUYA"
  | "PAOPAO"
  | "TUANTUAN"
  | "MILU"
  | "SHANSHAN";

export type LeaderboardFlagKey =
  | "CHINA"
  | "JAPAN"
  | "KOREA"
  | "SINGAPORE"
  | "UNITED_KINGDOM"
  | "FRANCE"
  | "GERMANY"
  | "ITALY"
  | "CANADA"
  | "AUSTRALIA"
  | "BRAZIL"
  | "UNITED_STATES";

export type MotivationalLeaderboardInput = {
  childId: string;
  nickname?: string | null;
  stars: number;
  completedTasks: number;
  petType: LeaderboardPetType | null;
  goalStars: number;
  completionRate: number;
  dailyGoalStars?: number;
  seed: string;
  scoreDays?: ReadonlyArray<{
    seed: string;
    elapsedMinutes: number;
  }>;
  participantCount?: number;
  competitorGrowthPercent?: number;
  competitorStarDelta?: number;
};

const PET_TYPES: LeaderboardPetType[] = [
  "DOUYA",
  "PAOPAO",
  "TUANTUAN",
  "MILU",
  "SHANSHAN",
];

const COMPETITOR_FLAGS: LeaderboardFlagKey[] = [
  "CHINA",
  "CHINA",
  "CHINA",
  "CHINA",
  "CHINA",
  "CHINA",
  "JAPAN",
  "KOREA",
  "SINGAPORE",
  "UNITED_KINGDOM",
  "FRANCE",
];

const COMPETITOR_NAMES = [
  "Leo",
  "Mia",
  "Max",
  "Ava",
  "Sam",
  "Zoe",
  "Ben",
  "Ivy",
  "Eli",
  "Joy",
  "Tom",
  "Amy",
];

const MINUTES_PER_DAY = 24 * 60;

const ACTIVITY_WINDOWS = [
  [[430, 500], [720, 790], [970, 1080], [1150, 1300]],
  [[960, 1050], [1060, 1140], [1170, 1260], [1270, 1360]],
  [[1080, 1140], [1150, 1210], [1220, 1290], [1300, 1370]],
  [[420, 490], [710, 780], [930, 1020], [1110, 1240]],
  [[450, 510], [710, 790], [900, 980], [1020, 1120], [1200, 1360]],
] as const;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function virtualIdentity(seed: string, virtualIndex: number) {
  const offset = stableHash(seed) % COMPETITOR_NAMES.length;
  return {
    displayName:
      COMPETITOR_NAMES[(virtualIndex + offset) % COMPETITOR_NAMES.length],
    petType: PET_TYPES[(virtualIndex + offset) % PET_TYPES.length],
    flagKey:
      COMPETITOR_FLAGS[(virtualIndex + offset) % COMPETITOR_FLAGS.length],
  };
}

function virtualDayTarget({
  childId,
  daySeed,
  virtualIndex,
  competitorCount,
  dailyGoalStars,
  competitorGrowthPercent,
}: {
  childId: string;
  daySeed: string;
  virtualIndex: number;
  competitorCount: number;
  dailyGoalStars: number;
  competitorGrowthPercent: number;
}) {
  const basePercent =
    50 + stableHash(`${childId}:${daySeed}:${virtualIndex}:target`) % 45;
  const hasChallenger =
    stableHash(`${childId}:${daySeed}:challenger-day`) % 4 === 0;
  const challengerIndex =
    stableHash(`${childId}:${daySeed}:challenger-slot`) % competitorCount;
  const percent =
    hasChallenger && virtualIndex === challengerIndex
      ? 104 + stableHash(`${childId}:${daySeed}:challenger-score`) % 5
      : basePercent;
  return Math.max(
    1,
    Math.round(
      (dailyGoalStars * percent * competitorGrowthPercent) / 10_000,
    ),
  );
}

function virtualDayProgress({
  childId,
  identitySeed,
  daySeed,
  virtualIndex,
  competitorCount,
  dailyGoalStars,
  elapsedMinutes,
  competitorGrowthPercent,
}: {
  childId: string;
  identitySeed: string;
  daySeed: string;
  virtualIndex: number;
  competitorCount: number;
  dailyGoalStars: number;
  elapsedMinutes: number;
  competitorGrowthPercent: number;
}) {
  const targetStars = virtualDayTarget({
    childId,
    daySeed,
    virtualIndex,
    competitorCount,
    dailyGoalStars,
    competitorGrowthPercent,
  });
  const desiredEvents =
    4 + stableHash(`${childId}:${daySeed}:${virtualIndex}:event-count`) % 4;
  const eventCount = Math.max(1, Math.min(targetStars, desiredEvents));
  const baseReward = Math.floor(targetStars / eventCount);
  const extraRewards = targetStars % eventCount;
  const rewardOffset =
    stableHash(`${childId}:${daySeed}:${virtualIndex}:reward-offset`) % eventCount;
  const windows =
    ACTIVITY_WINDOWS[
      stableHash(`${childId}:${identitySeed}:${virtualIndex}:schedule`) %
        ACTIVITY_WINDOWS.length
    ];
  const completedThrough = Math.min(
    MINUTES_PER_DAY,
    Math.max(0, Math.floor(elapsedMinutes)),
  );

  const events = Array.from({ length: eventCount }, (_, eventIndex) => {
    const windowIndex = Math.min(
      windows.length - 1,
      Math.floor((eventIndex * windows.length) / eventCount),
    );
    const [windowStart, windowEnd] = windows[windowIndex];
    const minute =
      windowStart +
      stableHash(`${childId}:${daySeed}:${virtualIndex}:${eventIndex}:minute`) %
        (windowEnd - windowStart + 1);
    const relativeRewardIndex =
      (eventIndex - rewardOffset + eventCount) % eventCount;
    return {
      minute,
      reward: baseReward + (relativeRewardIndex < extraRewards ? 1 : 0),
    };
  }).sort((left, right) => left.minute - right.minute);

  return events.reduce(
    (summary, event) => {
      if (event.minute <= completedThrough) {
        summary.stars += event.reward;
        summary.completedTasks += 1;
      }
      return summary;
    },
    { stars: 0, completedTasks: 0 },
  );
}

export function buildMotivationalLeaderboard(
  input: MotivationalLeaderboardInput,
) {
  const participantCount = Math.min(
    15,
    Math.max(10, input.participantCount ?? 12),
  );
  const stars = Math.max(0, Math.round(input.stars));
  const completedTasks = Math.max(0, Math.round(input.completedTasks));
  const goalStars = Math.max(1, Math.round(input.goalStars));
  const dailyGoalStars = Math.max(
    1,
    Math.round(input.dailyGoalStars ?? goalStars),
  );
  const scoreDays = input.scoreDays ?? [
    { seed: input.seed, elapsedMinutes: MINUTES_PER_DAY },
  ];
  const competitorCount = participantCount - 1;
  const competitorGrowthPercent = Math.min(
    200,
    Math.max(25, Math.round(input.competitorGrowthPercent ?? 100)),
  );
  const competitorStarDelta = Math.min(
    50,
    Math.max(-50, Math.round(input.competitorStarDelta ?? 0)),
  );
  const competitors = Array.from({ length: competitorCount }, (_, virtualIndex) => {
    const identity = virtualIdentity(input.seed, virtualIndex);
    const progress = scoreDays.reduce(
      (summary, day) => {
        const dayProgress = virtualDayProgress({
          childId: input.childId,
          identitySeed: input.seed,
          daySeed: day.seed,
          virtualIndex,
          competitorCount,
          dailyGoalStars,
          elapsedMinutes: day.elapsedMinutes,
          competitorGrowthPercent,
        });
        summary.stars += dayProgress.stars;
        summary.completedTasks += dayProgress.completedTasks;
        return summary;
      },
      { stars: 0, completedTasks: 0 },
    );
    return {
      displayName: identity.displayName,
      stars: Math.max(0, progress.stars + competitorStarDelta),
      completedTasks: progress.completedTasks,
      petType: identity.petType,
      flagKey: identity.flagKey,
      isSelf: false,
    };
  });

  const entries = [
    ...competitors,
    {
      displayName: input.nickname?.trim() || "我",
      stars,
      completedTasks,
      petType: input.petType ?? "DOUYA",
      flagKey: "CHINA" as const,
      isSelf: true,
    },
  ]
    .sort((left, right) => {
      if (left.stars !== right.stars) return right.stars - left.stars;
      if (left.isSelf !== right.isSelf) {
        if (left.stars === 0) return left.isSelf ? 1 : -1;
        return left.isSelf ? -1 : 1;
      }
      if (left.completedTasks !== right.completedTasks) {
        return right.completedTasks - left.completedTasks;
      }
      return left.displayName.localeCompare(right.displayName, "en");
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const selfEntry = entries.find((entry) => entry.isSelf)!;
  const selfRank = selfEntry.rank;
  const childAbove = selfRank > 1 ? entries[selfRank - 2] : null;
  return {
    entries,
    self: {
      rank: selfRank,
      stars,
      completedTasks,
      totalParticipants: participantCount,
      inTopTen: selfRank <= 10,
      starsToNextRank: childAbove
        ? Math.max(1, childAbove.stars - stars)
        : 0,
    },
  };
}
