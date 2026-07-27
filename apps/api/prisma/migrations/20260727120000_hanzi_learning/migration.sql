CREATE TYPE "TaskExperienceKind" AS ENUM ('STANDARD', 'HANZI_LEARNING');
CREATE TYPE "HanziLearningStatus" AS ENUM ('LEARNING', 'MASTERED');
CREATE TYPE "HanziSessionPhase" AS ENUM ('REVIEW', 'NEW_LEARNING', 'CONSOLIDATION', 'COMPLETED');

ALTER TABLE "TaskTemplate"
ADD COLUMN "experienceKind" "TaskExperienceKind" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "DailyTask"
ADD COLUMN "experienceKindSnapshot" "TaskExperienceKind" NOT NULL DEFAULT 'STANDARD';

CREATE TABLE "HanziCharacter" (
  "id" TEXT NOT NULL,
  "character" TEXT NOT NULL,
  "internalPinyin" TEXT NOT NULL,
  "meaning" TEXT NOT NULL,
  "shapeHint" TEXT NOT NULL,
  "sentence" TEXT NOT NULL,
  "words" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "imageKey" TEXT NOT NULL DEFAULT 'default-hanzi',
  "characterAudioUrl" TEXT,
  "sentenceAudioUrl" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HanziCharacter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HanziLearningSettings" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "newCharactersPerDay" INTEGER NOT NULL DEFAULT 3,
  "reviewDailyLimit" INTEGER NOT NULL DEFAULT 25,
  "consolidationQuestionCount" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HanziLearningSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HanziLearningProgress" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "status" "HanziLearningStatus" NOT NULL DEFAULT 'LEARNING',
  "learnedDate" DATE NOT NULL,
  "reviewStage" INTEGER NOT NULL DEFAULT 0,
  "nextReviewDate" DATE,
  "isDifficult" BOOLEAN NOT NULL DEFAULT false,
  "consecutiveWrong" INTEGER NOT NULL DEFAULT 0,
  "lastReviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HanziLearningProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HanziLearningSession" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "taskAttemptId" TEXT NOT NULL,
  "sessionDate" DATE NOT NULL,
  "phase" "HanziSessionPhase" NOT NULL,
  "reviewCharacterIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "reviewIndex" INTEGER NOT NULL DEFAULT 0,
  "reviewKnownIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "reviewUnknownIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "newCharacterIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "newIndex" INTEGER NOT NULL DEFAULT 0,
  "consolidationQuestions" JSONB NOT NULL,
  "questionIndex" INTEGER NOT NULL DEFAULT 0,
  "consolidationCorrect" INTEGER NOT NULL DEFAULT 0,
  "consolidationTotal" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HanziLearningSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HanziCharacter_character_key" ON "HanziCharacter"("character");
CREATE INDEX "HanziCharacter_isEnabled_sortOrder_idx" ON "HanziCharacter"("isEnabled", "sortOrder");
CREATE UNIQUE INDEX "HanziLearningSettings_childId_key" ON "HanziLearningSettings"("childId");
CREATE UNIQUE INDEX "HanziLearningProgress_childId_characterId_key" ON "HanziLearningProgress"("childId", "characterId");
CREATE INDEX "HanziLearningProgress_childId_status_nextReviewDate_idx" ON "HanziLearningProgress"("childId", "status", "nextReviewDate");
CREATE UNIQUE INDEX "HanziLearningSession_taskAttemptId_key" ON "HanziLearningSession"("taskAttemptId");
CREATE INDEX "HanziLearningSession_childId_sessionDate_idx" ON "HanziLearningSession"("childId", "sessionDate");

ALTER TABLE "HanziLearningSettings"
ADD CONSTRAINT "HanziLearningSettings_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HanziLearningProgress"
ADD CONSTRAINT "HanziLearningProgress_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HanziLearningProgress"
ADD CONSTRAINT "HanziLearningProgress_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "HanziCharacter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HanziLearningSession"
ADD CONSTRAINT "HanziLearningSession_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HanziLearningSession"
ADD CONSTRAINT "HanziLearningSession_taskAttemptId_fkey"
FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "HanziCharacter"
  ("id", "character", "internalPinyin", "meaning", "shapeHint", "sentence", "words", "sortOrder")
VALUES
  ('hanzi-shan', '山', 'shān', '高高的大山', '像三座山峰连在一起', '我们一起爬上了高__。', ARRAY['山顶', '山水', '高山'], 10),
  ('hanzi-shui', '水', 'shuǐ', '流动的水', '像水流向两边散开', '小鱼在__里游来游去。', ARRAY['河水', '水杯', '雨水'], 20),
  ('hanzi-huo', '火', 'huǒ', '暖暖的火焰', '像火苗向上跳动', '冬天的__炉真暖和。', ARRAY['火苗', '火车', '大火'], 30),
  ('hanzi-mu', '木', 'mù', '一棵大树', '像一棵有树干和树枝的树', '森林里有很多树__。', ARRAY['木头', '树木', '木马'], 40),
  ('hanzi-ren', '人', 'rén', '站立的人', '像一个人迈开双腿走路', '公园里有很多__。', ARRAY['大人', '人们', '主人'], 50),
  ('hanzi-kou', '口', 'kǒu', '我们的嘴巴', '像一张方方的嘴巴', '我张开__唱歌。', ARRAY['门口', '开口', '人口'], 60),
  ('hanzi-ri', '日', 'rì', '明亮的太阳', '像方方的太阳', '红__从东方升起。', ARRAY['日出', '日光', '生日'], 70),
  ('hanzi-yue', '月', 'yuè', '夜空中的月亮', '像弯弯的月亮', '今晚的__亮真圆。', ARRAY['月亮', '月光', '明月'], 80),
  ('hanzi-shi', '石', 'shí', '坚硬的石头', '像山脚下的一块石头', '路边有一块大__头。', ARRAY['石头', '石子', '宝石'], 90),
  ('hanzi-tian', '田', 'tián', '种庄稼的田地', '像分成四块的田地', '农民伯伯在__里劳动。', ARRAY['田地', '水田', '田野'], 100),
  ('hanzi-da', '大', 'dà', '又高又大', '像一个人张开双手', '这棵树真__。', ARRAY['大家', '大山', '长大'], 110),
  ('hanzi-xiao', '小', 'xiǎo', '个头不大', '像三个小小的点', '一只__鸟飞过来。', ARRAY['小鸟', '小手', '大小'], 120),
  ('hanzi-tian-sky', '天', 'tiān', '头顶上的天空', '大字上面加一横就是天', '蓝蓝的__上飘着白云。', ARRAY['天空', '今天', '白天'], 130),
  ('hanzi-hua', '花', 'huā', '漂亮的花朵', '草字头下面开出一朵花', '草地上开着一朵__。', ARRAY['花朵', '红花', '开花'], 140),
  ('hanzi-niao', '鸟', 'niǎo', '会飞的小鸟', '像一只有眼睛和尾巴的鸟', '小__在树上唱歌。', ARRAY['小鸟', '飞鸟', '鸟儿'], 150),
  ('hanzi-yun', '云', 'yún', '天空中的云朵', '像两层轻轻飘动的云', '白__在天空中飘。', ARRAY['白云', '云朵', '乌云'], 160),
  ('hanzi-yu', '雨', 'yǔ', '从云里落下的雨滴', '像窗户里落下四滴雨', '今天下__了。', ARRAY['下雨', '雨水', '大雨'], 170),
  ('hanzi-feng', '风', 'fēng', '轻轻吹动的风', '像风吹进一个大口袋', '春__吹绿了小草。', ARRAY['大风', '风车', '春风'], 180),
  ('hanzi-ma', '马', 'mǎ', '跑得很快的马', '像一匹有鬃毛和尾巴的马', '草原上有一匹小__。', ARRAY['小马', '木马', '马车'], 190),
  ('hanzi-yu-fish', '鱼', 'yú', '生活在水里的鱼', '像一条有头有身子有尾巴的鱼', '池塘里有一条__。', ARRAY['小鱼', '金鱼', '鱼缸'], 200);
