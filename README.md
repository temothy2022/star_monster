# 星宠成长基地

面向 5 岁孩子、主要在 iPad 使用的网页任务系统。项目已经拆成孩子端、家长端、超级管理后台和一套共享 API；三端共用 PostgreSQL 数据库。

## 已实现功能

- 孩子端：8 位探险代码登录、365 天滑动登录态、首次引导、统一星宠、每日任务、普通/限时任务、暂停/继续/放弃/重试、星星奖励、星愿兑换和 7 天足迹。
- 家长端：多孩子切换、循环/一次性任务、任务排序与归档、星愿配置、兑换处理与退款、星星流水和手工调整、统计、孩子资料、引导重置与设备退出。
- AI 育儿助手：DeepSeek 密钥加密配置、自然语言任务草案、星星/兑换校准、基于可用时间与间隔复习的智能排班、家长确认应用与完整审计。
- 超级后台：家庭、家长和孩子账号管理，登录代码生成/重置，账号停用，产品统计与审计日志。
- 服务端：上海时区每日生成和跨日结算、单任务执行锁、服务端计时、事务记账、幂等保护、RBAC、登录限流和过期会话清理。

产品规则见 [docs/product-rules-v1.md](docs/product-rules-v1.md)，技术边界见 [docs/architecture.md](docs/architecture.md)，AI 原则、提示词和返回契约见 [docs/ai-parenting-design.md](docs/ai-parenting-design.md)。

## 本地启动

需要 Node.js、pnpm 和 Docker Desktop。首次运行：

```bash
pnpm install
docker compose up -d
pnpm db:deploy
pnpm db:seed
pnpm dev:all
```

随后访问：

| 入口 | 地址 |
| --- | --- |
| 完整入口与页面列表 | http://127.0.0.1:5175/#pages |
| 孩子端登录 | http://127.0.0.1:5175/#login |
| 家长管理端 | http://127.0.0.1:5176 |
| 超级管理后台 | http://127.0.0.1:5177 |
| API 健康检查 | http://127.0.0.1:8787/api/health |

本地演示账号由 `apps/api/.env` 中的种子配置决定：

- 超级管理员：`admin` / `admin-change-me-2026`
- 演示家长：`demo-parent` / `demo-parent-2026`
- 孩子探险代码：执行 `pnpm db:seed` 时仅在终端完整显示一次

日常启动只需：

```bash
docker compose up -d
pnpm dev:all
```

PostgreSQL 宿主端口由仓库根目录的 `POSTGRES_PORT` 控制，默认 5432；本机端口冲突时可在不提交 Git 的根目录 `.env` 中改为 5433，并同步修改 `apps/api/.env` 的 `DATABASE_URL`。

## 常用命令

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:deploy
pnpm db:seed
pnpm --filter @star-monsters/design-lab assets:optimize
```

`db:migrate` 用于开发时创建新迁移，`db:deploy` 用于应用项目中已经提交的迁移。

## 目录

```text
apps/design-lab/       孩子端与高保真页面目录
apps/parent-admin/     家长管理端
apps/super-admin/      超级管理后台
apps/api/              Fastify API、Prisma、定时维护和种子数据
packages/design-tokens/设计变量
packages/ui/           孩子端共享组件与 Figma 资产
docs/                  冻结的产品规则和技术架构
```

## 部署注意

- 生产环境必须替换 `COOKIE_SECRET`、`LOGIN_CODE_PEPPER` 和默认管理员密码。
- 生产环境必须设置独立的 `AI_CONFIG_ENCRYPTION_KEY`。它用于解密家长保存的 DeepSeek 密钥，不能随意轮换或丢失。
- `LOGIN_CODE_PEPPER` 一旦投入使用必须稳定保存；更换会让已有孩子登录代码无法查找。
- 生产环境使用 HTTPS，API 会自动把 Cookie 标为 `Secure`。
- 定时维护采用幂等实现；多实例部署可安全重复生成每日任务，正式大规模运行时建议改为单独 worker 或带分布式锁的调度器。
- 图片优化脚本会保留原始宽高比，并检查单文件与总资源体积预算。

## 一键发布到生产环境

生产环境不再需要上传完整压缩包或在腾讯云网页终端重复执行命令。首次配置一次 SSH 密钥和路径，之后本地每次修改完成后只需执行：

```bash
pnpm deploy:production
```

首次配置：

1. 在本机复制 `.deploy.env.example` 为 `.deploy.env`，填写服务器公网 IP（或 `timothy.run`）、SSH 用户和服务器项目目录；不要填写密码。
2. 用 SSH 密钥登录服务器。若还没有密钥，可执行 `ssh-keygen -t ed25519`，再执行 `ssh-copy-id ubuntu@你的服务器IP`；腾讯云默认用户通常为 `ubuntu`。
3. 在服务器执行一次以下命令，填写现有 Nginx 的三个静态目录（和首次部署时的目录保持一致）：

```bash
sudo mkdir -p /etc/star-monsters
sudo cp /opt/star-monsters/scripts/server/deploy.env.example /etc/star-monsters/deploy.env
sudo chmod 600 /etc/star-monsters/deploy.env
sudo nano /etc/star-monsters/deploy.env
```

发布脚本会：本机构建三个网页端、通过加密 SSH 同步源码与构建产物、仅在锁文件变更时安装依赖、在服务器应用 Prisma 迁移并构建 API、替换静态站点、最后重启 API。`apps/api/.env`、根目录 `.env`、数据库数据和已保存的 AI 密钥不会被上传或覆盖。

每次发布前先提交代码，确保本机和服务器能以同一个版本号核对：

```bash
git add -A
git commit -m "描述本次修改"
pnpm deploy:production
```

如果希望一次完成“提交全部变更、推送 GitHub、部署生产”，执行：

```bash
pnpm publish:production
```

也可以指定本次提交信息：

```bash
pnpm publish:production -- "feat: update child dashboard"
```

脚本只有在 GitHub 推送成功后才会继续部署；如果远端分支有本机尚未拉取的提交，`git push` 会失败，请先执行 `git pull --rebase origin main` 处理后再发布。

上传阶段会显示文件传输进度。连接连续 120 秒没有传输数据时会自动退出，不会再无限停留在 `3/3`；如网络较慢，可在 `.deploy.env` 中设置更长的 `DEPLOY_RSYNC_TIMEOUT`（秒）。

服务器上的 `/opt/star-monsters/.release-version` 会保存当前线上版本的 Git 提交号。
