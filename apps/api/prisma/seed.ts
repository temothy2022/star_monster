import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import {
  createFamilyWithParent,
} from "../src/services/account-service.js";
import { hashSecret, loginCodeLookup, normalizeChildLoginCode } from "../src/lib/crypto.js";

try {
  loadEnvFile(".env");
} catch {
  // Production environments normally inject variables directly.
}

const prisma = new PrismaClient();
const DEMO_PARENT_USERNAME = "demo-parent";
const DEMO_CHILD_LOGIN_CODE = normalizeChildLoginCode(
  process.env.SEED_DEMO_CHILD_LOGIN_CODE ?? "22222222",
);
const PET_DESTINATIONS = [
  ["pet-dest-panda-base", "chengdu-panda-base", "成都大熊猫基地", "成都", "中国", "NEARBY", "这里住着许多可爱的大熊猫。它们喜欢吃竹子，也很会爬树，是需要大家一起保护的珍贵动物。", "刚出生的大熊猫非常小，长大后却能变得圆滚滚。", "/pet-assets/v1/destinations/panda-base.webp", 10],
  ["pet-dest-dujiangyan", "dujiangyan", "都江堰", "成都", "中国", "NEARBY", "都江堰是一座古老又聪明的水利工程。两千多年来，它一直帮助人们分水、灌溉农田。", "都江堰没有用大坝堵住江水，而是巧妙地让水自己分流。", "/pet-assets/v1/destinations/dujiangyan.webp", 20],
  ["pet-dest-forbidden-city", "forbidden-city", "故宫", "北京", "中国", "CHINA", "故宫曾是明清两代的皇家宫殿。红墙、金瓦和宽阔庭院里，收藏着许多珍贵的历史故事。", "故宫里有很多屋子，但传说中的九千九百九十九间半并不是准确数字。", "/pet-assets/v1/destinations/forbidden-city.webp", 30],
  ["pet-dest-great-wall", "great-wall", "万里长城", "北京", "中国", "CHINA", "长城沿着山脊蜿蜒向远方。古代的人们修建城墙和烽火台，用来传递消息和守护家园。", "烽火台曾经可以用烟和火光把消息传到很远的地方。", "/pet-assets/v1/destinations/great-wall.webp", 40],
  ["pet-dest-terracotta", "terracotta-warriors", "秦始皇兵马俑", "西安", "中国", "CHINA", "兵马俑是两千多年前制作的陶俑军阵。每一尊陶俑的表情和发型都不完全相同。", "兵马俑刚出土时曾有鲜艳颜色，接触空气后颜色逐渐消失。", "/pet-assets/v1/destinations/terracotta-warriors.webp", 50],
  ["pet-dest-west-lake", "west-lake", "西湖", "杭州", "中国", "CHINA", "西湖像一面安静的大镜子，周围有长堤、小桥和青山。许多诗人都写过这里的四季风景。", "苏堤和白堤的名字，都和古代著名诗人有关。", "/pet-assets/v1/destinations/west-lake.webp", 60],
  ["pet-dest-huangshan", "huangshan", "黄山", "黄山", "中国", "CHINA", "黄山以奇松、怪石、云海和温泉闻名。云雾升起时，山峰像漂浮在天空中的小岛。", "黄山松能在岩石缝里生长，生命力非常顽强。", "/pet-assets/v1/destinations/huangshan.webp", 70],
  ["pet-dest-potala", "potala-palace", "布达拉宫", "拉萨", "中国", "CHINA", "布达拉宫依山而建，白色和红色的建筑层层升高，是青藏高原上醒目的历史建筑。", "拉萨海拔很高，因此常常被称为日光城。", "/pet-assets/v1/destinations/potala-palace.webp", 80],
  ["pet-dest-pisa", "leaning-tower-pisa", "比萨斜塔", "比萨", "意大利", "WORLD", "比萨斜塔是一座会倾斜的钟楼。建造时地基下沉，让它慢慢歪向一边，后来人们加固了它。", "它虽然是斜的，却能安全站立，游客还喜欢拍假装扶住它的照片。", "/pet-assets/v1/destinations/pisa.webp", 90],
  ["pet-dest-eiffel", "eiffel-tower", "埃菲尔铁塔", "巴黎", "法国", "WORLD", "埃菲尔铁塔由许多钢铁构件组成，像一座巨大的积木塔，是巴黎非常醒目的城市标志。", "天气炎热时，金属会膨胀，铁塔的高度会发生一点点变化。", "/pet-assets/v1/destinations/eiffel-tower.webp", 100],
  ["pet-dest-pyramids", "giza-pyramids", "吉萨金字塔", "吉萨", "埃及", "WORLD", "金字塔由巨大的石块建成，已经在沙漠中矗立了几千年，是古埃及文明留下的重要遗迹。", "最大的胡夫金字塔原来表面覆盖着平整明亮的白色石灰岩。", "/pet-assets/v1/destinations/pyramids.webp", 110],
  ["pet-dest-opera", "sydney-opera-house", "悉尼歌剧院", "悉尼", "澳大利亚", "WORLD", "悉尼歌剧院坐在海港边，白色屋顶像扬起的船帆，也像一排打开的贝壳。", "歌剧院的屋顶由许多片瓷砖覆盖，远看会随着阳光改变颜色。", "/pet-assets/v1/destinations/sydney-opera-house.webp", 120],
] as const;

async function applyDemoChildLoginCode(childId: string, loginCodePepper: string) {
  await prisma.childProfile.update({
    where: { id: childId },
    data: {
      loginCodeLookup: loginCodeLookup(DEMO_CHILD_LOGIN_CODE, loginCodePepper),
      loginCodeHash: await hashSecret(DEMO_CHILD_LOGIN_CODE),
      loginCodeLastFour: DEMO_CHILD_LOGIN_CODE.slice(-4),
      starBalance: { set: 200 },
      lifetimeStarsEarned: { set: 200 },
    },
  });
}

async function seedPetDestinations() {
  for (const [id, slug, name, city, country, tier, introduction, funFact, imageUrl, sortOrder] of PET_DESTINATIONS) {
    await prisma.petTravelDestination.upsert({
      where: { id },
      update: { slug, name, city, country, tier, introduction, funFact, imageUrl, sortOrder, isEnabled: true },
      create: { id, slug, name, city, country, tier, introduction, funFact, imageUrl, sortOrder, isEnabled: true },
    });
  }
}

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
  await seedPetDestinations();

  const demoParent = await prisma.user.findUnique({
    where: { username: DEMO_PARENT_USERNAME },
    include: { family: { include: { children: { orderBy: { createdAt: "asc" } } } } },
  });
  const existingDemoChild = demoParent?.family?.children[0];
  if (existingDemoChild) {
    await applyDemoChildLoginCode(existingDemoChild.id, loginCodePepper);
    console.log("演示孩子登录代码:", DEMO_CHILD_LOGIN_CODE);
    return;
  }

  const result = await prisma.$transaction(async (tx) =>
    createFamilyWithParent(tx, {
      familyName: "演示家庭",
      parentUsername: DEMO_PARENT_USERNAME,
      parentDisplayName: "演示家长",
      parentPassword: "demo-parent-2026",
      childNicknames: ["小小探险家"],
      loginCodePepper,
    }),
  );
  const childId = result.children[0]!.childId;
  await applyDemoChildLoginCode(childId, loginCodePepper);

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

  console.log("演示孩子登录代码:", DEMO_CHILD_LOGIN_CODE);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
