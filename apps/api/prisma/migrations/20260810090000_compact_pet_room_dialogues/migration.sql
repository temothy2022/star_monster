-- Keep the pet-room speech bubbles short enough to stay on one line on tablets
-- and phones. Audio is cleared so the release hook regenerates speech from the
-- updated text instead of serving audio for the previous copy.
UPDATE "MascotDialogue" AS d
SET
  "text" = v.text,
  "audioUrl" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('pet-needs-care-01', '肚肚和水杯空啦，先照顾我吧！'),
  ('pet-needs-care-02', '吃点东西、喝口水，我就有精神啦！'),
  ('pet-needs-care-03', '先补充能量，我陪你玩很久！'),
  ('pet-needs-care-04', '我有点饿也有点渴，先照顾我吧！'),
  ('pet-hungry-01', '肚肚咕咕叫，给我一点点心吧！'),
  ('pet-hungry-02', '闻到点心香啦，我想尝一口！'),
  ('pet-hungry-03', '补充能量，陪你玩得更开心！'),
  ('pet-hungry-04', '今天的点心是什么味道呢？'),
  ('pet-thirsty-01', '跑累啦，我想喝一口清凉的水。'),
  ('pet-thirsty-02', '小水杯空啦，帮我加点水吧！'),
  ('pet-thirsty-03', '喝饱水，我就更有精神啦！'),
  ('pet-thirsty-04', '嘴巴有点干，想喝水啦！'),
  ('pet-task-start-01', '新的一天开始啦，做完任务再回来！'),
  ('pet-task-start-02', '今天会学到什么呢？我在小屋等你！'),
  ('pet-task-start-03', '选个任务，勇敢迈出第一步吧！'),
  ('pet-task-start-04', '不用着急，认真开始就很棒啦！'),
  ('pet-task-progress-01', '欢迎回来！按自己的节奏继续吧！'),
  ('pet-task-progress-02', '你认真做事时，我一直为你加油！'),
  ('pet-task-progress-03', '已经走了一段，接下来继续加油！'),
  ('pet-task-progress-04', '累了就休息好，再继续出发吧！'),
  ('pet-task-progress-05', '每次认真尝试，都让今天更精彩！'),
  ('pet-task-complete-01', '今天辛苦啦，安心玩一会儿吧！'),
  ('pet-task-complete-02', '今天的事情做好啦，我真开心！'),
  ('pet-task-complete-03', '探险圆满结束，来小屋放松吧！'),
  ('pet-task-complete-04', '认真又坚持的你，今天闪闪发光！'),
  ('pet-task-complete-05', '任务都完成啦，想和我做什么呢？'),
  ('pet-relax-01', '今天没有新任务，一起轻松玩吧！'),
  ('pet-relax-02', '难得的悠闲时光，想带我去哪儿？'),
  ('pet-relax-03', '今天慢慢来，陪我在小屋待会儿吧！'),
  ('pet-relax-04', '没有任务的日子，也有很多小快乐！'),
  ('pet-general-01', '见到你真开心，来摸摸我吧！'),
  ('pet-general-02', '我一直在小屋等你回来。'),
  ('pet-general-03', '今天也要记得给自己一个大大的微笑！'),
  ('pet-general-04', '和你待在一起，就是我最喜欢的时光！')
) AS v(key, text)
WHERE d."key" = v.key
  AND d."context" LIKE 'PET_%';
