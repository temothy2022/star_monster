import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  businessDateAt,
  businessMinuteOfDayAt,
} from "../lib/time.js";
import { callDeepSeekJson } from "./deepseek-service.js";
import { getChildLeaderboards } from "./footprint-service.js";
import { systemAiCredentials } from "./system-ai-service.js";

export const DAILY_CHILD_MESSAGE_LIMIT = 5;
const GENERATION_RETRY_MS = 10 * 60 * 1_000;
const responseSchema = z.object({
  message: z.string().trim().min(2).max(36).refine((value) => /[\u4e00-\u9fff]/u.test(value), "必须使用中文"),
});

type ChallengePartner = {
  competitorId: string;
  displayName: string;
  avatarKey: string;
  stars: number;
};

function virtualPartnerPrompt(childName?: string | null) {
  return [
    "你是儿童任务应用中的虚拟挑战伙伴，明确不是现实中的真人。",
    "用中国 5 岁孩子会说的简短中文，只输出 JSON。",
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
  if (normalized.length < 2) {
    throw new HttpError(502, "AI_INVALID_RESPONSE", "AI 回复太短，请重新发送一次");
  }
  return normalized;
}

function anonymizeChildReply(text: string) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[已隐藏]")
    .replace(/\d{5,}/g, "[已隐藏]");
}

function serializeConversation(conversation: Awaited<ReturnType<typeof loadTodayConversation>>) {
  if (!conversation) return null;
  const sentToday = conversation.messages.filter((message) => message.sender === "CHILD").length;
  return {
    id: conversation.id,
    businessDate: conversation.businessDate.toISOString().slice(0, 10),
    partner: {
      competitorId: conversation.competitorId,
      displayName: conversation.competitorName,
      avatarKey: conversation.competitorAvatarKey,
      label: "虚拟挑战伙伴" as const,
    },
    messages: conversation.messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      text: message.text,
      createdAt: message.createdAt,
    })),
    dailyLimit: DAILY_CHILD_MESSAGE_LIMIT,
    sentToday,
    remainingToday: Math.max(0, DAILY_CHILD_MESSAGE_LIMIT - sentToday),
  };
}

async function loadTodayConversation(childId: string, config: AppConfig, now = new Date()) {
  return prisma.challengeConversation.findUnique({
    where: {
      childId_businessDate: {
        childId,
        businessDate: businessDateAt(now, config.APP_TIME_ZONE),
      },
    },
    include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
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
  const partner = daily.entries[selfIndex - 1];
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
  const existing = await loadTodayConversation(childId, config, now);
  if (existing?.status === "READY") return serializeConversation(existing);
  if (existing && now.getTime() - existing.updatedAt.getTime() < GENERATION_RETRY_MS) return null;
  const partner = existing
    ? { competitorId: existing.competitorId, displayName: existing.competitorName, avatarKey: existing.competitorAvatarKey, stars: 0 }
    : await eligiblePartner(childId, config, now, options.force);
  if (!partner) return null;
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
    return serializeConversation(await loadTodayConversation(childId, config, now));
  }

  try {
    const child = await prisma.childProfile.findUnique({ where: { id: childId }, select: { nickname: true } });
    const credentials = await systemAiCredentials(config);
    const result = await callDeepSeekJson({
      ...credentials,
      config,
      systemPrompt: virtualPartnerPrompt(child?.nickname),
      userPayload: {
        scene: "first_letter",
        virtualPartnerName: partner.displayName,
        childName: child?.nickname ?? null,
        partnerStarsToday: partner.stars,
        instruction: "说你今天暂时在前面，再邀请对方来追你。不要提具体排名。",
      },
      outputSchema: responseSchema,
      maxTokens: 100,
    });
    await prisma.challengeConversation.update({
      where: { id: conversation.id },
      data: {
        status: "READY",
        messages: {
          create: {
            sender: "VIRTUAL_PARTNER",
            text: normalizeVirtualMessage(result.data.message),
            model: result.model,
          },
        },
      },
    });
  } catch {
    await prisma.challengeConversation.update({
      where: { id: conversation.id },
      data: { status: "FAILED" },
    });
    return null;
  }
  return serializeConversation(await loadTodayConversation(childId, config, now));
}

export async function challengeLetterNotification(
  childId: string,
  config: AppConfig,
  now = new Date(),
) {
  const conversation = await loadTodayConversation(childId, config, now);
  if (!conversation) return null;
  const firstMessage = conversation.messages.find((message) => message.sender === "VIRTUAL_PARTNER");
  if (conversation.status !== "READY" || !firstMessage) return null;
  return {
    conversationId: conversation.id,
    partnerName: conversation.competitorName,
    partnerAvatarKey: conversation.competitorAvatarKey,
    preview: firstMessage.text,
    unread: conversation.openedAt === null,
    partnerLabel: "虚拟挑战伙伴" as const,
  };
}

export async function getChallengeConversation(childId: string, config: AppConfig, now = new Date()) {
  const conversation = await loadTodayConversation(childId, config, now);
  if (!conversation || conversation.status !== "READY") return { conversation: null };
  if (!conversation.openedAt) {
    await prisma.challengeConversation.update({
      where: { id: conversation.id },
      data: { openedAt: now },
    });
  }
  return { conversation: serializeConversation(conversation) };
}

export async function sendChallengeReply(
  childId: string,
  text: string,
  config: AppConfig,
  now = new Date(),
) {
  const conversation = await loadTodayConversation(childId, config, now);
  if (!conversation || conversation.status !== "READY") {
    throw new HttpError(404, "CHALLENGE_CONVERSATION_NOT_FOUND", "今天还没有挑战伙伴来信");
  }
  const sentToday = conversation.messages.filter((message) => message.sender === "CHILD").length;
  if (sentToday >= DAILY_CHILD_MESSAGE_LIMIT) {
    throw new HttpError(429, "CHALLENGE_DAILY_LIMIT", "今天的 5 条消息已经发完啦，明天再聊");
  }
  const credentials = await systemAiCredentials(config);
  const recentMessages = conversation.messages.slice(-8).map((message) => ({
    speaker: message.sender === "CHILD" ? "child" : "virtual_partner",
    text: message.text,
  }));
  const result = await callDeepSeekJson({
    ...credentials,
    config,
    systemPrompt: virtualPartnerPrompt((await prisma.childProfile.findUnique({ where: { id: childId }, select: { nickname: true } }))?.nickname),
    userPayload: {
      scene: "reply",
      virtualPartnerName: conversation.competitorName,
      recentMessages,
      childReply: anonymizeChildReply(text),
      instruction: "回应孩子刚说的话，保持友好比赛感，并邀请去完成下一项任务。",
    },
    outputSchema: responseSchema,
    maxTokens: 100,
  });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ChallengeConversation" WHERE "id" = ${conversation.id} FOR UPDATE`;
    const currentCount = await tx.challengeConversationMessage.count({
      where: { conversationId: conversation.id, sender: "CHILD" },
    });
    if (currentCount >= DAILY_CHILD_MESSAGE_LIMIT) {
      throw new HttpError(429, "CHALLENGE_DAILY_LIMIT", "今天的 5 条消息已经发完啦，明天再聊");
    }
    await tx.challengeConversationMessage.createMany({
      data: [
        { conversationId: conversation.id, sender: "CHILD", text },
        {
          conversationId: conversation.id,
          sender: "VIRTUAL_PARTNER",
          text: normalizeVirtualMessage(result.data.message),
          model: result.model,
        },
      ],
    });
  });
  return getChallengeConversation(childId, config, now);
}
