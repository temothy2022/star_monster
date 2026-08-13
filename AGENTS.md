# AGENTS.md

> 本文件整理自截至 2026-07-28 的项目代码、仓库文档和产品对话。后续用户的明确要求优先级最高；若本文件与更晚的明确需求冲突，以更晚需求为准。不确定的信息统一标记为 `[待确认]`。

## 0. 新窗口接手清单

新 Codex 接手后先执行，不要凭旧对话猜测工作区状态：

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
pwd
git status --short
git log -5 --oneline
```

然后按任务类型处理：

- 继续本地开发：先看第 9.3 节，启动 PostgreSQL 和 `pnpm dev:all`。
- 修改数据库：先读 Prisma schema 和已有 migrations，再看第 9.4 节。
- 发布普通代码：只走第 9.7 节的 `pnpm deploy:production`。
- 发布汉字图片/音频：只走第 9.8 节的独立媒体流水线。
- 调查线上故障：先验证 `/api/health`、线上 Git SHA 和 systemd 日志，不要直接改生产数据。
- 需要查看真实页面效果时，必须等用户明确要求“测前端”或“看看页面效果”，再启动浏览器；
  默认遵守文末自测规范。

## 1. 项目概述

### 1.1 名称与定位

- 产品名：**星宠成长基地**
- 仓库名：`star-monsters-expedition`
- 当前版本：`0.1.0`
- 一句话描述：面向 5 岁孩子、主要在 iPad 使用的网页任务管理与正向激励系统，包含孩子端、家长管理平台和超级管理后台。
- 核心目标：通过每日任务、星星、星愿、航图、足迹和汉字学习等机制，提高孩子的主观能动性；家长负责配置和引导，超级管理员负责家庭与账号。
- 设计源：Figma 文件 `Untitled`，文件键 `fuX56niw47qImyyTo5CAtN`；设计系统母版为“设计系统母版 - 星球怪兽探险队”和“DS01_母版继承组件库”。
- 支持终端：iPad 横屏/竖屏和桌面浏览器；最低 iPadOS/Safari 版本 `[待确认]`。

### 1.2 应用边界

- `apps/design-lab`：孩子端、首次引导、高保真页面目录和页面清单。
- `apps/parent-admin`：家长管理平台。
- `apps/super-admin`：超级管理后台。
- `apps/api`：共享 API、认证、领域服务、定时维护和 Prisma 数据层。
- `packages/design-tokens`：从 Figma 固化的设计变量。
- `packages/ui`：共享的儿童端组件与视觉素材。
- 三个前端共享一套 Fastify API 和 PostgreSQL 数据库。
- 家长可以管理自己家庭内的多个孩子，也可以在家长平台新建孩子并随时切换；超级管理员仍可代为创建，一个孩子一个独立登录代码。
- V1 不提供家长自助注册，也不把家长管理功能放入孩子端。

### 1.3 技术栈与版本

| 层 | 技术 | 当前仓库版本/状态 |
| --- | --- | --- |
| Monorepo | pnpm workspace | `pnpm@11.9.0` |
| 运行时 | Node.js | 本地/服务器曾使用 Node 22.x；仓库未通过 `engines` 固定精确版本 `[待确认]` |
| 前端 | React / React DOM | lockfile `19.2.7`（manifest `^19.2.0`） |
| 构建 | Vite / `@vitejs/plugin-react` | lockfile `7.3.6` / `5.2.0`（manifest `^7.2.2` / `^5.1.1`） |
| 语言 | TypeScript | `5.9.3`，`strict: true`，目标 `ES2022` |
| API | Fastify | lockfile `5.10.0`（manifest `^5.6.2`） |
| 数据库 ORM | Prisma / `@prisma/client` | `6.19.0` |
| 数据库 | PostgreSQL | 本地 Docker 为 `postgres:16-alpine`；生产数据库精确版本 `[待确认]` |
| 校验 | Zod | lockfile `4.4.3`（manifest `^4.1.12`） |
| Cookie/CORS | `@fastify/cookie` / `@fastify/cors` | lockfile `11.1.2` / `11.3.0` |
| 测试 | Vitest | lockfile `4.1.10`（manifest `^4.0.8`） |
| 图片处理 | Sharp | `0.34.5` |
| AI | DeepSeek JSON API | 家庭级密钥和模型配置；默认模型别名为 `deepseek-v4-flash` |
| 媒体生成 | MiniMax API | 用于离线生成汉字学习图片和发音音频；密钥通过 `MINIMAX_API_KEY` 环境变量读取，禁止写入文档或 Git |
| 样式 | 原生 CSS | 共享变量 + BEM 风格类名，无 CSS-in-JS |
| 客户端路由 | URL hash | 手写 hash 路由，不使用 React Router |
| 客户端请求 | 原生 `fetch` | `credentials: "include"`，同源 `/api` |
| 本地基础设施 | Docker Compose | PostgreSQL 16 |
| 生产基础设施 | 腾讯云轻量应用服务器（香港） | Ubuntu 24.04.4 LTS、Nginx 1.24.0、systemd、SSH/rsync |

### 1.4 本地与生产入口

| 入口 | 本地地址 |
| --- | --- |
| 孩子端/页面清单 | `http://127.0.0.1:5175/#pages` |
| 孩子登录 | `http://127.0.0.1:5175/#login` |
| 家长管理平台 | `http://127.0.0.1:5176` |
| 超级管理后台 | `http://127.0.0.1:5177` |
| API 健康检查 | `http://127.0.0.1:8787/api/health` |

- 三个 Vite 服务均监听 `0.0.0.0`，用于局域网 iPad 访问。
- 生产域名：`timothy.run`；HTTPS 已启用并由 Certbot 管理，自动续期状态
  `[待确认]`。
- 生产服务器公网 IP 为 `43.136.134.234`，SSH 用户为 `ubuntu`。
- 生产项目目录：`/opt/star-monsters`。
- API systemd 服务：`star-monsters-api.service`，监听 `127.0.0.1:8787`。
- Nginx 静态目录：
  - 孩子端：`/opt/star-monsters/apps/design-lab/dist`
  - 家长端：`/opt/star-monsters/apps/parent-admin/dist`
  - 超级后台：`/opt/star-monsters/apps/super-admin/dist`
- 不得把账号密码、DeepSeek Key、MiniMax Key、Cookie Secret、登录代码 pepper 或 SSH 私钥写入本文件、代码或 Git。

## 2. 当前进度

### 2.1 已完成

#### 基础架构和部署

