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

export type LeaderboardScoreDay = {
  seed: string;
  elapsedMinutes: number;
  effectiveMinutes?: number;
  childStars?: number;
  maxAvailableStars?: number;
};

export type MotivationalLeaderboardInput = {
  childId: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  stars: number;
  completedTasks: number;
  petType: LeaderboardPetType | null;
  goalStars: number;
  maxAvailableStars?: number;
  completionRate: number;
  dailyGoalStars?: number;
  habitualDailyStars?: number;
  seed: string;
  scoreDays?: ReadonlyArray<LeaderboardScoreDay>;
  participantCount?: number;
  competitorStarDelta?: number;
  realCompetitors?: ReadonlyArray<{
    childId: string;
    nickname: string | null;
    avatarUrl: string | null;
    petType: LeaderboardPetType | null;
    stars: number;
    completedTasks: number;
  }>;
};

type VirtualProfile = {
  id: string;
  displayName: string;
  flagKey: LeaderboardFlagKey;
  avatarKey: string;
  petType: LeaderboardPetType;
};

const VIRTUAL_PROFILES: readonly VirtualProfile[] = [
  { id: "v01", displayName: "Leo", flagKey: "CHINA", avatarKey: "avatar-01", petType: "DOUYA" },
  { id: "v02", displayName: "Mia", flagKey: "CHINA", avatarKey: "avatar-02", petType: "PAOPAO" },
  { id: "v03", displayName: "Max", flagKey: "CHINA", avatarKey: "avatar-03", petType: "TUANTUAN" },
  { id: "v04", displayName: "Ava", flagKey: "CHINA", avatarKey: "avatar-04", petType: "MILU" },
  { id: "v05", displayName: "Sam", flagKey: "CHINA", avatarKey: "avatar-05", petType: "SHANSHAN" },
  { id: "v06", displayName: "Zoe", flagKey: "JAPAN", avatarKey: "avatar-06", petType: "DOUYA" },
  { id: "v07", displayName: "Ben", flagKey: "JAPAN", avatarKey: "avatar-07", petType: "PAOPAO" },
  { id: "v08", displayName: "Ivy", flagKey: "KOREA", avatarKey: "avatar-08", petType: "TUANTUAN" },
  { id: "v09", displayName: "Eli", flagKey: "KOREA", avatarKey: "avatar-09", petType: "MILU" },
  { id: "v10", displayName: "Joy", flagKey: "CHINA", avatarKey: "avatar-10", petType: "SHANSHAN" },
  { id: "v11", displayName: "Tom", flagKey: "CHINA", avatarKey: "avatar-11", petType: "DOUYA" },
  { id: "v12", displayName: "Amy", flagKey: "CHINA", avatarKey: "avatar-12", petType: "PAOPAO" },
  { id: "v13", displayName: "Kai", flagKey: "SINGAPORE", avatarKey: "avatar-13", petType: "TUANTUAN" },
  { id: "v14", displayName: "May", flagKey: "SINGAPORE", avatarKey: "avatar-14", petType: "MILU" },
  { id: "v15", displayName: "Ian", flagKey: "UNITED_KINGDOM", avatarKey: "avatar-15", petType: "SHANSHAN" },
  { id: "v16", displayName: "Eva", flagKey: "UNITED_KINGDOM", avatarKey: "avatar-16", petType: "DOUYA" },
  { id: "v17", displayName: "Lou", flagKey: "FRANCE", avatarKey: "avatar-17", petType: "PAOPAO" },
  { id: "v18", displayName: "Tim", flagKey: "GERMANY", avatarKey: "avatar-18", petType: "TUANTUAN" },
  { id: "v19", displayName: "Ada", flagKey: "CHINA", avatarKey: "avatar-19", petType: "MILU" },
  { id: "v20", displayName: "Jay", flagKey: "CHINA", avatarKey: "avatar-20", petType: "SHANSHAN" },
  { id: "v21", displayName: "Dan", flagKey: "CHINA", avatarKey: "avatar-21", petType: "DOUYA" },
  { id: "v22", displayName: "Ari", flagKey: "ITALY", avatarKey: "avatar-22", petType: "PAOPAO" },
  { id: "v23", displayName: "Liv", flagKey: "CANADA", avatarKey: "avatar-23", petType: "TUANTUAN" },
  { id: "v24", displayName: "Noa", flagKey: "AUSTRALIA", avatarKey: "avatar-24", petType: "MILU" },
  { id: "v25", displayName: "Ana", flagKey: "BRAZIL", avatarKey: "avatar-25", petType: "SHANSHAN" },
  { id: "v26", displayName: "Rio", flagKey: "UNITED_STATES", avatarKey: "avatar-26", petType: "DOUYA" },
  { id: "v27", displayName: "Sue", flagKey: "FRANCE", avatarKey: "avatar-27", petType: "PAOPAO" },
] as const;

