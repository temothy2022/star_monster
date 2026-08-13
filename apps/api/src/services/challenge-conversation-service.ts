import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  addBusinessDays,
  businessDateAt,
  businessDateStartInstant,
  businessMinuteOfDayAt,
} from "../lib/time.js";
import { callDeepSeekJson, callDeepSeekText } from "./deepseek-service.js";
import { getChildLeaderboards } from "./footprint-service.js";
import { getPlatformFeatureSettings } from "./platform-feature-service.js";
import { systemAiCredentials } from "./system-ai-service.js";

export const DAILY_CHILD_MESSAGE_LIMIT = 5;
export const CHALLENGE_HISTORY_LIMIT = 50;
const GENERATION_RETRY_MS = 10 * 60 * 1_000;
const PROMPT_POOL_SIZE = 100;
const PROMPT_BATCH_SIZE = 12;
const PROMPT_BATCH_MAX_ATTEMPTS = 12;
const promptBatchSchema = z.object({
  messages: z.array(z.string()).min(1).max(40),
});
let promptPoolGeneration: Promise<number> | null = null;

type ChallengePartner = {
  competitorId: string;
  displayName: string;
  avatarKey: string;
  stars: number;
};

const REAL_COMPETITOR_PREFIX = "real:";

export function realChildId(competitorId: string) {
  return competitorId.startsWith(REAL_COMPETITOR_PREFIX)
    ? competitorId.slice(REAL_COMPETITOR_PREFIX.length)
    : null;
}

export function directParticipantIds(childId: string, partnerChildId: string) {
  return childId.localeCompare(partnerChildId) < 0
    ? [childId, partnerChildId] as const
    : [partnerChildId, childId] as const;
}

function directCompetitorId(childId: string) {
  return `${REAL_COMPETITOR_PREFIX}${childId}`;
}

function virtualPartnerPrompt(childName?: string | null) {
  return [
    "你是儿童任务应用里孩子的挑战伙伴，明确不是现实中的真人。",
    "用中国 5 岁孩子会说的简短中文，只输出一句中文短句，不要 JSON。",
    "语气友好、俏皮、有一点比赛感，邀请对方追上来。",
    "不能羞辱、讽刺、威胁、贬低、施压或评价孩子好坏。",
    "不能索要或提及姓名、学校、地址、电话等身份信息。",
    "不能假装线下认识对方，不能说自己是真人。",
    "每次只说一句，最多 24 个汉字，不用 emoji。",
    childName?.trim() ? `可以称呼孩子为“${childName.trim()}”，不要使用产品名代替孩子称呼。` : "不要编造或猜测孩子姓名。",
  ].join("\n");
}

export function challengeOfferEligible(input: {
  minuteOfDay: number;
  completedTasks: number;
  rank: number | null;
  totalParticipants: number;
  selfIndex: number;
}) {
  return input.minuteOfDay >= 12 * 60
    && input.completedTasks <= 1
    && input.selfIndex > 0
    && (input.rank === null || input.rank > Math.ceil(input.totalParticipants / 2));
}

export function normalizeVirtualMessage(text: string) {
  const normalized = [...text.replace(/\p{Extended_Pictographic}/gu, "").trim()]
    .slice(0, 24)
    .join("");
  if (normalized.length < 2 || !/[\u4e00-\u9fff]/u.test(normalized)) {
    throw new HttpError(502, "AI_INVALID_RESPONSE", "AI 回复太短，请重新发送一次");
  }
  return normalized;
}

function anonymizeChildReply(text: string) {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[已隐藏]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[已隐藏]")
    .replace(/(?:\d[\s-]?){5,}/g, "[已隐藏]");
}

function normalizePromptTemplate(text: string) {
  const normalized = text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/Star\s*Monsters?/gi, "")
    .trim();
  if (normalized.length < 2 || !/[\u4e00-\u9fff]/u.test(normalized)) {
    throw new HttpError(502, "AI_INVALID_RESPONSE", "DeepSeek 生成的话术不是有效中文");
  }
  return normalized;
}

export function mergeChallengePromptCandidates(target: Set<string>, candidates: string[]) {
  for (const candidate of candidates) {
    try {
      const normalized = normalizePromptTemplate(candidate);
      if ([...normalized].length <= 36) target.add(normalized);
    } catch {
      // Ignore individual malformed lines and let the next batch fill the gap.
    }
  }
  return target;
}