- pnpm monorepo、三个独立 React 前端、Fastify API、PostgreSQL/Prisma 已建立。
- 本地 Docker PostgreSQL、数据库迁移和种子流程已建立。
- 本地三个前端均可通过局域网访问。
- 生产已部署到腾讯云香港轻量服务器，Nginx 反向代理 `/api/`，systemd 运行 API。
- 已建立本地一键发布：`pnpm deploy:production`。
- 发布前强制工作区干净并已提交；本地构建三个前端，rsync 上传，服务器安装依赖、生成 Prisma Client、应用迁移、构建 API 并重启服务。
- 服务器非交互式 pnpm 安装已设置 `CI=true`，避免 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。
- 每次发布都重新 `prisma generate`，避免 Prisma schema 已变更但 Client 类型仍旧。
- Nginx 已有 gzip、Vite 指纹资源长期缓存配置。
- 图片已建立 PNG/JPEG → WebP、体积审计和等比优化脚本；不得删除仍被引用的原始素材。

#### 认证和账号

- 孩子使用 8 位探险代码登录；字符自动去空格/短横线并转大写，排除易混淆字符。
- 孩子会话为服务端会话 + 安全 Cookie，默认 365 天滑动有效期。
- 家长和超级管理员使用用户名密码登录，默认会话 30 天。
- 后台接口 401 时前端自动回到登录页，不再停留在无权限页面。
- 家长登录页支持“记住用户名密码”，保存在本机 `localStorage`；这是用户明确要求，禁止擅自删除。
- 家长和超级管理员都可以查看孩子完整探险代码、重置代码；家长还可以查看孩子设备并全部退出，超级管理员可以重置后台密码。
- 探险代码仍使用 hash/lookup 完成认证，同时保存 AES-256-GCM 加密副本供已授权后台随时查看。历史上仅保存哈希的旧账号无法反解；需要重置一次，或在孩子下次成功登录时自动补存加密副本。
- V1 不开放自助注册。

#### 首次引导和星宠

- 首次引导四步已实现：选择星宠、确认伙伴/昵称、任务介绍、航程介绍。
- 昵称限制为 2–9 个字符。
- 可选星宠：豆芽、泡泡、团团、米露、闪闪。
- 每只星宠有普通、专注、庆祝三种形态。
- 选择后写入孩子档案；所有孩子端页面通过统一星宠映射读取，不能写死某只宠物。
- 普通形态用于任务列表/足迹，专注形态用于任务进行中，庆祝形态用于完成/奖励。
- 首次引导已针对 iPad 横竖屏进行响应式处理。

#### 任务系统

- 后台任务分类统一为六类：语文、数学、英语、运动、生活习惯、综合任务。数据库旧枚举只用于兼容历史数据，不再作为后台可选项。
- 支持循环任务：每天、工作日、指定星期。
- 支持一次性任务：指定日期只出现一次。
- 支持不限时和限时任务。
- 支持当天无限领取任务：`repeatableDaily=true` 时，一天内可反复完成且每次获得奖励。
- 支持普通任务和特殊体验任务：`STANDARD`、`HANZI_LEARNING`。
- 同一孩子同一时刻只能有一个运行中或暂停中的任务，由 `ActiveTaskSlot` 保证。
- 任务支持开始、暂停、继续、完成、超时、放弃、重试。
- 限时任务计时以服务端时间为准；暂停期间停止累计和倒计时。
- 限时任务支持提前完成加奖；只有实际满足提前阈值时完成页才显示“速度惊人”。
- 不限时任务也记录实际完成时长，用于家长统计。
- 每次尝试记录独立 `TaskAttempt`，刷新不会丢失进行中任务。
- 若另一个浏览器已经完成/删除当前任务，当前进行页操作时直接回任务列表，不循环提示“任务不存在”。
- 后台排序已支持按钮和拖动；保存排序时同时更新模板和当天已经生成的 `DailyTask.sortOrder`。
- 任务列表最左侧竖条按任务分类显示不同颜色，不再统一蓝色。
- Start 按钮统一为橙色，点击期间不把文字替换为三个点。
- 任务卡、星星数量、完成状态均由真实数据渲染，不是整张截图。
- 任务列表模块内部滚动，页面本身不做不自然的整页滚动。
- 当天没有已完成任务时，“已完成”分组不显示。
- 连续天数按“当天是否有任务得分”计算；中断后归零，只有连续天数大于 2 才显示连续图标。

#### 星星、每日目标和航图

- 系统只有一种货币：星星。
- `starBalance` 是当前可兑换余额。
- `lifetimeStarsEarned` 是历史累计获得星星，只增不减；它不是第二种货币。
- 任务基础奖励、提前加奖、每日目标额外奖励、星球奖励增加余额和历史累计。
- 兑换只扣余额，不扣历史累计；退款只退余额。
- 家长手工调整只影响余额，不影响历史累计，且必须记录原因。
- 星星流水不可修改，使用幂等键避免重复记账。
- 每日目标默认 12 星；家长可以设置达标后额外奖励，单日只发一次。
- 今日圆环显示“今日任务所得 / 每日目标”，超出目标显示实际值但圆环保持满环。
- 航图八颗星球已实现：水星、金星、地球、火星、木星、土星、天王星、海王星。
- 航行能量使用 `lifetimeStarsEarned`，可用星星使用 `starBalance`。
- 未点亮星球复用彩色图片，通过 CSS 灰度和透明度呈现，不维护重复灰图。
- 家长可配置每颗星球的历史累计门槛和一次性加送星星。
- 达标自动永久点亮，只奖励一次；任务首页自动弹出一次点亮提示。
- “去航图看看”和“留在任务页”都会持久化已读状态，避免刷新或换设备重复弹窗。

#### 星愿

- 固定分类精简为：活动体验、娱乐时间、物品消费；旧“游戏/电视”统一归入娱乐时间。
- 兑换弹窗是在当前页面蒙层 + 底部弹框，不是独立新页面。
- 星愿列表一行 4 个，超过后换行；只有商品模块内部滚动，底部导航固定。
- 已支持三种兑换策略：
  - `ONE_TIME`：一次性；完成后显示已兑换，7 天后从孩子端隐藏，以后不可再次兑换。
  - `RECURRING`：循环；支持每天、每周、每 N 天，到新周期后可再次兑换。
  - `STOCK`：库存；每次兑换扣库存，库存不自动重置，库存大于 0 时可继续兑换。
- 余额不足、存在活动兑换、尚未进入下一周期、一次性已完成或库存耗尽时，服务端拒绝兑换。
- 兑换取消自动退款。

#### 足迹和实时刷新

- 足迹默认展示当前自然周，点击某天查看该日完成任务与星星。
- 星期提示语根据用户选择日期动态变化，不写死 Wednesday。
- 宠物对话有多套动态文案，不固定一条。
- 任务、星愿、足迹、航图已移除带虚假数据的初始静态页面闪烁；加载时不得展示 mock 用户数据。
- 孩子端通过 `useLiveRefresh` 在页面可见时每 4 秒刷新，并在 focus/visibility 恢复时立即刷新，解决家长后台或另一浏览器修改后前台不更新的问题。
- 当前不是 WebSocket/SSE；“实时”语义为可见页面最长约 4 秒内同步。

#### AI 育儿助手

