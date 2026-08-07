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

export type LeaderboardCandidate = {
  childId: string;
  stars: number;
  completedTasks: number;
  petType: LeaderboardPetType | null;
};

const PET_TYPES: LeaderboardPetType[] = [
  "DOUYA",
  "PAOPAO",
  "TUANTUAN",
  "MILU",
  "SHANSHAN",
];

const FLAG_KEYS: LeaderboardFlagKey[] = [
  "CHINA",
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

const ALIAS_PREFIXES = [
  "晨光",
  "云朵",
  "星河",
  "彩虹",
  "月亮",
  "阳光",
  "小树",
  "海风",
  "萤火",
  "雪花",
  "果冻",
  "麦穗",
];

const ALIAS_ROLES = [
  "探险家",
  "行动派",
  "小队长",
  "追光者",
  "旅行家",
  "发现家",
  "领航员",
  "星星手",
  "梦想家",
  "挑战者",
  "坚持派",
  "能量员",
];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function anonymousIdentity(childId: string) {
  const hash = stableHash(childId);
  const aliasIndex = hash % (ALIAS_PREFIXES.length * ALIAS_ROLES.length);
  return {
    displayName: `${ALIAS_PREFIXES[aliasIndex % ALIAS_PREFIXES.length]}${
      ALIAS_ROLES[Math.floor(aliasIndex / ALIAS_PREFIXES.length)]
    }`,
    petType: PET_TYPES[hash % PET_TYPES.length],
    flagKey: FLAG_KEYS[Math.floor(hash / PET_TYPES.length) % FLAG_KEYS.length],
  };
}

export function buildChildLeaderboard(
  candidates: LeaderboardCandidate[],
  currentChildId: string,
) {
  const ranked = [...candidates]
    .map((candidate) => ({
      ...candidate,
      stars: Math.max(0, candidate.stars),
      completedTasks: Math.max(0, candidate.completedTasks),
    }))
    .sort((left, right) =>
      right.stars - left.stars ||
      right.completedTasks - left.completedTasks ||
      left.childId.localeCompare(right.childId),
    );

  const rankedWithPositions = ranked.map((candidate, index) => ({
    ...candidate,
    rank:
      index > 0 && candidate.stars === ranked[index - 1]?.stars
        ? 0
        : index + 1,
  }));
  let latestRank = 1;
  for (const candidate of rankedWithPositions) {
    if (candidate.rank === 0) candidate.rank = latestRank;
    else latestRank = candidate.rank;
  }

  const currentIndex = rankedWithPositions.findIndex(
    (candidate) => candidate.childId === currentChildId,
  );
  const current = currentIndex >= 0 ? rankedWithPositions[currentIndex] : null;
  const childAbove = current
    ? [...rankedWithPositions]
        .reverse()
        .find((candidate) => candidate.stars > current.stars) ?? null
    : null;

  return {
    entries: rankedWithPositions.slice(0, 10).map((candidate) => {
      const identity = anonymousIdentity(candidate.childId);
      const isSelf = candidate.childId === currentChildId;
      return {
        rank: candidate.rank,
        displayName: isSelf ? "我" : identity.displayName,
        stars: candidate.stars,
        completedTasks: candidate.completedTasks,
        petType: candidate.petType ?? identity.petType,
        flagKey: identity.flagKey,
        isSelf,
      };
    }),
    self: current
      ? {
          rank: current.rank,
          stars: current.stars,
          completedTasks: current.completedTasks,
          totalParticipants: ranked.length,
          inTopTen: currentIndex < 10,
          starsToNextRank: childAbove
            ? Math.max(1, childAbove.stars - current.stars)
            : 0,
        }
      : null,
  };
}
