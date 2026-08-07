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
  ["pet-dest-chengdu-museum", "chengdu-museum", "成都博物馆", "成都", "中国", "NEARBY", "成都博物馆像一块落在城市中心的金色巨石。走进馆里，可以从古老的石器、陶器和皮影中，慢慢读懂成都几千年的生活故事。", "馆里的皮影颜色鲜艳，艺人只要拉动细细的操纵杆，影子就能在幕布后面唱戏。", "/pet-assets/v1/destinations/chengdu-museum.webp", 130],
  ["pet-dest-jinsha", "jinsha-site-museum", "金沙遗址博物馆", "成都", "中国", "NEARBY", "三千多年前，古蜀人曾在金沙生活。博物馆保留了真实的考古现场，还收藏着太阳神鸟金饰、玉器和象牙，让我们看到古蜀文明灿烂的一面。", "太阳神鸟金饰上有四只飞翔的鸟，它的图案现在还是中国文化遗产的标志。", "/pet-assets/v1/destinations/jinsha-site-museum.webp", 140],
  ["pet-dest-dufu", "du-fu-thatched-cottage", "杜甫草堂", "成都", "中国", "NEARBY", "唐代诗人杜甫曾在这里住过，竹林、小桥和茅屋让院子格外安静。他在成都写下了许多关心生活、描写自然的诗，现在人们来这里寻找诗句里的四季。", "杜甫在成都居住的几年里写了两百多首诗，春雨、花草和邻居都走进了他的作品。", "/pet-assets/v1/destinations/du-fu-thatched-cottage.webp", 150],
  ["pet-dest-wuhou", "wuhou-shrine", "武侯祠", "成都", "中国", "NEARBY", "武侯祠是一处纪念诸葛亮和三国人物的古建筑群。红墙夹道、古柏参天，走在里面就像翻开一本关于智慧、勇气和友情的历史故事书。", "武侯祠旁的红墙竹影很有名，而“武侯”正是诸葛亮生前获得的爵位。", "/pet-assets/v1/destinations/wuhou-shrine.webp", 160],
  ["pet-dest-kuanzhai", "kuanzhai-alley", "宽窄巷子", "成都", "中国", "NEARBY", "宽巷子、窄巷子和井巷子组成了这片老街区。青砖院墙、木门和小院保留着成都旧时的样子，也能看到茶馆、川剧和许多传统手艺。", "三条巷子有宽有窄，名字就来自它们不同的道路宽度，走起来像在城市里玩小迷宫。", "/pet-assets/v1/destinations/kuanzhai-alley.webp", 170],
  ["pet-dest-qingcheng", "mount-qingcheng", "青城山", "都江堰", "中国", "NEARBY", "青城山树木茂密，山路在幽静的森林里一圈圈向上。沿途能听见鸟叫和溪水声，还能看到藏在绿树间的古老建筑，像走进清凉的自然课堂。", "青城山常年青翠，群峰环绕得像一座城，所以得到了“青城”这个名字。", "/pet-assets/v1/destinations/mount-qingcheng.webp", 180],
  ["pet-dest-sanxingdui", "sanxingdui-museum", "三星堆博物馆", "广汉", "中国", "NEARBY", "三星堆展示了古蜀人充满想象力的青铜世界。高大的青铜人像、凸眼面具和神树造型奇特，让我们发现几千年前的人也会用艺术表达对天地的好奇。", "三星堆的青铜面具有又大又突出的眼睛，可能寄托着古蜀人“看得更远”的愿望。", "/pet-assets/v1/destinations/sanxingdui-museum.webp", 190],
  ["pet-dest-leshan", "leshan-giant-buddha", "乐山大佛", "乐山", "中国", "NEARBY", "乐山大佛依山而凿，安静地坐在三条江交汇的地方。古人花了很长时间从岩壁上雕出它，还在头发和衣服里设计排水通道保护石像。", "大佛的一只脚面就能站下很多人，头顶卷曲的发髻中还藏着巧妙的排水沟。", "/pet-assets/v1/destinations/leshan-giant-buddha.webp", 200],
  ["pet-dest-emei", "mount-emei", "峨眉山", "乐山", "中国", "CHINA", "峨眉山从茂密森林一直升到云海之上，不同高度生活着不同的植物和动物。天气晴朗时，金顶可以看到日出、云海和远处层层叠叠的山峰。", "峨眉山的山顶很高，山脚和山顶可能像两个季节，出发时穿短袖，到山顶却要加外套。", "/pet-assets/v1/destinations/mount-emei.webp", 210],
  ["pet-dest-zigong-dinosaur", "zigong-dinosaur-museum", "自贡恐龙博物馆", "自贡", "中国", "CHINA", "这里建在真实的恐龙化石遗址旁，馆里能看到高大的恐龙骨架和埋在岩层中的化石。它们帮助科学家了解一亿多年前四川盆地里的生命。", "恐龙化石不是普通骨头，而是骨骼被矿物慢慢替换后形成的“石头档案”。", "/pet-assets/v1/destinations/zigong-dinosaur-museum.webp", 220],
  ["pet-dest-jiuzhaigou", "jiuzhaigou", "九寨沟", "阿坝", "中国", "CHINA", "九寨沟有清澈的湖泊、层层瀑布和色彩丰富的森林。阳光照进水里时，倒下的树木、浅滩和远山都能被看见，四季会换上不同的颜色。", "这里的湖泊常被叫作“海子”，蓝绿色来自清澈水体、矿物和光线共同形成的效果。", "/pet-assets/v1/destinations/jiuzhaigou.webp", 230],
  ["pet-dest-huanglong", "huanglong-valley", "黄龙", "阿坝", "中国", "CHINA", "黄龙的山谷里，一层层金黄色钙华池装着蓝绿色的水，从高处看像一条闪亮的长龙。雪山、森林和池水组合成了特别的高原风景。", "这些彩池是含有矿物的水经过漫长时间沉积形成的，每一层都在非常缓慢地变化。", "/pet-assets/v1/destinations/huanglong-valley.webp", 240],
  ["pet-dest-xiling", "xiling-snow-mountain", "西岭雪山", "成都", "中国", "NEARBY", "西岭雪山离成都不远，冬天能看到雪地、松林和远处的高山。乘坐索道慢慢升高，脚下的树林会越来越小，天气也会变得更凉。", "唐代诗人杜甫写过“窗含西岭千秋雪”，诗句里的西岭就和成都西边的雪山有关。", "/pet-assets/v1/destinations/xiling-snow-mountain.webp", 250],
  ["pet-dest-luodai", "luodai-ancient-town", "洛带古镇", "成都", "中国", "NEARBY", "洛带古镇保留了许多客家文化，石板路两边能看到会馆、老屋和传统小吃。不同地方来到四川生活的人们，在这里留下了自己的建筑和生活习惯。", "古镇里的广东会馆屋脊和门墙装饰很精细，是客家人记住家乡、互相帮助的地方。", "/pet-assets/v1/destinations/luodai-ancient-town.webp", 260],
  ["pet-dest-anren", "anren-ancient-town", "安仁古镇", "成都", "中国", "NEARBY", "安仁古镇有保存完整的老街、院落和公馆，砖墙、木门记录着一百多年前的生活。沿街慢慢走，还能看到连接不同街区的复古小火车。", "安仁的“仁”有友善、关爱的意思，古镇也收藏了许多普通人生活中使用过的老物件。", "/pet-assets/v1/destinations/anren-ancient-town.webp", 270],
  ["pet-dest-pingle", "pingle-ancient-town", "平乐古镇", "成都", "中国", "NEARBY", "平乐古镇依着白沫江而建，石桥连接两岸的木屋和老街。河边竹林茂密，水流经过桥洞，适合慢慢观察古人怎样逐水而居。", "古镇的乐善桥有很多桥孔，既方便人们过河，也让涨水时江水可以顺利通过。", "/pet-assets/v1/destinations/pingle-ancient-town.webp", 280],
  ["pet-dest-sichuan-science", "sichuan-science-museum", "四川科技馆", "成都", "中国", "NEARBY", "四川科技馆里有关于太空、机械、声音、光和生命的互动展览。按一按、转一转、试一试，就能发现科学不是只在书本里，而是藏在每天的生活中。", "许多科学装置需要亲手操作才能看到结果，提出问题和反复尝试就是小小科学家的工作方法。", "/pet-assets/v1/destinations/sichuan-science-museum.webp", 290],
  ["pet-dest-chengdu-natural", "chengdu-natural-history-museum", "成都自然博物馆", "成都", "中国", "NEARBY", "成都自然博物馆像几块巨大的岩石，里面收藏着矿物、动物标本和恐龙化石。从地球形成到生命演化，可以沿着展厅完成一次跨越亿万年的旅行。", "不同矿物拥有不同颜色和晶体形状，有些在紫外光下还会发出平时看不到的光。", "/pet-assets/v1/destinations/chengdu-natural-history-museum.webp", 300],
  ["pet-dest-danjing", "longquan-danjing-platform", "龙泉山丹景台", "成都", "中国", "NEARBY", "丹景台位于龙泉山上，白色观景步道像一条盘旋的丝带。登上高处，可以越过绿色山坡眺望成都，春天附近还会盛开粉色桃花。", "龙泉山是成都平原东边的重要山脉，天气通透时，从山上能看见城市与远山连在一起。", "/pet-assets/v1/destinations/longquan-danjing-platform.webp", 310],
  ["pet-dest-yading", "yading-nature-reserve", "稻城亚丁", "甘孜", "中国", "CHINA", "稻城亚丁有雪山、草甸、森林和高山湖泊。这里海拔很高，空气清凉，行走时需要放慢脚步，也要一起爱护脆弱的高原植物。", "高原湖泊看起来特别蓝，是因为纯净水体会吸收一部分光，再把蓝色光送回我们的眼睛。", "/pet-assets/v1/destinations/yading-nature-reserve.webp", 320],
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