- 家庭可配置 DeepSeek API Key，服务端使用 AES-256-GCM 加密，前端不回显完整密钥。
- 支持获取/选择 DeepSeek 模型，默认别名 `deepseek-v4-flash`。
- 已实现自然语言任务顾问，返回可一键确认的结构化任务草案。
- 已实现星星与兑换合理性评估，只提供建议，不自动改星星或兑换价格。
- 已实现基于孩子可用时间、任务时长、负荷上限、最小间隔的智能排班。
- AI 排班允许在客观时间不足时不完全满足目标周频次；仍禁止未知任务、时间重叠、越界、时长不一致和休息不足。
- AI 输出经过 JSON、Zod 和领域校验，失败时最多让模型修复重试一次。
- AI 不提供医疗、心理、发育诊断，不使用羞辱、比较、威胁、惩罚或扣除已得星星的策略。

#### 汉字学习

- 汉字学习作为一种任务体验 `HANZI_LEARNING` 接入现有任务系统，不是独立产品。
- 点击汉字学习任务进入专用流程；完成整个汉字学习流程后才完成本次任务并获得该任务原有星星。
- 汉字学习内部没有第二套星星或奖励机制，只有完成/未完成。
- 基础流程已实现：
  - 今日学习概览。
  - 复习卡片：正面/背面翻转、认识/不认识反馈。
  - 认识新字：看字形、听读音、想意思。
  - 听句挑战：自动播放句子、选择汉字、正确/错误反馈。
  - 学习结果。
- 复习间隔当前实现为 2、4、7、14、30 天；连续错误会降低阶段并标记难字。
- 同一汉字跨“看字形/听读音/想意思”使用同一个例句。
- 看字形默认播放“汉字 → 停顿 0.5 秒 → 例句”。
- 听读音页面展示三个词语，点击词语可播放。
- 想意思进入时播放汉字与例句，例句旁可手动重播。
- 听句挑战进入页面自动播放；回答后隐藏冗余标题、播放按钮和提示。
- 页面返回按钮返回学习流程上一步，不直接退出任务。
- 右上角三点菜单提供“放弃这次学习”，二次确认后退出到任务列表。
- 首次并发创建汉字会话使用 `taskAttemptId` 幂等边界和 `createMany(skipDuplicates)`，避免第一次打开 500、刷新才正常。
- 后台已支持：
  - 每日新字数、每日复习上限、听句题数设置。
  - 基础汉字库搜索、分页。
  - 单个汉字新增、编辑、软删除。
  - 编辑字形提示、含义、例句、词语、图片资源键/URL、汉字音频 URL、句子音频 URL和排序。
  - 为保证听句挑战选项，启用字库不能少于 3 个字。
- 698 个去重汉字的词语、儿童例句和语境拼音已完成逐字审核，规范源文件为
  `work/hanzi-content-reviewed.tsv` 和 `work/hanzi-assets-input.json`；禁止重新启用
  “小X / X子 / X儿”或“我们来认识X”这类机械兜底模板。
- MiniMax 修复生成使用 `--repair-content`：保留已有图片和汉字读音，只补或替换
  词语/例句音频，并继续完成尚未生成的字；支持 `--concurrency 1–8`、重试和断点续跑。
  图片与语音接口分别按 RPM 限速；遇到 MiniMax `1002` 会等待额度窗口、自动降到
  9 RPM 后继续，禁止通过盲目提高并发绕过接口限额。
- 例句音频使用内容指纹文件名，避免 iPad/Nginx 长缓存继续播放旧句子。

### 2.2 当前交接状态（2026-07-28）

- 当前分支：`main`。
- 汉字学习功能、数据库迁移、家长端字库管理和 698 个汉字资源均已发布到生产。
- 698 个汉字的图片、汉字读音、词语读音和例句读音位于生产服务器
  `/opt/star-monsters/hanzi-assets/v1`，并已通过
  `apps/api/prisma/import-hanzi-assets.ts` 导入生产数据库。
- 生产静态资源公网前缀为
  `https://timothy.run/hanzi-assets/v1`。
- 汉字会话会在进入任务概览后，以 3 个后台并发预加载当天所需图片和音频；
  当前内容优先，音频使用受控 LRU 媒体缓存复用。
- 听句选字的正确答案已随会话一次性下发，点击后由前端立即判断并展示反馈；
  答题记录按题号顺序异步提交，最终完成任务前等待提交队列清空。
- 任务模板归档、停用或改为当天不适用时，孩子端加载今日任务会对账并隐藏遗留的
  `PENDING DailyTask` 快照。
- 最近功能提交：
  - `fe9ab72`：优化汉字资源预加载和听句答题响应。
  - `5b7a5c8`：同步归档任务到孩子端。
  - `629306a`：同步后台任务变更到孩子端。
- 当前没有已知的发布阻塞；后续开发前先执行 `git status --short`，不要假设工作区一定干净。

### 2.3 已讨论但尚未开始或未最终确定

- 汉字字库的 CSV/XLSX 管理后台批量上传界面尚未实现；当前全量导入使用 JSON manifest
  和命令行导入器，个别汉字通过家长后台增删改查。
- 汉字生产资源方案已经落地为“MiniMax 离线生成 → 本地压缩 → rsync 独立上传
  → manifest 导入数据库”；孩子学习时不实时调用 MiniMax。
- 当前没有专属图片时仍使用默认图片，没有音频 URL 时仍使用浏览器
  `speechSynthesis` 中文语音兜底。
- `HanziCharacter.wordAudioUrls` 已存在并已迁移，不能再按旧文档误判为没有词语音频字段。
- 腾讯云 COS/CDN 尚未接入。当前媒体由轻量服务器 Nginx 直接提供，最多约 10 个用户时
  先继续观察；大陆访问速度或带宽成为瓶颈后，优先迁移媒体到 COS，再决定是否增加 CDN。
- 后续如果继续生成或修复汉字资源：
  - MiniMax 密钥使用环境变量 `MINIMAX_API_KEY`；不得写入 `AGENTS.md`、代码、日志或 Git。
  - 语音建议使用 HTTP 同步语音合成 `/v1/t2a_v2`，模型优先 `speech-2.8-turbo`，输出 `mp3`，适合汉字、词语、短句这种短文本。
  - 图片建议使用 `/v1/image_generation`，模型优先 `image-01`，`aspect_ratio: "1:1"`，`response_format: "base64"` 或 `"url"` 后立即下载归档。
  - MiniMax 价格截至 2026-07-27：`speech-2.8-turbo` 按量约 ¥2 / 万字符，`image-01` 约 ¥0.025 / 张；若持续批量生成，可评估 Token Plan / 积分包。
  - 生成脚本：`scripts/generate-hanzi-minimax-sample.mjs`；默认 5 个字小样，也支持 `--input scripts/hanzi-assets-input.example.json --limit 20 --image-candidates 3` 分批生成。
  - 图片生成必须优先使用每个字的 `imageDescription` 英文语义描述，不要直接把汉字、中文例句或长中文解释塞进图片提示词；中文文本越多，模型越容易在图里生成乱码或伪文字。
  - 汉字图片统一提示词模板：