function renderPromptTemplate(text: string, childName: string | null | undefined) {
  const rendered = text.replaceAll("{孩子昵称}", childName?.trim() || "你");
  return normalizeVirtualMessage(rendered);
}

async function generatePromptBatch(
  config: AppConfig,
  credentials: Awaited<ReturnType<typeof systemAiCredentials>>,
  count: number,
  batchNumber: number,
  existing: string[],
) {
  const result = await callDeepSeekJson({
    ...credentials,
    config,
    systemPrompt: [
      "你是儿童任务应用的话术编辑。只输出 JSON 对象。",
      `本批生成 ${count} 条互不重复的简体中文短句，给 5 岁孩子的挑战伙伴主动发来。`,
      "每条 6 到 22 个汉字，可少量使用占位符 {孩子昵称}。",
      "主题是今天暂时领先、等你追上、一起完成任务。",
      "语气友好俏皮，不能羞辱、讽刺、威胁、贬低、施压或评价孩子好坏。",
      "不用 emoji，不提产品名，不索要个人信息。",
      `JSON 格式必须是 {\"messages\":[本批 ${count} 条字符串]}。`,
    ].join("\n"),
    userPayload: {
      count,
      batchNumber,
      language: "zh-CN",
      avoidMessages: existing.slice(-100),
    },
    outputSchema: promptBatchSchema,
    maxTokens: 1800,
  });
  return result.data.messages;
}

