CREATE TABLE "MascotDialogue" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audioUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MascotDialogue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChildLeaderboardSettings" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "competitorGrowthPercent" INTEGER NOT NULL DEFAULT 100,
    "dailyCompetitorStarDelta" INTEGER NOT NULL DEFAULT 0,
    "dailyAdjustmentDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildLeaderboardSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MascotDialogue_key_key" ON "MascotDialogue"("key");
CREATE INDEX "MascotDialogue_context_isEnabled_sortOrder_idx" ON "MascotDialogue"("context", "isEnabled", "sortOrder");
CREATE UNIQUE INDEX "ChildLeaderboardSettings_childId_key" ON "ChildLeaderboardSettings"("childId");

ALTER TABLE "ChildLeaderboardSettings"
ADD CONSTRAINT "ChildLeaderboardSettings_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MascotDialogue" ("id", "key", "context", "text", "sortOrder", "updatedAt") VALUES
('mascot-start-01', 'start-01', 'START', '选一个喜欢的任务，我们一起出发吧！', 10, CURRENT_TIMESTAMP),
('mascot-start-02', 'start-02', 'START', '准备好了吗？今天也会很有趣！', 20, CURRENT_TIMESTAMP),
('mascot-start-03', 'start-03', 'START', '慢慢来，认真开始就是很棒的一步。', 30, CURRENT_TIMESTAMP),
('mascot-start-04', 'start-04', 'START', '先挑一个最想做的，我们并肩前进！', 40, CURRENT_TIMESTAMP),
('mascot-start-05', 'start-05', 'START', '伸个懒腰，新的探险要开始啦！', 50, CURRENT_TIMESTAMP),
('mascot-progress-01', 'progress-01', 'PROGRESS', '做得真稳，休息一下再继续吧！', 110, CURRENT_TIMESTAMP),
('mascot-progress-02', 'progress-02', 'PROGRESS', '保持自己的节奏，你正在变得更厉害。', 120, CURRENT_TIMESTAMP),
('mascot-progress-03', 'progress-03', 'PROGRESS', '每一次认真尝试，都值得为自己骄傲！', 130, CURRENT_TIMESTAMP),
('mascot-progress-04', 'progress-04', 'PROGRESS', '别着急，我会一直陪你完成探险。', 140, CURRENT_TIMESTAMP),
('mascot-progress-05', 'progress-05', 'PROGRESS', '刚才很专注，继续保持这个好状态！', 150, CURRENT_TIMESTAMP),
('mascot-progress-06', 'progress-06', 'PROGRESS', '遇到难题也没关系，我们慢慢想。', 160, CURRENT_TIMESTAMP),
('mascot-complete-01', 'complete-01', 'COMPLETE', '今天的探险很精彩，你认真完成了！', 210, CURRENT_TIMESTAMP),
('mascot-complete-02', 'complete-02', 'COMPLETE', '太棒了，现在可以开心地休息一下啦！', 220, CURRENT_TIMESTAMP),
('mascot-complete-03', 'complete-03', 'COMPLETE', '你坚持到了最后，我真为你开心！', 230, CURRENT_TIMESTAMP),
('mascot-complete-04', 'complete-04', 'COMPLETE', '认真完成事情的你，今天闪闪发光！', 240, CURRENT_TIMESTAMP),
('mascot-complete-05', 'complete-05', 'COMPLETE', '收好今天的成就，明天再一起出发！', 250, CURRENT_TIMESTAMP),
('mascot-empty-01', 'empty-01', 'EMPTY', '今天轻松一点，去看看你的星愿吧！', 310, CURRENT_TIMESTAMP),
('mascot-empty-02', 'empty-02', 'EMPTY', '暂时没有新任务，我们一起放松一下。', 320, CURRENT_TIMESTAMP),
('mascot-empty-03', 'empty-03', 'EMPTY', '今天可以自由探险，做喜欢的事情吧！', 330, CURRENT_TIMESTAMP),
('mascot-general-01', 'general-01', 'GENERAL', '我会一直陪着你，慢慢来就好。', 410, CURRENT_TIMESTAMP),
('mascot-general-02', 'general-02', 'GENERAL', '认真和坚持，都会让你越来越强大！', 420, CURRENT_TIMESTAMP),
('mascot-general-03', 'general-03', 'GENERAL', '累了就歇一会儿，准备好再继续。', 430, CURRENT_TIMESTAMP),
('mascot-general-04', 'general-04', 'GENERAL', '相信自己的办法，你一定能找到答案。', 440, CURRENT_TIMESTAMP),
('mascot-general-05', 'general-05', 'GENERAL', '今天也要记得给自己一个大大的微笑！', 450, CURRENT_TIMESTAMP);
