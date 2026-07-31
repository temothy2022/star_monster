-- Keep the Prisma enums backward compatible, but consolidate all live and
-- historical records onto the smaller product taxonomy.

UPDATE "TaskTemplate"
SET category = 'CHINESE', "iconKey" = 'chinese', "updatedAt" = CURRENT_TIMESTAMP
WHERE category = 'READING';

UPDATE "TaskTemplate"
SET category = 'EXERCISE', "iconKey" = 'exercise', "updatedAt" = CURRENT_TIMESTAMP
WHERE category = 'PE';

UPDATE "TaskTemplate"
SET category = 'CHORES', "iconKey" = 'chores', "updatedAt" = CURRENT_TIMESTAMP
WHERE category = 'ORGANIZING';

UPDATE "TaskTemplate"
SET category = 'OTHER', "iconKey" = 'other', "updatedAt" = CURRENT_TIMESTAMP
WHERE category = 'MUSIC';

-- Correct the known daily-care tasks that were previously placed under Chinese.
UPDATE "TaskTemplate"
SET category = 'CHORES', "iconKey" = 'chores', "updatedAt" = CURRENT_TIMESTAMP
WHERE title IN ('洗鼻子', '刷牙', '收拾玩具');

UPDATE "DailyTask"
SET "categorySnapshot" = 'CHINESE', "iconKeySnapshot" = 'chinese', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categorySnapshot" = 'READING';

UPDATE "DailyTask"
SET "categorySnapshot" = 'EXERCISE', "iconKeySnapshot" = 'exercise', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categorySnapshot" = 'PE';

UPDATE "DailyTask"
SET "categorySnapshot" = 'CHORES', "iconKeySnapshot" = 'chores', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categorySnapshot" = 'ORGANIZING';

UPDATE "DailyTask"
SET "categorySnapshot" = 'OTHER', "iconKeySnapshot" = 'other', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categorySnapshot" = 'MUSIC';

UPDATE "DailyTask"
SET "categorySnapshot" = 'CHORES', "iconKeySnapshot" = 'chores', "updatedAt" = CURRENT_TIMESTAMP
WHERE "titleSnapshot" IN ('洗鼻子', '刷牙', '收拾玩具');

-- Games and television now share the single user-facing category "娱乐时间".
UPDATE "WishReward"
SET category = 'TELEVISION', "imageKey" = 'television', "updatedAt" = CURRENT_TIMESTAMP
WHERE category = 'GAMES';

UPDATE "WishRedemption"
SET "categorySnapshot" = 'TELEVISION', "updatedAt" = CURRENT_TIMESTAMP
WHERE "categorySnapshot" = 'GAMES';