```text
为 5 岁儿童汉字学习应用生成一张 1:1 方形语义插画。只通过物体和场景表现这个字的含义，优先使用英文 imageDescription，例如：{imageDescription}。
图片必须是纯插画，不要出现任何文字。不要画汉字本身。不要出现中文、英文、数字、拼音、标题、标签、标牌、书页文字、练习纸、屏幕 UI、logo、水印、印章、对话气泡、衣服图案、墙面刻字、装饰性伪文字或乱码。
风格必须与“星宠成长基地”一致：温暖童书风、柔和奶油色背景、圆润可爱、轻微纸张颗粒质感、干净边缘、低复杂度、明亮但不过饱和、适合 iPad 儿童界面。
画面只表现一个清晰主体或一个简单场景，主体完整居中，四周都保留 18%-24% 空白安全边距，不要让主体接触或越过图片边缘；背景简洁；避免书本、卡片、告示牌、屏幕等天然容易出现文字的物体；所有物体表面必须干净无符号。
负向约束：text, Chinese text, English text, letters, numbers, pinyin, subtitles, handwriting, calligraphy, typography, signboard, book page, worksheet, flashcard, UI, icon label, logo, watermark, stamp, seal, symbol, inscription, mark, glyph, distorted text, gibberish text, pseudo text.
```
- 汉字图片版权、配音音色的长期生产规范和人工复核责任人 `[待确认]`。
- iPadOS/Safari 最低支持版本、自动播放策略的产品降级文案 `[待确认]`。

## 3. 架构决策

### 3.1 前后端与路由

- 三端必须是独立前端：
  - 孩子端只呈现孩子体验。
  - 家长端只管理当前家庭孩子。
  - 超级后台管理家庭、家长、孩子和全局统计。
- 三端共用一套 API/数据库，避免星星、任务和兑换出现多事实来源。
- 本地 Vite 代理 `/api` 到 `127.0.0.1:8787`；生产由 Nginx 代理，客户端始终请求相对路径 `/api/...`。
- 孩子端使用 hash 路由保存高保真页面清单和运行态页面。
- 页面必须由可维护的 HTML/React 元素构成；Figma 图片只用于图标、插画、纹理等素材，禁止把整张页面截图贴成不可交互页面。

### 3.2 时间和任务状态

- 数据库时间戳保存 UTC，业务日期一律按 `Asia/Shanghai`。
- 每日任务通过“午夜定时生成 + 读取时惰性生成 + 新模板即时生成”三重方式保证存在。
- `(childId, templateId, taskDate)` 唯一，防止重复生成每日任务。
- `DailyTask` 保存任务模板完整快照；模板编辑影响未来实例，并同步当天仍为 `PENDING` 的实例，但不改进行中、已完成或更早的历史。
- `ActiveTaskSlot` 用数据库唯一记录保证一个孩子只能有一个活动任务。
- 限时倒计时与超时判断以服务端为准，客户端倒计时只负责显示。
- `TaskAttempt` 保存每次挑战，重试必须新建尝试，不能覆盖旧尝试。
- 当天可重复任务完成后重新开放同一个 `DailyTask`，但每次产生新的 `TaskAttempt` 和星星流水。

### 3.3 星星和事务

- 只有一种可用货币；`lifetimeStarsEarned` 只是累计统计/航行能量。
- 所有发奖、兑换、退款在数据库事务内执行。
- `StarLedger.idempotencyKey` 唯一，任务奖励通过 `taskAttemptId` 唯一关联。
- 余额绝不能为负。
- 星球点亮奖励和每日目标奖励均使用单独流水类型与幂等键。
- 不得通过前端“按钮禁用”替代服务端余额、状态、归属和幂等校验。

### 3.4 认证和权限

- Cookie 只保存不可预测的随机会话令牌，数据库只保存令牌哈希。
- 密码和孩子登录代码使用带随机盐的 `scrypt` 哈希。
- `LOGIN_CODE_PEPPER` 必须长期稳定，轮换会导致旧孩子登录代码无法查找。
- `AI_CONFIG_ENCRYPTION_KEY` 轮换前必须迁移已有密文，否则已有 DeepSeek Key 和孩子探险代码加密副本无法解密。
- 每个后台请求必须校验角色、家庭和孩子归属，不能只靠前端隐藏入口。
- 高风险操作写入 `AuditLog`。

### 3.5 AI

- AI 是家长决策支持，不是自动执行者。
- DeepSeek 只返回结构化建议；家长确认后才能写入任务或排班。
- 家长自然语言只用于当次请求，不保存在建议记录。
- 不发送孩子登录代码、昵称、家庭名、设备、IP、地址或学校信息给 DeepSeek。
- 密钥使用 AES-256-GCM 加密，完整值不返回、不写日志、不写审计 metadata。

### 3.6 前端同步

- 当前同步方案是前台可见时每 4 秒轮询，同时监听窗口 focus 和 `visibilitychange`。
- 选择轮询是为了用较小复杂度满足少量用户和多浏览器同步；当前没有 WebSocket/SSE。
- 刷新、懒加载和 API 请求期间必须显示中性加载态，禁止先渲染带业务数据的静态 mock。

### 3.7 媒体与性能

- 视觉素材优先使用仓库中已有的 Figma 导出资源，不重复绘制已有图标。
- 大图保留等比关系，生成 WebP 并通过 `<picture>`/浏览器可选资源使用。
- 不能为未点亮星球另存灰图；使用 CSS filter。
- Nginx 对带指纹的 JS/CSS/图片/字体设置一年缓存，HTML 和 API 不按同样策略缓存。
- 不再加载大体积 Noto Sans SC 字体包，优先使用系统常用中文字体栈。
- 汉字媒体不进入 Vite bundle；生产路径为 `/hanzi-assets/v1/...`，Nginx 设置 30 天
  公共缓存。代码发布必须继续排除 `hanzi-assets/`、`packages/assets/generated/` 和 `work/`。
- 汉字会话启动后只预加载本次会话涉及的资源，不得一次性预加载 698 个汉字。
  当前限制为 3 个后台请求并发和最多 180 个音频元素的 LRU 缓存。
- 听句选字使用会话内已经下发的 `targetId` 本地即时判断；API 负责按顺序持久化答案，
  不能重新改回“等待服务器返回后才显示对错”。

## 4. API 约定

### 4.1 通用格式

- API 前缀统一为 `/api`。
- JSON 请求在有 body 时发送 `Content-Type: application/json`。
- 所有前端请求使用 `credentials: "include"`。
- 成功响应使用资源包装对象，例如：
  - `{ child: ... }`
  - `{ attempt: ..., alreadyActive: boolean }`
  - `{ session: ... }`
  - `{ wishes: [...] }`
  - `{ ok: true }`
