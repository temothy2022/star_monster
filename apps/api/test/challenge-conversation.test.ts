import { describe, expect, it } from "vitest";
import {
  challengeOfferEligible,
  challengeReplyDelayMs,
  DAILY_CHILD_MESSAGE_LIMIT,
  normalizeVirtualMessage,
} from "../src/services/challenge-conversation-service.js";

describe("你的挑战伙伴规则", () => {
  it("只在中午后、低完成量且处于后半区时触发", () => {
    expect(challengeOfferEligible({ minuteOfDay: 720, completedTasks: 1, rank: 9, totalParticipants: 14, selfIndex: 8 })).toBe(true);
    expect(challengeOfferEligible({ minuteOfDay: 719, completedTasks: 0, rank: null, totalParticipants: 14, selfIndex: 13 })).toBe(false);
    expect(challengeOfferEligible({ minuteOfDay: 840, completedTasks: 2, rank: 12, totalParticipants: 14, selfIndex: 11 })).toBe(false);
  });

  it("服务端限制孩子每天发送 5 条", () => {
    expect(DAILY_CHILD_MESSAGE_LIMIT).toBe(5);
  });

  it("把伙伴回复延迟控制在 10 到 60 秒", () => {
    expect(challengeReplyDelayMs(0)).toBe(10_000);
    expect(challengeReplyDelayMs(0.5)).toBeGreaterThanOrEqual(35_000);
    expect(challengeReplyDelayMs(1)).toBe(60_000);
  });

  it("移除表情并把虚拟伙伴消息限制为 24 个字符", () => {
    const output = normalizeVirtualMessage("我今天先跑到前面啦，你快来追我吧！🚀再加很长很长的一句话");
    expect(output).not.toContain("🚀");
    expect([...output]).toHaveLength(24);
  });
});