async function generatePromptPool(config: AppConfig, replace = false) {
  if (!replace) {
    const enabledCount = await prisma.challengePromptTemplate.count({ where: { isEnabled: true } });
    if (enabledCount >= PROMPT_POOL_SIZE) return enabledCount;
    throw new HttpError(
      409,
      "CHALLENGE_PROMPT_POOL_NOT_READY",
      "主动来信话术库尚未准备完成，请先在超级后台生成 100 条话术",
    );
  }

  const credentials = await systemAiCredentials(config);
  const existingRows = await prisma.challengePromptTemplate.findMany({
    select: { text: true, isEnabled: true },
    orderBy: { createdAt: "asc" },
  });
  const messages = new Set(existingRows.filter((row) => !row.isEnabled).map((row) => row.text));
  const seen = new Set(existingRows.map((row) => row.text));
  let attempts = 0;
  let lastError: unknown;
  while (messages.size < PROMPT_POOL_SIZE && attempts < PROMPT_BATCH_MAX_ATTEMPTS) {
    const remaining = PROMPT_POOL_SIZE - messages.size;
    const count = Math.min(PROMPT_BATCH_SIZE, remaining + 3);
    attempts += 1;
    try {
      const batch = await generatePromptBatch(config, credentials, count, attempts, [...seen]);
      const normalizedBatch = mergeChallengePromptCandidates(new Set<string>(), batch);
      const additions = [...normalizedBatch]
        .filter((text) => !seen.has(text))
        .slice(0, remaining);
      if (!additions.length) continue;
      await prisma.challengePromptTemplate.createMany({
        data: additions.map((text) => ({ text, isEnabled: false })),
        skipDuplicates: true,
      });
      for (const text of additions) {
        seen.add(text);
        messages.add(text);
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (messages.size < PROMPT_POOL_SIZE) {
    if (lastError instanceof HttpError && messages.size === 0) throw lastError;
    // Partial batches are valid progress. Return them as a successful result
    // so administrators can continue later without turning a provider-format
    // variance into a misleading 502 platform failure.
    return messages.size;
  }
  const completedMessages = await prisma.challengePromptTemplate.findMany({
    where: { isEnabled: false, text: { in: [...messages] } },
    orderBy: { createdAt: "asc" },
    take: PROMPT_POOL_SIZE,
    select: { id: true },
  });
  if (completedMessages.length < PROMPT_POOL_SIZE) {
    return completedMessages.length;
  }
  const completedIds = completedMessages.map((message) => message.id);
  await prisma.$transaction(async (tx) => {
    await tx.challengePromptTemplate.updateMany({ data: { isEnabled: false } });
    await tx.challengePromptTemplate.updateMany({
      where: { id: { in: completedIds } },
      data: { isEnabled: true, usageCount: 0 },
    });
    await tx.challengePromptTemplate.deleteMany({ where: { id: { notIn: completedIds } } });
  });
  return completedIds.length;
}

export async function ensureChallengePromptPool(config: AppConfig, replace = false) {
  if (!replace) {
    const count = await prisma.challengePromptTemplate.count({ where: { isEnabled: true } });
    if (count >= PROMPT_POOL_SIZE) return count;
    throw new HttpError(
      409,
      "CHALLENGE_PROMPT_POOL_NOT_READY",
      "主动来信话术库尚未准备完成，请先在超级后台生成 100 条话术",
    );
  }
  if (!promptPoolGeneration) {
    promptPoolGeneration = generatePromptPool(config, true).finally(() => {
      promptPoolGeneration = null;
    });
  }
  return promptPoolGeneration;
}

export async function challengePromptPoolSummary() {
  const [enabledCount, totalCount, latest] = await Promise.all([
    prisma.challengePromptTemplate.count({ where: { isEnabled: true } }),
    prisma.challengePromptTemplate.count(),
    prisma.challengePromptTemplate.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  return { enabledCount, draftCount: Math.max(0, totalCount - enabledCount), totalCount, updatedAt: latest?.updatedAt ?? null };
}

async function takeRandomPrompt(config: AppConfig, childName: string | null | undefined) {
  await ensureChallengePromptPool(config);
  const candidates = await prisma.challengePromptTemplate.findMany({
    where: { isEnabled: true },
    orderBy: [{ usageCount: "asc" }, { createdAt: "asc" }],
    take: 20,
  });
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  if (!selected) throw new HttpError(409, "CHALLENGE_PROMPT_POOL_EMPTY", "挑战来信话术库为空");
  await prisma.challengePromptTemplate.update({
    where: { id: selected.id },
    data: { usageCount: { increment: 1 } },
  });
  return renderPromptTemplate(selected.text, childName);
}

type LoadedConversation = NonNullable<Awaited<ReturnType<typeof loadTodayConversation>>>;

function visibleMessages(conversation: LoadedConversation, now: Date) {
  return conversation.messages.filter((message) =>
    message.sender === "CHILD" || message.visibleAt.getTime() <= now.getTime(),
  );
}

function serializeConversations(conversations: LoadedConversation[], config: AppConfig, now: Date, sentTodayOverride?: number) {
  if (!conversations.length) return null;
  const latest = conversations[0];
  const businessDate = businessDateAt(now, config.APP_TIME_ZONE);
  const todayStart = businessDateStartInstant(businessDate, config.APP_TIME_ZONE);
  const tomorrowStart = businessDateStartInstant(addBusinessDays(businessDate, 1), config.APP_TIME_ZONE);
  const allVisibleMessages = conversations
    .flatMap((conversation) => visibleMessages(conversation, now))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
    .slice(-CHALLENGE_HISTORY_LIMIT);
  const selectedPartnerSentToday = conversations
    .flatMap((conversation) => conversation.messages)
    .filter((message) => message.sender === "CHILD" && message.createdAt >= todayStart && message.createdAt < tomorrowStart).length;
  const sentToday = sentTodayOverride ?? selectedPartnerSentToday;
  const nextVisibleAt = conversations
    .flatMap((conversation) => conversation.messages)
    .filter((message) => message.sender === "VIRTUAL_PARTNER" && message.visibleAt.getTime() > now.getTime())
    .sort((left, right) => left.visibleAt.getTime() - right.visibleAt.getTime())[0]?.visibleAt ?? null;
  return {
    id: latest.id,
    businessDate: latest.businessDate.toISOString().slice(0, 10),
    partner: {
      competitorId: latest.competitorId,
      displayName: latest.competitorName,
      avatarKey: latest.competitorAvatarKey,
      avatarUrl: null,
      petType: null,
      participantType: "VIRTUAL" as const,
      label: "你的挑战伙伴" as const,
    },
    messages: allVisibleMessages.map((message) => ({
      id: message.id,
      sender: message.sender,
      text: message.text,
      createdAt: message.createdAt,
    })),
    nextVisibleAt,
    dailyLimit: DAILY_CHILD_MESSAGE_LIMIT,
    sentToday,
    remainingToday: Math.max(0, DAILY_CHILD_MESSAGE_LIMIT - sentToday),
  };
}

function serializeConversation(conversation: LoadedConversation | null, config: AppConfig, now: Date) {
  return conversation ? serializeConversations([conversation], config, now) : null;
}

async function loadDirectConversation(childId: string, partnerChildId: string) {
  const [participantAId, participantBId] = directParticipantIds(childId, partnerChildId);
  return prisma.directChildConversation.findUnique({
    where: { participantAId_participantBId: { participantAId, participantBId } },
    include: {
      participantA: { select: { id: true, nickname: true, avatarUrl: true, petType: true } },
      participantB: { select: { id: true, nickname: true, avatarUrl: true, petType: true } },
      messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
}

type LoadedDirectConversation = NonNullable<Awaited<ReturnType<typeof loadDirectConversation>>>;

function directPartner(conversation: LoadedDirectConversation, childId: string) {
  return conversation.participantAId === childId
    ? conversation.participantB
    : conversation.participantA;
}

async function serializeDirectConversation(
  conversation: LoadedDirectConversation,
  childId: string,
  config: AppConfig,
  now: Date,
  sentTodayOverride?: number,
) {
  const partner = directPartner(conversation, childId);
  const sentToday = sentTodayOverride ?? await countChildMessagesToday(childId, config, now);
  return {
    id: conversation.id,
    businessDate: businessDateAt(now, config.APP_TIME_ZONE).toISOString().slice(0, 10),
    partner: {
      competitorId: directCompetitorId(partner.id),
      displayName: partner.nickname?.trim() || "小伙伴",
      avatarKey: null,
      avatarUrl: partner.avatarUrl?.trim() || null,
      petType: partner.petType ?? "DOUYA",
      participantType: "REAL" as const,
      label: "真实小伙伴" as const,
    },
    messages: conversation.messages.slice(-CHALLENGE_HISTORY_LIMIT).map((message) => ({
      id: message.id,
      sender: message.senderChildId === childId ? "CHILD" as const : "REAL_PARTNER" as const,
      text: message.text,
      createdAt: message.createdAt,
    })),
    nextVisibleAt: null,
    dailyLimit: DAILY_CHILD_MESSAGE_LIMIT,
    sentToday,
    remainingToday: Math.max(0, DAILY_CHILD_MESSAGE_LIMIT - sentToday),
  };
}

async function ensureDirectConversation(childId: string, partnerChildId: string) {
  if (childId === partnerChildId) throw new HttpError(409, "DIRECT_MESSAGE_SELF", "不能给自己发消息");
  const partner = await prisma.childProfile.findFirst({
    where: { id: partnerChildId, status: "ACTIVE", onboardingCompletedAt: { not: null } },
    select: { id: true },
  });
  if (!partner) throw new HttpError(404, "DIRECT_PARTNER_NOT_FOUND", "这个小伙伴暂时无法联系");
  const [participantAId, participantBId] = directParticipantIds(childId, partnerChildId);
  await prisma.directChildConversation.upsert({
    where: { participantAId_participantBId: { participantAId, participantBId } },
    create: { participantAId, participantBId },
    update: {},
  });
  return (await loadDirectConversation(childId, partnerChildId))!;
}

async function listDirectContacts(childId: string) {
  const conversations = await prisma.directChildConversation.findMany({
    where: { OR: [{ participantAId: childId }, { participantBId: childId }] },
    orderBy: { updatedAt: "desc" },
    include: {
      participantA: { select: { id: true, nickname: true, avatarUrl: true, petType: true } },
      participantB: { select: { id: true, nickname: true, avatarUrl: true, petType: true } },
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      _count: {
        select: {
          messages: { where: { senderChildId: { not: childId }, readAt: null } },
        },
      },
    },
  });
  return conversations.flatMap((conversation) => {
    const latest = conversation.messages[0];
    if (!latest) return [];
    const partner = directPartner(conversation, childId);
    return [{
      competitorId: directCompetitorId(partner.id),
      displayName: partner.nickname?.trim() || "小伙伴",
      avatarKey: null,
      avatarUrl: partner.avatarUrl?.trim() || null,
      petType: partner.petType ?? "DOUYA",
      participantType: "REAL" as const,
      label: "真实小伙伴" as const,
      latestMessage: latest.text,
      latestAt: latest.createdAt,
      unreadCount: conversation._count.messages,
    }];
  });
}

async function loadTodayConversation(childId: string, config: AppConfig, now = new Date(), competitorId?: string) {
  return prisma.challengeConversation.findFirst({
    where: { childId, businessDate: businessDateAt(now, config.APP_TIME_ZONE), ...(competitorId ? { competitorId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}

async function prunePartnerHistory(childId: string, competitorId: string) {
  const overflow = await prisma.challengeConversationMessage.findMany({
    where: { conversation: { childId, competitorId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: CHALLENGE_HISTORY_LIMIT,
    select: { id: true },
  });
  if (overflow.length) {
    await prisma.challengeConversationMessage.deleteMany({ where: { id: { in: overflow.map((message) => message.id) } } });
  }
}

export async function startChallengeConversation(
  childId: string,
  partner: { competitorId: string; displayName: string; avatarKey?: string | null },
  config: AppConfig,
  now = new Date(),
) {
  const { leaderboards } = await getChildLeaderboards(childId, config, now);
  const verified = [...leaderboards.daily.entries, ...leaderboards.weekly.entries].find((entry) =>
    !entry.isSelf && entry.competitorId === partner.competitorId,
  );
  if (!verified?.competitorId) throw new HttpError(404, "CHALLENGE_PARTNER_NOT_FOUND", "这个挑战伙伴暂时不在排行榜里");
  const partnerChildId = realChildId(verified.competitorId);
  if (verified.participantType === "REAL" && partnerChildId) {
    const conversation = await ensureDirectConversation(childId, partnerChildId);
    const contacts = (await listChallengeContacts(childId, config, now)).contacts;
    return { contacts, conversation: await serializeDirectConversation(conversation, childId, config, now) };
  }
  if (!verified.avatarKey) throw new HttpError(404, "CHALLENGE_PARTNER_NOT_FOUND", "这个挑战伙伴暂时不在排行榜里");
  const businessDate = businessDateAt(now, config.APP_TIME_ZONE);
  await prisma.challengeConversation.upsert({
    where: { childId_businessDate_competitorId: { childId, businessDate, competitorId: verified.competitorId } },
    create: {
      childId,
      businessDate,
      competitorId: verified.competitorId,
      competitorName: verified.displayName,
      competitorAvatarKey: verified.avatarKey,
      status: "READY",
      openedAt: now,
    },
    update: {
      competitorName: verified.displayName,
      competitorAvatarKey: verified.avatarKey,
      status: "READY",
      openedAt: now,
    },
  });
  return getChallengeConversation(childId, config, now, verified.competitorId);
}

async function loadPartnerConversations(childId: string, competitorId: string) {
  return prisma.challengeConversation.findMany({
    where: { childId, competitorId, status: "READY" },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
    include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}

async function countChildMessagesToday(childId: string, config: AppConfig, now: Date) {
  const businessDate = businessDateAt(now, config.APP_TIME_ZONE);
  const todayStart = businessDateStartInstant(businessDate, config.APP_TIME_ZONE);
  const tomorrowStart = businessDateStartInstant(addBusinessDays(businessDate, 1), config.APP_TIME_ZONE);
  const [virtualCount, directCount] = await Promise.all([
    prisma.challengeConversationMessage.count({
      where: { sender: "CHILD", createdAt: { gte: todayStart, lt: tomorrowStart }, conversation: { childId } },
    }),
    prisma.directChildMessage.count({
      where: { senderChildId: childId, createdAt: { gte: todayStart, lt: tomorrowStart } },
    }),
  ]);
  return virtualCount + directCount;
}

export async function listChallengeContacts(childId: string, config: AppConfig, now = new Date()) {
  const conversations = await prisma.challengeConversation.findMany({
    where: { childId, status: "READY" },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
    include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  const contacts = new Map<string, { competitorId: string; displayName: string; avatarKey: string | null; avatarUrl: string | null; petType: string | null; participantType: "VIRTUAL" | "REAL"; label: "你的挑战伙伴" | "真实小伙伴"; latestMessage: string; latestAt: Date; unreadCount: number }>();
  for (const conversation of conversations) {
    const messages = visibleMessages(conversation, now);
    if (!messages.length) continue;
    const latestMessage = messages[messages.length - 1];
    const unreadCount = messages.filter((message) => message.sender === "VIRTUAL_PARTNER" && !message.readAt).length;
    const current = contacts.get(conversation.competitorId);
    if (!current) {
      contacts.set(conversation.competitorId, { competitorId: conversation.competitorId, displayName: conversation.competitorName, avatarKey: conversation.competitorAvatarKey, avatarUrl: null, petType: null, participantType: "VIRTUAL", label: "你的挑战伙伴", latestMessage: latestMessage.text, latestAt: latestMessage.createdAt, unreadCount });
    } else {
      current.unreadCount += unreadCount;
      if (latestMessage.createdAt > current.latestAt) {
        current.latestMessage = latestMessage.text;
        current.latestAt = latestMessage.createdAt;
        current.displayName = conversation.competitorName;
        current.avatarKey = conversation.competitorAvatarKey;
      }
    }
  }
  const featureSettings = await getPlatformFeatureSettings();
  if (featureSettings.realChildCompetitionEnabled) {
    for (const contact of await listDirectContacts(childId)) {
      contacts.set(contact.competitorId, contact);
    }
  }
  return { contacts: [...contacts.values()].sort((left, right) => right.latestAt.getTime() - left.latestAt.getTime() || left.competitorId.localeCompare(right.competitorId)) };
}

async function eligiblePartner(childId: string, config: AppConfig, now: Date, force = false): Promise<ChallengePartner | null> {
  const { leaderboards } = await getChildLeaderboards(childId, config, now);
  const daily = leaderboards.daily;
  if (!daily.self) return null;
  const selfIndex = daily.entries.findIndex((entry) => entry.isSelf);
  if (!force && !challengeOfferEligible({
    minuteOfDay: businessMinuteOfDayAt(now, config.APP_TIME_ZONE),
    completedTasks: daily.self.completedTasks,
    rank: daily.self.rank,
    totalParticipants: daily.self.totalParticipants,
    selfIndex,
  })) return null;
  const partner = daily.entries[selfIndex - 1]
    ?? (force ? daily.entries.find((entry) => !entry.isSelf) : undefined);
  if (!partner?.competitorId || !partner.avatarKey || partner.isSelf) return null;
  return {
    competitorId: partner.competitorId,
    displayName: partner.displayName,
    avatarKey: partner.avatarKey,
    stars: partner.stars,
  };
}

export async function generateChallengeLetterIfEligible(
  childId: string,
  config: AppConfig,
  now = new Date(),
  options: { force?: boolean } = {},
) {
  const partner = await eligiblePartner(childId, config, now, options.force);
  if (!partner) return null;
  const existing = await loadTodayConversation(childId, config, now, partner.competitorId);
  if (existing?.status === "READY" && existing.messages.some((message) => message.sender === "VIRTUAL_PARTNER")) {
    return serializeConversation(existing, config, now);
  }
  if (!options.force && existing && now.getTime() - existing.updatedAt.getTime() < GENERATION_RETRY_MS) return null;
  const businessDate = businessDateAt(now, config.APP_TIME_ZONE);
  let conversation;
  if (existing) {
    conversation = await prisma.challengeConversation.update({
      where: { id: existing.id },
      data: { status: "GENERATING" },
    });
  } else try {
    conversation = await prisma.challengeConversation.create({
      data: {
        childId,
        businessDate,
        competitorId: partner.competitorId,
        competitorName: partner.displayName,
        competitorAvatarKey: partner.avatarKey,
      },
    });
  } catch {
    return serializeConversation(await loadTodayConversation(childId, config, now, partner.competitorId), config, now);
  }

  try {
    const child = await prisma.childProfile.findUnique({ where: { id: childId }, select: { nickname: true } });
    const text = await takeRandomPrompt(config, child?.nickname);
    await prisma.challengeConversation.update({
      where: { id: conversation.id },
      data: {
        status: "READY",
        messages: {
          create: {
            sender: "VIRTUAL_PARTNER",
            text,
            model: "PROMPT_POOL",
          },
        },
      },
    });
  } catch (error) {
    await prisma.challengeConversation.update({
      where: { id: conversation.id },
      data: { status: "FAILED" },
    });
    throw error;
  }
  return serializeConversation(await loadTodayConversation(childId, config, now, partner.competitorId), config, now);
}

export async function challengeLetterNotification(
  childId: string,
  config: AppConfig,
  now = new Date(),
) {
  const featureSettings = await getPlatformFeatureSettings();
  const [firstMessage, directMessage] = await Promise.all([
    prisma.challengeConversationMessage.findFirst({
      where: { sender: "VIRTUAL_PARTNER", visibleAt: { lte: now }, readAt: null, conversation: { childId, status: "READY" } },
      orderBy: [{ visibleAt: "desc" }, { createdAt: "desc" }],
      include: { conversation: true },
    }),
    featureSettings.realChildCompetitionEnabled
      ? prisma.directChildMessage.findFirst({
      where: {
        readAt: null,
        senderChildId: { not: childId },
        conversation: { is: { OR: [{ participantAId: childId }, { participantBId: childId }] } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        sender: { select: { id: true, nickname: true, avatarUrl: true, petType: true } },
      },
      })
      : Promise.resolve(null),
  ]);
  if (directMessage && (!firstMessage || directMessage.createdAt >= firstMessage.createdAt)) {
    return {
      conversationId: directMessage.conversationId,
      partnerId: directCompetitorId(directMessage.sender.id),
      partnerName: directMessage.sender.nickname?.trim() || "小伙伴",
      partnerAvatarKey: null,
      partnerAvatarUrl: directMessage.sender.avatarUrl?.trim() || null,
      partnerPetType: directMessage.sender.petType ?? "DOUYA",
      preview: directMessage.text,
      unread: true,
      partnerLabel: "真实小伙伴" as const,
    };
  }
  if (!firstMessage) return null;
  return {
    conversationId: firstMessage.conversation.id,
    partnerId: firstMessage.conversation.competitorId,
    partnerName: firstMessage.conversation.competitorName,
    partnerAvatarKey: firstMessage.conversation.competitorAvatarKey,
    partnerAvatarUrl: null,
    partnerPetType: null,
    preview: firstMessage.text,
    unread: true,
    partnerLabel: "你的挑战伙伴" as const,
  };
}

export async function getChallengeConversation(childId: string, config: AppConfig, now = new Date(), requestedCompetitorId?: string) {
  const { contacts: initialContacts } = await listChallengeContacts(childId, config, now);
  let competitorId = requestedCompetitorId ?? initialContacts[0]?.competitorId;
  if (!competitorId) return { contacts: initialContacts, conversation: null };
  const requestedRealChildId = realChildId(competitorId);
  if (requestedRealChildId) {
    const featureSettings = await getPlatformFeatureSettings();
    if (!featureSettings.realChildCompetitionEnabled) {
      return { contacts: initialContacts, conversation: null };
    }
    const conversation = await loadDirectConversation(childId, requestedRealChildId);
    if (!conversation) return { contacts: initialContacts, conversation: null };
    await prisma.directChildMessage.updateMany({
      where: { conversationId: conversation.id, senderChildId: { not: childId }, readAt: null },
      data: { readAt: now },
    });
    const refreshed = (await loadDirectConversation(childId, requestedRealChildId))!;
    const contacts = (await listChallengeContacts(childId, config, now)).contacts;
    const sentToday = await countChildMessagesToday(childId, config, now);
    return { contacts, conversation: await serializeDirectConversation(refreshed, childId, config, now, sentToday) };
  }
  let conversations = await loadPartnerConversations(childId, competitorId);
  if (!conversations.length && requestedCompetitorId && initialContacts[0]) {
    competitorId = initialContacts[0].competitorId;
    conversations = await loadPartnerConversations(childId, competitorId);
  }
  if (!conversations.length) return { contacts: initialContacts, conversation: null };
  const conversationIds = conversations.map((conversation) => conversation.id);
  await prisma.$transaction([
    prisma.challengeConversation.updateMany({ where: { id: { in: conversationIds }, openedAt: null }, data: { openedAt: now } }),
    prisma.challengeConversationMessage.updateMany({
      where: { conversationId: { in: conversationIds }, sender: "VIRTUAL_PARTNER", visibleAt: { lte: now }, readAt: null },
      data: { readAt: now },
    }),
  ]);
  const { contacts } = await listChallengeContacts(childId, config, now);
  const sentToday = await countChildMessagesToday(childId, config, now);
  return { contacts, conversation: serializeConversations(conversations, config, now, sentToday) };
}

export function challengeReplyDelayMs(random = Math.random()) {
  return 10_000 + Math.floor(Math.min(Math.max(random, 0), 0.999999) * 50_001);
}

export async function sendChallengeReply(
  childId: string,
  competitorId: string,
  text: string,
  config: AppConfig,
  now = new Date(),
) {
  const partnerChildId = realChildId(competitorId);
  if (partnerChildId) {
    const featureSettings = await getPlatformFeatureSettings();
    if (!featureSettings.realChildCompetitionEnabled) {
      throw new HttpError(403, "REAL_CHILD_COMPETITION_DISABLED", "真实小伙伴互动暂时关闭啦");
    }
    const businessDate = businessDateAt(now, config.APP_TIME_ZONE);
    const todayStart = businessDateStartInstant(businessDate, config.APP_TIME_ZONE);
    const tomorrowStart = businessDateStartInstant(addBusinessDays(businessDate, 1), config.APP_TIME_ZONE);
    const conversation = await loadDirectConversation(childId, partnerChildId);
    if (!conversation) throw new HttpError(404, "DIRECT_CONVERSATION_NOT_FOUND", "请先从排行榜打开这个小伙伴");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ChildProfile" WHERE "id" = ${childId} FOR UPDATE`;
      const [virtualCount, directCount] = await Promise.all([
        tx.challengeConversationMessage.count({ where: { sender: "CHILD", createdAt: { gte: todayStart, lt: tomorrowStart }, conversation: { childId } } }),
        tx.directChildMessage.count({ where: { senderChildId: childId, createdAt: { gte: todayStart, lt: tomorrowStart } } }),
      ]);
      if (virtualCount + directCount >= DAILY_CHILD_MESSAGE_LIMIT) {
        throw new HttpError(429, "CHALLENGE_DAILY_LIMIT", "今天的 5 条消息已经发完啦，明天再聊");
      }
      await tx.directChildMessage.create({
        data: { conversationId: conversation.id, senderChildId: childId, text: anonymizeChildReply(text) },
      });
      await tx.directChildConversation.update({ where: { id: conversation.id }, data: { updatedAt: now } });
    });
    const refreshed = (await loadDirectConversation(childId, partnerChildId))!;
    const contacts = (await listChallengeContacts(childId, config, now)).contacts;
    return { contacts, conversation: await serializeDirectConversation(refreshed, childId, config, now) };
  }
  const conversations = await loadPartnerConversations(childId, competitorId);
  const conversation = conversations[0];
  if (!conversation) throw new HttpError(404, "CHALLENGE_CONVERSATION_NOT_FOUND", "还没有和这个挑战伙伴联系过");
  const businessDate = businessDateAt(now, config.APP_TIME_ZONE);
  const todayStart = businessDateStartInstant(businessDate, config.APP_TIME_ZONE);
  const tomorrowStart = businessDateStartInstant(addBusinessDays(businessDate, 1), config.APP_TIME_ZONE);
  const childMessage = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChildProfile" WHERE "id" = ${childId} FOR UPDATE`;
    const [virtualCount, directCount] = await Promise.all([
      tx.challengeConversationMessage.count({
        where: { sender: "CHILD", createdAt: { gte: todayStart, lt: tomorrowStart }, conversation: { childId } },
      }),
      tx.directChildMessage.count({ where: { senderChildId: childId, createdAt: { gte: todayStart, lt: tomorrowStart } } }),
    ]);
    if (virtualCount + directCount >= DAILY_CHILD_MESSAGE_LIMIT) throw new HttpError(429, "CHALLENGE_DAILY_LIMIT", "今天的 5 条消息已经发完啦，明天再聊");
    return tx.challengeConversationMessage.create({ data: { conversationId: conversation.id, sender: "CHILD", text } });
  });
  await prunePartnerHistory(childId, competitorId);
  const credentials = await systemAiCredentials(config);
  const recentMessages = [...visibleMessages(conversation, now), childMessage].slice(-8).map((message) => ({
    speaker: message.sender === "CHILD" ? "child" : "virtual_partner",
    text: message.text,
  }));
  const child = await prisma.childProfile.findUnique({ where: { id: childId }, select: { nickname: true } });
  const result = await callDeepSeekText({
    ...credentials,
    config,
    systemPrompt: virtualPartnerPrompt(child?.nickname),
    userPayload: {
      scene: "reply",
      virtualPartnerName: conversation.competitorName,
      childName: child?.nickname ?? null,
      recentMessages,
      childReply: anonymizeChildReply(text),
      instruction: "回应孩子刚说的话，保持友好比赛感，并邀请去完成下一项任务。",
    },
    maxTokens: 100,
  });
  await prisma.challengeConversationMessage.create({
    data: {
      conversationId: conversation.id,
      sender: "VIRTUAL_PARTNER",
      text: normalizeVirtualMessage(result.text),
      model: result.model,
      visibleAt: new Date(Date.now() + challengeReplyDelayMs()),
    },
  });
  await prunePartnerHistory(childId, competitorId);
  return getChallengeConversation(childId, config, new Date(), competitorId);
}