const MINUTES_PER_DAY = 24 * 60;
const ACTIVITY_WINDOWS = [
  [[420, 500], [700, 790], [940, 1040], [1120, 1300]],
  [[470, 540], [730, 820], [980, 1090], [1160, 1360]],
  [[600, 680], [780, 870], [1010, 1130], [1220, 1390]],
  [[430, 510], [710, 800], [900, 1010], [1080, 1260]],
  [[520, 600], [760, 850], [960, 1060], [1140, 1340]],
] as const;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function dailyProfiles(childId: string, daySeed: string, participantCount?: number) {
  const competitorCount = participantCount == null
    ? 12 + stableHash(`${childId}:${daySeed}:participant-count`) % 4
    : clamp(Math.round(participantCount) - 1, 11, 16);
  return [...VIRTUAL_PROFILES]
    .sort((left, right) => {
      const difference = stableHash(`${childId}:${daySeed}:${left.id}:roster`)
        - stableHash(`${childId}:${daySeed}:${right.id}:roster`);
      return difference || left.id.localeCompare(right.id);
    })
    .slice(0, competitorCount);
}

function virtualDayTarget(input: {
  childId: string;
  daySeed: string;
  profileId: string;
  benchmarkStars: number;
  maxAvailableStars: number;
}) {
  const percent = 55 + stableHash(`${input.childId}:${input.daySeed}:${input.profileId}:target`) % 48;
  return clamp(
    Math.round((input.benchmarkStars * percent) / 100),
    1,
    input.maxAvailableStars,
  );
}

