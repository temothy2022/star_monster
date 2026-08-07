CREATE TYPE "PetGrowthStage" AS ENUM ('BABY', 'GROWING', 'MATURE');
CREATE TYPE "PetCareKind" AS ENUM ('FEED', 'DRINK');
CREATE TYPE "PetTravelTier" AS ENUM ('NEARBY', 'CHINA', 'WORLD');
CREATE TYPE "PetTripStatus" AS ENUM ('TRAVELING', 'RETURNED', 'REVEALED', 'CANCELLED');

ALTER TYPE "StarLedgerType" ADD VALUE 'PET_CARE_SPEND';
ALTER TYPE "StarLedgerType" ADD VALUE 'PET_TRAVEL_SPEND';
ALTER TYPE "StarLedgerType" ADD VALUE 'PET_REFUND';

CREATE TABLE "PetGrowthProfile" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "experience" INTEGER NOT NULL DEFAULT 0,
  "growthStage" "PetGrowthStage" NOT NULL DEFAULT 'BABY',
  "satiety" INTEGER NOT NULL DEFAULT 78,
  "hydration" INTEGER NOT NULL DEFAULT 82,
    "satietySettledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hydrationSettledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "travelEnabled" BOOLEAN NOT NULL DEFAULT true,
  "dailySpendLimitStars" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetGrowthProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PetCareAction" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "kind" "PetCareKind" NOT NULL,
  "itemKey" TEXT NOT NULL,
  "starsSpent" INTEGER NOT NULL,
  "statusBefore" INTEGER NOT NULL,
  "statusAfter" INTEGER NOT NULL,
  "experienceAdded" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetCareAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PetTravelDestination" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "tier" "PetTravelTier" NOT NULL,
  "introduction" TEXT NOT NULL,
  "funFact" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "audioUrl" TEXT,
  "weight" INTEGER NOT NULL DEFAULT 100,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetTravelDestination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PetTrip" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "status" "PetTripStatus" NOT NULL DEFAULT 'TRAVELING',
  "tierSnapshot" "PetTravelTier" NOT NULL,
  "destinationNameSnapshot" TEXT NOT NULL,
  "citySnapshot" TEXT NOT NULL,
  "countrySnapshot" TEXT NOT NULL,
  "introductionSnapshot" TEXT NOT NULL,
  "funFactSnapshot" TEXT NOT NULL,
  "imageUrlSnapshot" TEXT NOT NULL,
  "audioUrlSnapshot" TEXT,
    "costStars" INTEGER NOT NULL,
    "experienceRewardSnapshot" INTEGER NOT NULL,
    "experienceAwarded" INTEGER NOT NULL DEFAULT 0,
  "departedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnsAt" TIMESTAMP(3) NOT NULL,
  "returnedAt" TIMESTAMP(3),
  "revealedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetTrip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PetGrowthConfig" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "feedCostStars" INTEGER NOT NULL DEFAULT 2,
  "feedRestore" INTEGER NOT NULL DEFAULT 28,
  "feedExperience" INTEGER NOT NULL DEFAULT 6,
  "drinkCostStars" INTEGER NOT NULL DEFAULT 1,
  "drinkRestore" INTEGER NOT NULL DEFAULT 32,
  "drinkExperience" INTEGER NOT NULL DEFAULT 4,
  "satietyDecayMinutes" INTEGER NOT NULL DEFAULT 120,
  "hydrationDecayMinutes" INTEGER NOT NULL DEFAULT 90,
  "nearbyCostStars" INTEGER NOT NULL DEFAULT 3,
  "nearbyDurationMinutes" INTEGER NOT NULL DEFAULT 2,
  "nearbyExperience" INTEGER NOT NULL DEFAULT 12,
  "chinaCostStars" INTEGER NOT NULL DEFAULT 10,
  "chinaDurationMinutes" INTEGER NOT NULL DEFAULT 30,
  "chinaExperience" INTEGER NOT NULL DEFAULT 24,
  "worldCostStars" INTEGER NOT NULL DEFAULT 18,
  "worldDurationMinutes" INTEGER NOT NULL DEFAULT 120,
  "worldExperience" INTEGER NOT NULL DEFAULT 40,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetGrowthConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PetGrowthProfile_childId_key" ON "PetGrowthProfile"("childId");
CREATE UNIQUE INDEX "PetCareAction_idempotencyKey_key" ON "PetCareAction"("idempotencyKey");
CREATE INDEX "PetCareAction_childId_createdAt_idx" ON "PetCareAction"("childId", "createdAt");
CREATE UNIQUE INDEX "PetTravelDestination_slug_key" ON "PetTravelDestination"("slug");
CREATE INDEX "PetTravelDestination_tier_isEnabled_sortOrder_idx" ON "PetTravelDestination"("tier", "isEnabled", "sortOrder");
CREATE UNIQUE INDEX "PetTrip_idempotencyKey_key" ON "PetTrip"("idempotencyKey");
CREATE INDEX "PetTrip_childId_status_departedAt_idx" ON "PetTrip"("childId", "status", "departedAt");
CREATE INDEX "PetTrip_destinationId_departedAt_idx" ON "PetTrip"("destinationId", "departedAt");
CREATE UNIQUE INDEX "PetTrip_one_active_per_child" ON "PetTrip"("childId") WHERE "status" = 'TRAVELING';

