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
  seed: string;
  participantCount?: number;
};

const PET_TYPES: LeaderboardPetType[] = [
  "DOUYA",
  "PAOPAO",
  "TUANTUAN",
  "MILU",
  "SHANSHAN",
];

const COMPETITOR_FLAGS: LeaderboardFlagKey[] = [
  "JAPAN",
  "KOREA",
  "SINGAPORE",
  "UNITED_KINGDOM",
  "FRANCE",
  "GERMANY",
  "ITALY",
  "CANADA",
  "AUSTRALIA",
  "BRAZIL",
  "UNITED_STATES",
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

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function motivationalRank({
  stars,
  completedTasks,
  goalStars,
  completionRate,
  seed,
  childId,
  participantCount,
}: MotivationalLeaderboardInput & { participantCount: number }) {
  if (stars <= 0) return participantCount;

  const progress = stars / goalStars;
  if (
    progress >= 1.35 ||
    (completedTasks > 0 && completionRate >= 0.9)
  ) {
    return 1;
  }

  if (progress >= 1) {
    const draw = stableHash(`${childId}:${seed}:goal-rank`) % 100;
    if (draw < 75) return 1;
    if (draw < 95) return 2;
    return 3;
  }

  if (progress >= 0.85) return 4;
  if (progress >= 0.65) return 6;
  if (progress >= 0.45) return 8;
  if (progress >= 0.25) return 10;
  return Math.min(11, participantCount);
}

function virtualStarsAtRank({
  rank,
  selfRank,
  selfStars,
  goalStars,
}: {
  rank: number;
  selfRank: number;
  selfStars: number;
  goalStars: number;
}) {
  if (rank < selfRank) {
    const competitorsAbove = selfRank - 1;
    const floorOffset = Math.max(
      1,
      goalStars - selfStars - competitorsAbove + 1,
    );
    return selfStars + floorOffset + (selfRank - rank - 1);
  }
  return Math.max(1, selfStars - (rank - selfRank));
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
  const completionRate = Math.min(1, Math.max(0, input.completionRate));
  const selfRank = motivationalRank({
    ...input,
    stars,
    completedTasks,
    goalStars,
    completionRate,
    participantCount,
  });

  let virtualIndex = 0;
  const entries = Array.from({ length: participantCount }, (_, index) => {
    const rank = index + 1;
    if (rank === selfRank) {
      return {
        rank,
        displayName: input.nickname?.trim() || "我",
        stars,
        completedTasks,
        petType: input.petType ?? "DOUYA",
        flagKey: "CHINA" as const,
        isSelf: true,
      };
    }

    const identity = virtualIdentity(input.seed, virtualIndex);
    virtualIndex += 1;
    const competitorStars = virtualStarsAtRank({
      rank,
      selfRank,
      selfStars: stars,
      goalStars,
    });
    return {
      rank,
      displayName: identity.displayName,
      stars: competitorStars,
      completedTasks: Math.max(1, Math.round(competitorStars / 2)),
      petType: identity.petType,
      flagKey: identity.flagKey,
      isSelf: false,
    };
  });

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
