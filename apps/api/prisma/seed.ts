import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import {
  createFamilyWithParent,
} from "../src/services/account-service.js";
import { hashSecret } from "../src/lib/crypto.js";

try {
  loadEnvFile(".env");
} catch {
  // Production environments normally inject variables directly.
}

const prisma = new PrismaClient();

async function main() {
  const loginCodePepper = process.env.LOGIN_CODE_PEPPER;
  if (!loginCodePepper || loginCodePepper.length < 32) {
    throw new Error("执行种子前必须设置至少 32 位 LOGIN_CODE_PEPPER");
  }

  const adminUsername = (process.env.SEED_ADMIN_USERNAME ?? "admin").toLowerCase();
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? "change-this-before-first-run";
  const adminDisplayName =
    process.env.SEED_ADMIN_DISPLAY_NAME ?? "超级管理员";

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      displayName: adminDisplayName,
      passwordHash: await hashSecret(adminPassword),
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
    create: {
      username: adminUsername,
      displayName: adminDisplayName,
      passwordHash: await hashSecret(adminPassword),
      role: "SUPER_ADMIN",
    },
  });

  if (process.env.SEED_DEMO_DATA !== "true") return;

  const demoParent = await prisma.user.findUnique({
    where: { username: "demo-parent" },
  });
  if (demoParent) return;

  const result = await prisma.$transaction(async (tx) =>
    createFamilyWithParent(tx, {
      familyName: "演示家庭",
      parentUsername: "demo-parent",
      parentDisplayName: "演示家长",
      parentPassword: "demo-parent-2026",
      childNicknames: ["小小探险家"],
      loginCodePepper,
    }),
  );
  const childId = result.children[0]!.childId;

  await prisma.taskTemplate.createMany({
    data: [
      {
        childId,
        title: "阅读 15 分钟",
        category: "CHINESE",
        iconKey: "chinese",
        mode: "UNTIMED",
        suggestedSeconds: 900,
        baseStars: 2,
        scheduleKind: "DAILY",
        sortOrder: 10,
      },
      {
        childId,
        title: "英语跟读",
        category: "ENGLISH",
        iconKey: "english",
        mode: "TIMED",
        timeLimitSeconds: 600,
        baseStars: 2,
        earlyBonusEnabled: true,
        earlyThresholdSeconds: 180,
        earlyBonusStars: 1,
        scheduleKind: "WORKDAYS",
        sortOrder: 20,
      },
      {
        childId,
        title: "体育锻炼",
        category: "EXERCISE",
        iconKey: "exercise",
        mode: "UNTIMED",
        suggestedSeconds: 1200,
        baseStars: 3,
        scheduleKind: "SELECTED_WEEKDAYS",
        weekdays: [2, 4, 6],
        sortOrder: 30,
      },
    ],
  });

  await prisma.wishReward.createMany({
    data: [
      {
        childId,
        category: "SPORTS",
        title: "一起去运动",
        imageKey: "sports",
        costStars: 12,
        redemptionType: "RECURRING",
        recurrenceKind: "WEEKLY",
        recurrenceIntervalDays: 7,
        sortOrder: 10,
      },
      {
        childId,
        category: "TELEVISION",
        title: "玩一局游戏",
        imageKey: "television",
        costStars: 15,
        redemptionType: "RECURRING",
        recurrenceKind: "WEEKLY",
        recurrenceIntervalDays: 7,
        sortOrder: 20,
      },
      {
        childId,
        category: "TELEVISION",
        title: "看一集动画片",
        imageKey: "television",
        costStars: 10,
        redemptionType: "RECURRING",
        recurrenceKind: "DAILY",
        recurrenceIntervalDays: 1,
        sortOrder: 30,
      },
      {
        childId,
        category: "TOYS",
        title: "选择一个新玩具",
        imageKey: "toys",
        costStars: 60,
        redemptionType: "ONE_TIME",
        sortOrder: 40,
      },
    ],
  });

  console.log("演示孩子登录代码（只在创建时显示）:", result.children[0]!.loginCode);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