ALTER TABLE "PetGrowthProfile" ADD CONSTRAINT "PetGrowthProfile_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetCareAction" ADD CONSTRAINT "PetCareAction_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetCareAction" ADD CONSTRAINT "PetCareAction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PetGrowthProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetTrip" ADD CONSTRAINT "PetTrip_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetTrip" ADD CONSTRAINT "PetTrip_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PetGrowthProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetTrip" ADD CONSTRAINT "PetTrip_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "PetTravelDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PetGrowthConfig" ("id", "updatedAt") VALUES ('global', CURRENT_TIMESTAMP);

INSERT INTO "PetTravelDestination" ("id", "slug", "name", "city", "country", "tier", "introduction", "funFact", "imageUrl", "sortOrder", "updatedAt") VALUES
('pet-dest-panda-base', 'chengdu-panda-base', '成都大熊猫基地', '成都', '中国', 'NEARBY', '这里住着许多可爱的大熊猫。它们喜欢吃竹子，也很会爬树，是需要大家一起保护的珍贵动物。', '刚出生的大熊猫非常小，长大后却能变得圆滚滚。', '/pet-assets/v1/destinations/panda-base.webp', 10, CURRENT_TIMESTAMP),
('pet-dest-dujiangyan', 'dujiangyan', '都江堰', '成都', '中国', 'NEARBY', '都江堰是一座古老又聪明的水利工程。两千多年来，它一直帮助人们分水、灌溉农田。', '都江堰没有用大坝堵住江水，而是巧妙地让水自己分流。', '/pet-assets/v1/destinations/dujiangyan.webp', 20, CURRENT_TIMESTAMP),
('pet-dest-forbidden-city', 'forbidden-city', '故宫', '北京', '中国', 'CHINA', '故宫曾是明清两代的皇家宫殿。红墙、金瓦和宽阔庭院里，收藏着许多珍贵的历史故事。', '故宫里有很多屋子，但传说中的九千九百九十九间半并不是准确数字。', '/pet-assets/v1/destinations/forbidden-city.webp', 30, CURRENT_TIMESTAMP),
('pet-dest-great-wall', 'great-wall', '万里长城', '北京', '中国', 'CHINA', '长城沿着山脊蜿蜒向远方。古代的人们修建城墙和烽火台，用来传递消息和守护家园。', '烽火台曾经可以用烟和火光把消息传到很远的地方。', '/pet-assets/v1/destinations/great-wall.webp', 40, CURRENT_TIMESTAMP),
('pet-dest-terracotta', 'terracotta-warriors', '秦始皇兵马俑', '西安', '中国', 'CHINA', '兵马俑是两千多年前制作的陶俑军阵。每一尊陶俑的表情和发型都不完全相同。', '兵马俑刚出土时曾有鲜艳颜色，接触空气后颜色逐渐消失。', '/pet-assets/v1/destinations/terracotta-warriors.webp', 50, CURRENT_TIMESTAMP),
('pet-dest-west-lake', 'west-lake', '西湖', '杭州', '中国', 'CHINA', '西湖像一面安静的大镜子，周围有长堤、小桥和青山。许多诗人都写过这里的四季风景。', '苏堤和白堤的名字，都和古代著名诗人有关。', '/pet-assets/v1/destinations/west-lake.webp', 60, CURRENT_TIMESTAMP),
('pet-dest-huangshan', 'huangshan', '黄山', '黄山', '中国', 'CHINA', '黄山以奇松、怪石、云海和温泉闻名。云雾升起时，山峰像漂浮在天空中的小岛。', '黄山松能在岩石缝里生长，生命力非常顽强。', '/pet-assets/v1/destinations/huangshan.webp', 70, CURRENT_TIMESTAMP),
('pet-dest-potala', 'potala-palace', '布达拉宫', '拉萨', '中国', 'CHINA', '布达拉宫依山而建，白色和红色的建筑层层升高，是青藏高原上醒目的历史建筑。', '拉萨海拔很高，因此常常被称为日光城。', '/pet-assets/v1/destinations/potala-palace.webp', 80, CURRENT_TIMESTAMP),
('pet-dest-pisa', 'leaning-tower-pisa', '比萨斜塔', '比萨', '意大利', 'WORLD', '比萨斜塔是一座会倾斜的钟楼。建造时地基下沉，让它慢慢歪向一边，后来人们加固了它。', '它虽然是斜的，却能安全站立，游客还喜欢拍假装扶住它的照片。', '/pet-assets/v1/destinations/pisa.webp', 90, CURRENT_TIMESTAMP),
('pet-dest-eiffel', 'eiffel-tower', '埃菲尔铁塔', '巴黎', '法国', 'WORLD', '埃菲尔铁塔由许多钢铁构件组成，像一座巨大的积木塔，是巴黎非常醒目的城市标志。', '天气炎热时，金属会膨胀，铁塔的高度会发生一点点变化。', '/pet-assets/v1/destinations/eiffel-tower.webp', 100, CURRENT_TIMESTAMP),
('pet-dest-pyramids', 'giza-pyramids', '吉萨金字塔', '吉萨', '埃及', 'WORLD', '金字塔由巨大的石块建成，已经在沙漠中矗立了几千年，是古埃及文明留下的重要遗迹。', '最大的胡夫金字塔原来表面覆盖着平整明亮的白色石灰岩。', '/pet-assets/v1/destinations/pyramids.webp', 110, CURRENT_TIMESTAMP),
('pet-dest-opera', 'sydney-opera-house', '悉尼歌剧院', '悉尼', '澳大利亚', 'WORLD', '悉尼歌剧院坐在海港边，白色屋顶像扬起的船帆，也像一排打开的贝壳。', '歌剧院的屋顶由许多片瓷砖覆盖，远看会随着阳光改变颜色。', '/pet-assets/v1/destinations/sydney-opera-house.webp', 120, CURRENT_TIMESTAMP);