- 新建汉字等创建接口返回 HTTP `201`；其余成功通常为 `200`。
- 健康检查成功：`{ "ok": true, "database": "ready" }`。
- 错误统一：

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "给用户看的中文消息",
    "issues": []
  }
}
```

- `issues` 只在 Zod 输入错误等需要详细字段错误时存在。
- 常用状态：
  - `400`：输入或请求格式错误。
  - `401`：未登录/会话失效。
  - `403`：角色或资源归属不允许。
  - `404`：资源不存在。
  - `409`：领域状态冲突、重复提交、资源被另一端改变。
  - `500`：未处理异常，前端只显示“服务器暂时无法处理请求”。
  - `503`：数据库或服务暂不可用。

### 4.2 主要路径

#### 认证和档案

- `POST /api/child/auth/login`
- `POST /api/child/auth/logout`
- `GET /api/child/me`
- `PATCH /api/child/onboarding`
- `POST /api/staff/auth/login`
- `POST /api/staff/auth/logout`
- `GET /api/staff/me`

#### 孩子任务

- `GET /api/child/tasks/today`
- `POST /api/child/tasks/:id/start`
- `POST /api/child/attempts/:id/pause`
- `POST /api/child/attempts/:id/resume`
- `POST /api/child/attempts/:id/abandon`
- `POST /api/child/attempts/:id/complete`

#### 孩子汉字学习

- `POST /api/child/hanzi/sessions/start`
- `POST /api/child/hanzi/sessions/:id/review`
- `POST /api/child/hanzi/sessions/:id/learn`
- `POST /api/child/hanzi/sessions/:id/answer`
- `POST /api/child/hanzi/sessions/:id/finish`

#### 孩子星愿、足迹和航图

- `GET /api/child/wishes`
- `POST /api/child/wishes/:id/redeem`
- `GET /api/child/footprints`
- `GET /api/child/planets`
- `POST /api/child/planets/:planet/celebrated`
- `POST /api/child/planets/:planet/notified`

#### 家长端

- `/api/parent/children`
- `/api/parent/children/:id/devices`
- `/api/parent/children/:id/task-templates`
- `PUT /api/parent/children/:id/task-templates/order`
- `/api/parent/children/:id/hanzi/settings`
- `/api/parent/children/:id/hanzi/characters`
- `/api/parent/children/:id/wishes`
- `/api/parent/children/:id/redemptions`
- `/api/parent/children/:id/star-ledger`
- `/api/parent/children/:id/stats`
- `/api/parent/children/:id/task-history`
- `/api/parent/children/:id/planets`
- `/api/parent/ai/config`
- `/api/parent/ai/models`
- `/api/parent/ai/...`：任务建议、星星评估、排班、建议确认。

#### 超级后台

- `/api/admin/families`
- `/api/admin/users/:id`
- `/api/admin/children/:id`
- `/api/admin/metrics`
- `/api/admin/audit-logs`

## 5. 数据库核心结构

### 5.1 账号

- `Family`：家庭租户，关联家长、孩子、AI 配置和 AI 建议。
- `User`：家长/超级管理员，角色为 `PARENT` 或 `SUPER_ADMIN`。
- `UserSession`：后台会话，保存 token hash、设备/IP、过期和最后活动时间。
- `ChildProfile`：孩子档案、登录代码 hash/lookup 与可授权查看的加密副本、昵称、星宠、引导状态、每日目标、余额和历史累计星星。
- `ChildSession`：孩子长期会话和设备。

### 5.2 任务

- `TaskTemplate`：任务配置；含分类、模式、体验类型、奖励、提前加奖、无限领取、循环计划、排序和 AI 排班字段。
- `DailyTask`：某日任务快照；唯一键 `(childId, templateId, taskDate)`。
- `TaskAttempt`：一次任务挑战；保存暂停、执行时长、剩余时长和实际发奖。
- `ActiveTaskSlot`：一个孩子唯一活动尝试。

### 5.3 星星、星愿和航图

- `StarLedger`：不可修改的星星流水；`idempotencyKey` 唯一，任务奖励的 `taskAttemptId` 唯一。
- `WishReward`：星愿定义，支持一次性/循环/库存。
- `WishRedemption`：兑换快照和状态流转。
- `ActiveWishRedemptionSlot`：同一星愿的活动兑换互斥。
- `PlanetProgress`：每个孩子每颗星球唯一；保存门槛、配置奖励、实际奖励、点亮/通知/庆祝时间。

### 5.4 汉字学习

- `HanziCharacter`：基础字库；汉字唯一，含拼音、含义、字形提示、统一例句、词语、图片和音频 URL。
- `HanziLearningSettings`：每个孩子唯一的学习数量设置。
- `HanziLearningProgress`：每个孩子/汉字唯一，保存学习状态、复习阶段、下次复习日、难字和连续错误。
- `HanziLearningSession`：与一个 `TaskAttempt` 一一对应，保存复习、新字、听句阶段与题目进度。

### 5.5 AI 和审计

- `FamilyAiConfig`：家庭 DeepSeek 模型与加密密钥。
- `ChildSchedulePreference`、`ChildAvailabilitySlot`：排班限制和可用时间。
- `AiRecommendation`：结构化建议、模型、提示词版本、应用状态。
- `AuditLog`：高风险操作审计。

## 6. 已知约束和防回归清单

### 6.1 产品规则：不要改错

- **只有一种货币星星。** 不得把航行能量实现为可消费的第二种货币。
- `lifetimeStarsEarned` 必须代表历史获得总量；兑换和手工余额调整不能减少它。
- 汉字学习只是任务类型，必须完成完整流程后才完成任务；不得新增汉字学习专属星星。
- 孩子端不得加入家长任务管理入口。
- 一名孩子同一时刻只能有一个运行中或暂停任务。
- 限时任务是否超时和是否获得提前加奖以服务端为准。
- 任务模板创建时复制快照；当前实现允许编辑结果同步到当天仍为 `PENDING` 的任务，但不能改动进行中、已完成或更早的历史任务。
- 星宠选择必须在所有页面统一，不能在局部写死豆芽或其他宠物。
- 航图未点亮状态用 CSS 灰度，不能维护第二套灰色星球素材。
- 航图仍是底部导航的可点击功能，不再是“暂不实现”状态。
- 星愿以最新三种策略为准；`docs/product-rules-v1.md` 中旧的“可重复/一次性”二分规则已被后续需求覆盖。

### 6.2 数据和状态

- 禁止在任务、星愿、足迹、航图加载时先显示虚假的静态业务数据；这曾导致刷新时像进入别人账号。
- 页面刷新必须恢复真实活动任务，不能恢复到示例任务。
- 如果活动任务已被另一浏览器完成/删除，孩子端必须回任务列表，不能反复提示不存在。
- Start 按钮点击时保持原文字，不要变成 `...`。
- 任务完成页的星星数量必须来自真实任务奖励，不能固定。
- 每日目标、足迹和今日得分只统计任务相关规则明确包含的星星，不能把兑换/手工调整混入。
- 任务排序必须同步当天 `DailyTask`，否则后台顺序变化不会在孩子端生效。
- 汉字会话开始请求必须幂等，React StrictMode/重试不能导致唯一键 500。
- 基础汉字库至少保留 3 个启用汉字，否则无法生成 3 选 1 听句挑战。

### 6.3 UI 和响应式

- 页面应是正常 React/HTML 结构，图标和插画可使用 Figma 图片；禁止用几张整图拼页面。
- 孩子端底部导航必须统一使用 `ChildBottomNav`：
  - 固定悬浮在底部。
  - 四项为任务、航图、星愿、足迹。
  - 使用仓库中用户重新导出的图标。
  - 文字颜色固定 `#584239`。
  - 选中背景固定 `#FF7A3D`。