function virtualDayProgress(input: {
  childId: string;
  daySeed: string;
  profile: VirtualProfile;
  benchmarkStars: number;
  maxAvailableStars: number;
  effectiveMinutes: number;
}) {
  const targetStars = virtualDayTarget({
    childId: input.childId,
    daySeed: input.daySeed,
    profileId: input.profile.id,
    benchmarkStars: input.benchmarkStars,
    maxAvailableStars: input.maxAvailableStars,
  });
  const desiredEvents = 4 + stableHash(`${input.childId}:${input.daySeed}:${input.profile.id}:event-count`) % 5;
  const eventCount = Math.max(1, Math.min(targetStars, desiredEvents));
  const baseReward = Math.floor(targetStars / eventCount);
  const extraRewards = targetStars % eventCount;
  const rewardOffset = stableHash(`${input.childId}:${input.daySeed}:${input.profile.id}:reward-offset`) % eventCount;
  const windows = ACTIVITY_WINDOWS[
    stableHash(`${input.childId}:${input.profile.id}:schedule`) % ACTIVITY_WINDOWS.length
  ];
  const completedThrough = clamp(Math.floor(input.effectiveMinutes), 0, MINUTES_PER_DAY);
  const events = Array.from({ length: eventCount }, (_, eventIndex) => {
    const windowIndex = Math.min(windows.length - 1, Math.floor((eventIndex * windows.length) / eventCount));
    const [windowStart, windowEnd] = windows[windowIndex];
    const minute = windowStart
      + stableHash(`${input.childId}:${input.daySeed}:${input.profile.id}:${eventIndex}:minute`)
        % (windowEnd - windowStart + 1);
    const relativeRewardIndex = (eventIndex - rewardOffset + eventCount) % eventCount;
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

function addCatchUpBoost(input: {
  childId: string;
  daySeed: string;
  childStars: number;
  dailyGoalStars: number;
  completionRate: number;
  maxAvailableStars: number;
  competitors: Array<{ profile: VirtualProfile; stars: number; completedTasks: number }>;
}) {
  if (input.childStars < 3 || input.competitors.length === 0) return input.competitors;
  const leaderStars = Math.max(...input.competitors.map((competitor) => competitor.stars));
  const lead = input.childStars - leaderStars;
  const trigger = Math.max(
    3,
    Math.round(input.dailyGoalStars * (0.28 - clamp(input.completionRate, 0, 1) * 0.1)),
  );
  if (lead <= trigger) return input.competitors;

  const strength = clamp((lead - trigger) / Math.max(3, input.dailyGoalStars * 0.45), 0.35, 1);
  const challengerCount = Math.min(6, Math.max(4, Math.ceil(input.competitors.length * 0.35)));
  const challengerIds = new Set(
    [...input.competitors]
      .sort((left, right) => {
        const scoreDifference = right.stars - left.stars;
        if (scoreDifference) return scoreDifference;
        return stableHash(`${input.childId}:${input.daySeed}:${left.profile.id}:catch-up`)
          - stableHash(`${input.childId}:${input.daySeed}:${right.profile.id}:catch-up`);
      })
      .slice(0, challengerCount)
      .map((competitor) => competitor.profile.id),
  );

  return input.competitors.map((competitor) => {
    if (!challengerIds.has(competitor.profile.id)) return competitor;
    const gap = stableHash(`${input.childId}:${input.daySeed}:${competitor.profile.id}:gap`) % 5;
    const closeScore = clamp(input.childStars - gap, 0, input.maxAvailableStars);
    const boostedStars = Math.max(
      competitor.stars,
      Math.round(competitor.stars + (closeScore - competitor.stars) * strength),
    );
    return {
      ...competitor,
      stars: Math.min(input.maxAvailableStars, boostedStars),
      completedTasks: competitor.completedTasks + (boostedStars > competitor.stars ? 1 : 0),
    };
  });
}

export function buildMotivationalLeaderboard(input: MotivationalLeaderboardInput) {
  const stars = Math.max(0, Math.round(input.stars));
  const completedTasks = Math.max(0, Math.round(input.completedTasks));
  const goalStars = Math.max(1, Math.round(input.goalStars));
  const dailyGoalStars = Math.max(1, Math.round(input.dailyGoalStars ?? goalStars));
  const habitualDailyStars = Math.max(1, Math.round(input.habitualDailyStars ?? dailyGoalStars));
  const scoreDays = input.scoreDays ?? [{
    seed: input.seed,
    elapsedMinutes: MINUTES_PER_DAY,
    childStars: stars,
    maxAvailableStars: input.maxAvailableStars ?? goalStars,
  }];
  const periodMaxAvailableStars = Math.max(
    stars,
    Math.max(0, Math.round(input.maxAvailableStars ?? goalStars)),
  );
  const aggregated = new Map<string, {
    profile: VirtualProfile;
    stars: number;
    completedTasks: number;
  }>();

  for (const [dayIndex, day] of scoreDays.entries()) {
    const profiles = dailyProfiles(input.childId, day.seed, input.participantCount);
    const dayMaximum = Math.max(
      1,
      Math.round(day.maxAvailableStars ?? periodMaxAvailableStars / Math.max(1, scoreDays.length)),
    );
    const dayCompetitors = profiles.map((profile) => ({
      profile,
      ...virtualDayProgress({
        childId: input.childId,
        daySeed: day.seed,
        profile,
        benchmarkStars: Math.max(dailyGoalStars, habitualDailyStars),
        maxAvailableStars: dayMaximum,
        effectiveMinutes: day.effectiveMinutes ?? day.elapsedMinutes,
      }),
    }));
    const boosted = addCatchUpBoost({
      childId: input.childId,
      daySeed: day.seed,
      childStars: Math.max(0, Math.round(day.childStars ?? (scoreDays.length === 1 ? stars : 0))),
      dailyGoalStars,
      completionRate: dayIndex === scoreDays.length - 1 ? input.completionRate : 1,
      maxAvailableStars: dayMaximum,
      competitors: dayCompetitors,
    });
    for (const competitor of boosted) {
      const current = aggregated.get(competitor.profile.id) ?? {
        profile: competitor.profile,
        stars: 0,
        completedTasks: 0,
      };
      current.stars += competitor.stars;
      current.completedTasks += competitor.completedTasks;
      aggregated.set(competitor.profile.id, current);
    }
  }

  const competitorStarDelta = clamp(Math.round(input.competitorStarDelta ?? 0), -50, 50);
  const competitors = [...aggregated.values()].map((competitor) => ({
    competitorId: competitor.profile.id,
    displayName: competitor.profile.displayName,
    stars: Math.min(periodMaxAvailableStars, Math.max(0, competitor.stars + competitorStarDelta)),
    completedTasks: competitor.completedTasks,
    petType: competitor.profile.petType,
    flagKey: competitor.profile.flagKey,
    avatarKey: competitor.profile.avatarKey,
    avatarUrl: null as string | null,
    isSelf: false,
    participantType: "VIRTUAL" as const,
  }));
  const realCompetitors = (input.realCompetitors ?? [])
    .filter((competitor) => competitor.childId !== input.childId)
    .map((competitor) => ({
      competitorId: `real:${competitor.childId}`,
      displayName: competitor.nickname?.trim() || "小伙伴",
      stars: Math.max(0, Math.round(competitor.stars)),
      completedTasks: Math.max(0, Math.round(competitor.completedTasks)),
      petType: competitor.petType ?? "DOUYA",
      flagKey: "CHINA" as const,
      avatarKey: null,
      avatarUrl: competitor.avatarUrl?.trim() || null,
      isSelf: false,
      participantType: "REAL" as const,
    }));
  const rankedEntries = [
    ...competitors,
    ...realCompetitors,
    {
      competitorId: null,
      displayName: input.nickname?.trim() || "我",
      stars,
      completedTasks,
      petType: input.petType ?? "DOUYA",
      flagKey: "CHINA" as const,
      avatarKey: null,
      avatarUrl: input.avatarUrl?.trim() || null,
      isSelf: true,
      participantType: "SELF" as const,
    },
  ]
    .sort((left, right) => {
      if (left.stars !== right.stars) return right.stars - left.stars;
      if (left.isSelf !== right.isSelf) {
        if (left.stars === 0) return left.isSelf ? 1 : -1;
        return left.isSelf ? -1 : 1;
      }
      if (left.completedTasks !== right.completedTasks) return right.completedTasks - left.completedTasks;
      return left.displayName.localeCompare(right.displayName, "en");
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const selfPosition = rankedEntries.findIndex((entry) => entry.isSelf);
  const otherParticipants = [...competitors, ...realCompetitors];
  const unlisted = stars < 3 && otherParticipants.every((competitor) => competitor.stars > stars);
  const entries = rankedEntries.map((entry) => entry.isSelf && unlisted ? { ...entry, rank: null } : entry);
  const selfEntry = entries[selfPosition]!;
  const childAbove = selfPosition > 0 ? rankedEntries[selfPosition - 1] : null;
  return {
    entries,
    self: {
      rank: selfEntry.rank,
      stars,
      completedTasks,
      totalParticipants: rankedEntries.length,
      inTopTen: selfEntry.rank !== null && selfEntry.rank <= 10,
      starsToNextRank: childAbove ? Math.max(1, childAbove.stars - stars) : 0,
    },
  };
}