- 页面顶部“星宠成长基地 + 两个图标”横行已按要求移除/隐藏，不要擅自恢复。
- 任务、星愿、足迹的主内容模块应填满剩余高度；滚动发生在模块内部，底部导航永远固定。
- 星愿一行 4 卡；不能通过拉高单张卡片填满竖屏高度。
- iPad 横竖屏切换必须保持内容可用，但常规代码完成后不要自动打开浏览器测试，见文末自测规范。
- 任务列表圆环数字与圆环之间必须留空隙。
- 宠物对话框要挨着宠物，但不能遮挡余额/今日得分；横竖屏使用独立约束，文字可变并使用逐字显示。
- 任务分类色由 `categorySnapshot` 决定，不由图标或计时类型决定。
- 所有 Start 按钮为橙色；右上角通知/账号按钮、任务进行页三点按钮保持白色背景。
- 申请星愿必须是当前页蒙层和底部弹框，不做独立路由页。
- 汉字田字格内部线为虚线。
- 汉字卡背面是同一张卡的翻转状态，可翻回；不能做成独立业务流程页。
- 汉字学习返回按钮表示上一步；退出必须使用右上角三点菜单的放弃动作。
- 汉字听句正确/错误反馈的继续按钮必须在低高度 iPad 横屏首屏可见，不能留下大块空白。

### 6.4 认证、安全和部署

- 生产必须替换默认 `COOKIE_SECRET`、`LOGIN_CODE_PEPPER`、`AI_CONFIG_ENCRYPTION_KEY` 和默认管理员密码。
- 不得在日志、通用列表响应、审计 metadata 或提交中泄露 DeepSeek Key、登录代码、密码、Cookie 或 SSH 私钥；完整探险代码只允许由已认证的本家庭家长或超级管理员通过专用账号接口查看。
- 生产 HTTPS 下 Cookie 必须为 `Secure`。
- 后台 API 401 必须触发登录页，不能只弹“没有权限”。
- 记住密码是用户明确要求的本地功能；只保存在浏览器本地，不上传到 API。
- 发布脚本必须继续拒绝未提交工作区，线上版本用 Git commit SHA 标识。
- 服务器 `.env`、数据库数据和保存的 AI Key 不能被 rsync 覆盖。
- SSH 走代理时曾出现连接被远端关闭；本机代理可能影响 SSH。不要因此改服务器 SSH 配置，先关闭/绕过本机代理。
- 服务器端 pnpm 安装必须保持非交互 `CI=true`。
- 每次 schema 变化后服务器必须 `prisma generate` 再构建 API。

### 6.5 性能

- 不要重新引入整套 Noto Sans SC 大字体文件；使用当前系统字体栈。
- 新增图片前先检查像素尺寸、透明区域、文件体积和是否可使用 WebP。
- 不能为了压缩破坏透明通道、宽高比或 Figma 对齐。
- 列表和路由页面继续使用懒加载，禁止把所有高分辨率素材打进首屏。
- 对于仅约 10 个用户的当前规模，先优化素材、缓存和对象存储，不以“并发不足”为理由盲目升级服务器。

## 7. 开发规范

### 7.1 命名

- workspace 包统一 `@star-monsters/*`。
- React 组件和文件导出使用 `PascalCase`，Hook 使用 `useXxx`。
- 函数、变量、API client 方法使用 `camelCase`。
- Prisma model 使用 `PascalCase`；枚举值使用 `UPPER_SNAKE_CASE`。
- API 路径使用小写、复数资源和 kebab-case 语义，统一 `/api/{role}/...`。
- CSS 主要使用 BEM 风格：`block__element--modifier`；孩子端模块前缀如 `task-`、`hanzi-`、`planet-`。
- 数据库快照字段以 `Snapshot` 结尾，服务端幂等字段使用 `idempotencyKey`。

### 7.2 TypeScript/代码风格

- 全仓 TypeScript strict，不得用无说明的 `any` 绕过类型。
- 使用 ES modules；API 相对导入在 TypeScript 源码中保留 `.js` 扩展名。
- 当前代码风格：2 空格缩进、双引号、分号、尾随逗号。
- API 输入必须先用 Zod 校验，再进入领域服务。
- 领域规则尽量放 `apps/api/src/domain` 或 `services`，不要塞进路由处理器。
- 跨多表的余额、任务状态、兑换和学习进度修改必须使用 Prisma transaction。
- 前端 API 类型集中在各应用 `api.ts`/`child-api.ts`，不要在多个页面复制不一致的接口类型。
- 优先复用共享组件，例如 `ChildBottomNav`、统一星宠映射、汉字任务三点菜单。
- 仓库当前没有 ESLint/Prettier 配置；格式以现有代码和 TypeScript 构建为准。

### 7.3 UI 实现

- 先读取 Figma 母版和目标页面，优先复用现有设计变量、组件和导出素材。
- Figma 已有图标时直接使用素材；只有简单背景、边框、进度、交互状态适合用 CSS。
- 动画必须说明产品逻辑，不做无意义位移；按钮按下统一表现为轻微下沉/缩放。
- 所有可变业务对象（任务、星愿、足迹、汉字）必须数组/组件化渲染，支持增删与排序。
- 高保真静态预览和真实业务页面可以共存，但真实路由不得读取预览 mock 数据。

### 7.4 Git 和发布

- 当前历史使用 Conventional Commits 风格，常用前缀：
  - `feat: ...`
  - `fix: ...`
  - `perf: ...`
- 提交标题目前以简短英文祈使/描述为主。
- 一次提交聚焦一个逻辑主题，迁移与对应 schema/代码放在同一提交。
- 当前分支策略 `[待确认]`；现工作分支为 `main`。
- 发布前：

```bash
pnpm typecheck
pnpm test
pnpm build
git add -A
git commit -m "feat: describe change"
pnpm deploy:production
```

- 不得为发布而绕过 `deploy-production.sh` 的干净工作区检查。

## 8. 下一步计划

### P0：继续真实 iPad 使用验证

1. 在真实孩子任务中继续观察汉字媒体预加载、自动播放和异步答题保存。
2. 为汉字学习补充服务层/API 自动测试：
   - 空字库。
   - 少于 3 个字。
   - 同时启动同一 attempt。
   - 重复提交认识/学习/答题。
   - 越序提交。
   - 任务被另一浏览器完成/放弃。
   - 完整流程完成后任务只发奖一次。
3. 任何新问题先复现并区分：API 延迟、静态资源下载、Safari 自动播放限制或前端渲染。

### P1：完善汉字内容与批量管理

1. 持续人工抽检 698 个汉字的例句、词语、读音和图片语义。
2. 实现 CSV/XLSX/JSON 模板下载与后台批量上传。
3. 上传时提供逐行校验、重复字检测、预览、失败原因和部分/全量提交策略。
4. 导入完成后数据库读回核对数量、排序和资源 URL。

### P2：性能与基础设施

1. 统计生产汉字会话首次进入与缓存命中后的图片、音频真实请求耗时。
2. 字库资源增长后接入 COS；是否开启 CDN 根据大陆 iPad 实测结果决定 `[待确认]`。
3. 当前用户规模不优先升级计算服务器；优先做资源拆分、缓存和媒体外置。
4. 更新 `docs/product-rules-v1.md`，同步三种星愿、无限领取任务、航图和汉字学习，消除旧规则冲突。

## 9. 环境与部署交接手册

### 9.1 重要路径与运行关系

- 本地仓库绝对路径：
  `/Users/qing/Documents/Codex/2026-07-22/ni`
- 本地使用 Node.js 22.x、Corepack/pnpm 11.9.0、Docker Desktop。
- 本地 PostgreSQL 由根目录 `docker-compose.yml` 启动；当前这台 Mac 在根目录
  `.env` 中设置 `POSTGRES_PORT=5433`，因此 `apps/api/.env` 的 `DATABASE_URL`
  也连接 `127.0.0.1:5433`。仓库默认端口仍是 5432。
- `pnpm dev:all` 同时启动四个长期运行进程：
  - API：`0.0.0.0:8787`
  - 孩子端：`0.0.0.0:5175`
  - 家长端：`0.0.0.0:5176`
  - 超级后台：`0.0.0.0:5177`
- 三个 Vite 前端把相对请求 `/api/...` 代理到本机 `127.0.0.1:8787`。
- 生产代码目录：`/opt/star-monsters`。
- 生产媒体目录：`/opt/star-monsters/hanzi-assets/v1`。
- 生产 API：systemd 服务 `star-monsters-api.service`，监听
  `127.0.0.1:8787`，由 Nginx 代理。
- 生产域名：`https://timothy.run`。
- 生产孩子端：`https://timothy.run/`
- 生产家长管理平台：`https://timothy.run/parent/`
- 生产超级后台：`https://timothy.run/super/`
- 生产 API 健康检查：`https://timothy.run/api/health`
- 代码发布和汉字媒体发布是两条独立流水线，不能混为一条。

### 9.2 新 Mac/首次本地启动

先确认 Docker Desktop 已启动，然后在终端执行：

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"

corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install

docker compose up -d postgres
pnpm db:deploy
pnpm db:seed
pnpm dev:all
```

环境文件规则：

- 根目录 `.env` 只控制 Docker 暴露的 PostgreSQL 端口，可从 `.env.example` 创建。
- `apps/api/.env` 控制 API、数据库连接、Cookie、登录代码 pepper、AI 加密密钥、
  CORS 来源和本地种子账号，可从 `apps/api/.env.example` 创建。
- 如果环境文件已经存在，不要用示例文件覆盖；其中的 pepper、加密密钥和本地账号
  可能已被当前数据库使用。
- 不要把任何 `.env`、`.deploy.env`、DeepSeek/MiniMax Key 或密码提交到 Git。
- `pnpm db:seed` 只在确实需要初始化/补种本地数据时运行；孩子完整探险代码会在
  seed 终端输出，也可由已认证的家长/超级管理员在后台账号区域查看。

### 9.3 日常本地开发与局域网 iPad

每次重新开发通常只需要：

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
docker compose up -d postgres
pnpm dev:all
```

这个终端必须保持运行。启动后先验证：

```bash
docker compose ps
curl -sS http://127.0.0.1:8787/api/health
```

正常健康检查返回：

```json
{"ok":true,"database":"ready"}
```

本机访问地址：

- 页面清单：`http://127.0.0.1:5175/#pages`
- 孩子登录：`http://127.0.0.1:5175/#login`
- 家长管理平台：`http://127.0.0.1:5176`
- 超级后台：`http://127.0.0.1:5177`

局域网访问：

1. Mac 与 iPad 必须在同一个局域网。
2. 查看 Mac 当前局域网 IP：`ipconfig getifaddr en0`；如果为空，再检查实际使用的
   以太网/Wi-Fi 网卡。
3. 把 `127.0.0.1` 换成这个 IP。例如当前曾使用
   `http://192.168.0.217:5175/#login`。
4. 局域网 IP 变化后，同步修改 `apps/api/.env` 中三个 `*_APP_ORIGIN`，再重启
   `pnpm dev:all`。

停止本地开发：

- 在运行 `pnpm dev:all` 的终端按 `Control-C`。
- 如需停止数据库，执行 `docker compose stop postgres`。
- 不要随手执行 `docker compose down -v`；`-v` 会删除本地 PostgreSQL 数据卷。

### 9.4 本地数据库操作

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"

# schema 修改后生成 Prisma Client
pnpm db:generate

# 开发新迁移（只有修改 schema 并准备创建 migration 时使用）
pnpm db:migrate

# 应用仓库已有迁移（首次启动、拉取新代码后使用）
pnpm db:deploy

# 初始化/补充本地种子数据
pnpm db:seed
```

数据库读回示例：

```bash
docker compose exec -T postgres \
  psql -U star_monsters -d star_monsters -c \
  'SELECT COUNT(*) FROM "HanziCharacter";'
```

### 9.5 代码质量检查

常规代码提交前执行：

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"

pnpm typecheck
pnpm test
pnpm build
git diff --check
```

只改某一端时可以先做更快的专项检查：

```bash
pnpm --filter @star-monsters/api typecheck
pnpm --filter @star-monsters/design-lab typecheck
pnpm --filter @star-monsters/parent-admin typecheck
pnpm --filter @star-monsters/super-admin typecheck
```

### 9.6 生产发布前置配置（通常不需要重复）

本机私有配置文件 `.deploy.env` 必须存在且被 Git 忽略。当前生产连接参数为：

```dotenv
DEPLOY_HOST=43.136.134.234
DEPLOY_USER=ubuntu
DEPLOY_PORT=22
DEPLOY_IDENTITY_FILE=/Users/qing/.ssh/star_monsters_deploy
DEPLOY_PATH=/opt/star-monsters
```

它不包含密码或私钥内容。SSH 私钥本体只保存在
`/Users/qing/.ssh/star_monsters_deploy`，不得加入仓库。

发布前验证 SSH：

```bash
ssh -o BatchMode=yes -o IdentitiesOnly=yes \
  -i /Users/qing/.ssh/star_monsters_deploy \
  ubuntu@43.136.134.234 'echo SSH_READY'
```

如果出现 `Connection closed`，先关闭或绕过本机代理再试；如果出现
`Permission denied (publickey)`，检查使用的用户名、私钥路径和服务器
`authorized_keys`，不要直接修改服务器 SSH 安全配置。

服务器一次性配置位于：

- `/etc/star-monsters/deploy.env`：三个 Nginx 静态目录和 API systemd 服务名。
- `/opt/star-monsters/apps/api/.env`：生产数据库和服务秘密。
- `/etc/nginx/sites-enabled/star-monsters`：域名、HTTPS、三端静态站点、API 代理和
  `/hanzi-assets/` 静态媒体。

这些文件不会被本地代码发布覆盖。

### 9.7 日常发布代码到生产

发布脚本拒绝未提交的工作区，这是为了保证本地、Git 和线上版本一致。标准流程：

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"

git status --short
pnpm typecheck
pnpm test
pnpm build

git add -A
git commit -m "描述本次修改"
pnpm deploy:production
```

`pnpm deploy:production` 会自动完成：

1. 在本机构建孩子端、家长端、超级后台。
2. 检查 SSH。
3. rsync 代码与构建产物到 `/opt/star-monsters`。
4. 保留生产 `.env`、数据库、`work/`、`packages/assets/generated/` 和独立
   `hanzi-assets/` 媒体目录。
5. 服务器执行 `prisma generate`、`prisma migrate deploy`、API 构建。
6. 重启并检查 `star-monsters-api.service`。
7. 把发布 Git SHA 写入 `/opt/star-monsters/.release-version`。

不要为了省一步而设置 `DEPLOY_ALLOW_DIRTY=true`；正常发布先提交代码。

发布后验证：

```bash
curl -sS https://timothy.run/api/health

ssh -i /Users/qing/.ssh/star_monsters_deploy \
  ubuntu@43.136.134.234 \
  'cat /opt/star-monsters/.release-version; systemctl is-active star-monsters-api.service'
```

预期分别看到数据库 `ready`、一个 Git SHA 和 `active`。

生产故障排查：

```bash
ssh -i /Users/qing/.ssh/star_monsters_deploy ubuntu@43.136.134.234

sudo systemctl status star-monsters-api.service --no-pager
sudo journalctl -u star-monsters-api.service -n 100 --no-pager
sudo nginx -t
```

### 9.8 汉字图片/音频的独立生产发布

当前 698 个汉字已经完成，不改媒体时不要重复执行本节。完整说明见
`docs/hanzi-assets-pipeline.md`。

本地资源目录：

- 内容源：`work/hanzi-assets-input.json`
- 人工审核文本：`work/hanzi-content-reviewed.tsv`
- 生成结果与 manifest：`packages/assets/generated/hanzi-assets/`

生成完成后先检查并压缩图片：

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"

pnpm hanzi:compress-images:check -- --input packages/assets/generated/hanzi-assets
pnpm hanzi:compress-images -- --input packages/assets/generated/hanzi-assets --dry-run
pnpm hanzi:compress-images -- --input packages/assets/generated/hanzi-assets
```

确认 `packages/assets/generated/hanzi-assets/manifest.json` 是完整全量文件后上传：

```bash
pnpm hanzi:deploy-assets
```

重要：`hanzi:deploy-assets` 使用 `rsync --delete`。如果本地
`packages/assets/generated/hanzi-assets/` 是残缺的小批次，上传会删除生产服务器上不在本地目录中的
其他汉字资源；运行前必须确认本地目录是预期的完整集合。

上传目标：

```text
/opt/star-monsters/hanzi-assets/v1
```

资源上传后，把 manifest 导入生产数据库：

```bash
ssh -i /Users/qing/.ssh/star_monsters_deploy ubuntu@43.136.134.234 \
  'cd /opt/star-monsters && corepack pnpm --filter @star-monsters/api exec tsx prisma/import-hanzi-assets.ts \
  --manifest /opt/star-monsters/hanzi-assets/v1/manifest.json \
  --public-base-url https://timothy.run/hanzi-assets/v1'
```

成功结果应包含 `"entries": 698` 和 `"importedCount": 698`（全量不变时）。

本地数据库需要同步同一 manifest 时：

```bash
pnpm hanzi:import -- \
  --manifest packages/assets/generated/hanzi-assets/manifest.json \
  --public-base-url https://timothy.run/hanzi-assets/v1
```

代码发布 `pnpm deploy:production` 不会上传、覆盖或删除汉字媒体；媒体上传
`pnpm hanzi:deploy-assets` 也不会发布 React/API 代码。

### 9.9 高频错误速查

- `No package.json found in /Users/qing`：没有进入仓库，先执行本节中的 `cd`。
- `tsc: command not found` / `vite: command not found`：在仓库根目录执行
  `pnpm install --frozen-lockfile`，再重新构建。
- `Refusing to publish uncommitted changes`：执行 `git status --short`，确认改动后
  `git add`、`git commit`，再发布。
- `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`：服务器发布必须使用当前
  `scripts/server/apply-release.sh`，其中已经设置 `CI=true`；确认线上脚本不是旧版。
- SSH `Connection closed`：先关闭本机代理。
- SSH `Permission denied (publickey)`：明确指定
  `/Users/qing/.ssh/star_monsters_deploy`，并确认登录用户为 `ubuntu`。
- 本地 API 500：先看运行 `pnpm dev:all` 的 API 终端，再检查
  `docker compose ps` 和 `curl http://127.0.0.1:8787/api/health`。
- Prisma `P2022` 缺列：先执行 `pnpm db:deploy`，再重启 API。
- 生产 API 失败：查看 `journalctl -u star-monsters-api.service`，不要只根据前端
  “服务器暂时无法处理请求”猜测。
- 汉字资源 404：检查服务器
  `/opt/star-monsters/hanzi-assets/v1/manifest.json`、Nginx
  `/hanzi-assets/` alias 和数据库 URL 前缀。

## 自测规范

代码写完后的自动行为：

### 必须做

- curl 调 API 验证状态码和返回体结构
- 数据库写入后读回确认
- 边界值（空参数、超长、并发）的 API 响应

### 禁止做

- 浏览器兼容性测试
- 样式回归、多设备适配
- 任何需要启动浏览器或截图对比的操作

上述“禁止做”的项目仅在用户明确说“测前端”或“帮我看看页面效果”时才执行。

判断标准：凡是需要打开浏览器窗口的操作，一律跳过。
