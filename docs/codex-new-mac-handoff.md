# Star Monsters 新 Mac Codex 交接文档

本文档给另一台 Mac 上的 Codex 阅读。目标是让 Codex 能自动完成项目开发接力配置，并在两台电脑之间通过 Git 保持代码一致。本文档不配置本地测试环境；后续功能验证以线上正式环境 `https://timothy.run` 为准。

## 0. 项目信息

- 项目目录建议：`~/Documents/Codex/star_monster`
- GitHub 仓库：`git@github.com:temothy2022/star_monster.git`
- 主分支：`main`
- 生产域名：`https://timothy.run`
- 生产服务器：`ubuntu@43.136.134.234`
- 生产部署目录：`/opt/star-monsters`
- 发布命令：`pnpm publish:production`
- 部署配置文件：仓库根目录 `.deploy.env`，该文件不进 Git，需要在每台电脑单独创建。

## 1. 当前机器收尾流程

在切换到另一台电脑之前，当前机器必须先把代码提交并推送到 GitHub。否则另一台电脑无法拿到最新代码。

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"

git status --short
git add -A
git commit -m "feat: refine dashboard scrolling and pet travel visuals"
git push origin main
```

如果 `git commit` 提示没有可提交内容，说明当前机器已经提交过，可以直接执行：

```bash
git push origin main
```

如果需要把当前版本发布到生产：

```bash
pnpm publish:production
curl -sS https://timothy.run/api/health
```

健康检查期望返回：

```json
{"ok":true,"database":"ready"}
```

## 2. 新 Mac 必备工具

Codex 在新 Mac 上先执行：

```bash
xcode-select -p >/dev/null 2>&1 || xcode-select --install

if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

brew install git node@22

corepack enable
corepack prepare pnpm@11.9.0 --activate

node -v
pnpm -v
git --version
```

注意：`xcode-select --install` 可能弹出系统安装窗口，需要用户确认一次。它不是用来做 iOS App 的，这里只是为了提供 Git、编译工具和 Node 依赖安装所需的命令行工具。

## 3. GitHub SSH 配置

先测试新 Mac 是否已经能连 GitHub：

```bash
ssh -T git@github.com
```

如果返回类似下面内容，说明 GitHub SSH 已经配置好：

```text
Hi temothy2022! You've successfully authenticated, but GitHub does not provide shell access.
```

如果返回 `Permission denied (publickey)`，Codex 执行：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh

ssh-keygen -t ed25519 -C "temothy2022-star-monster" -f ~/.ssh/github_star_monster

cat >> ~/.ssh/config <<'EOF'

Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/github_star_monster
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
EOF

chmod 600 ~/.ssh/config
ssh-add --apple-use-keychain ~/.ssh/github_star_monster
cat ~/.ssh/github_star_monster.pub
```

把最后输出的 `.pub` 公钥内容复制到 GitHub：

`GitHub -> Settings -> SSH and GPG keys -> New SSH key`

然后重新测试：

```bash
ssh -T git@github.com
```

## 4. 克隆项目

```bash
mkdir -p ~/Documents/Codex
cd ~/Documents/Codex

git clone git@github.com:temothy2022/star_monster.git
cd star_monster

git status
git log -5 --oneline
pnpm install
pnpm build
```

如果 `pnpm build` 通过，新 Mac 已经能进行代码开发。

## 5. 生产 SSH 部署权限

发布生产需要新 Mac 能通过 SSH 登录生产服务器。

### 方案 A：复制已有部署私钥

从旧 Mac 安全复制以下两个文件到新 Mac 同路径：

```text
~/.ssh/star_monsters_deploy
~/.ssh/star_monsters_deploy.pub
```

新 Mac 执行：

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/star_monsters_deploy
chmod 644 ~/.ssh/star_monsters_deploy.pub
ssh-add --apple-use-keychain ~/.ssh/star_monsters_deploy

ssh -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -i ~/.ssh/star_monsters_deploy \
  ubuntu@43.136.134.234 \
  'hostname; id -un'
```

期望输出包含：

```text
VM-0-10-ubuntu
ubuntu
```

### 方案 B：新 Mac 生成新部署密钥

如果不复制旧私钥，在新 Mac 执行：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh

ssh-keygen -t ed25519 -C "star-monsters-deploy-new-mac" -f ~/.ssh/star_monsters_deploy
cat ~/.ssh/star_monsters_deploy.pub
```

把输出的公钥追加到生产服务器 `ubuntu` 用户的 `~/.ssh/authorized_keys`。这一步需要在已经能登录服务器的旧 Mac 上执行，把下面命令中的 `PASTE_PUBLIC_KEY_HERE` 替换为新 Mac 输出的公钥：

```bash
ssh -i ~/.ssh/star_monsters_deploy ubuntu@43.136.134.234 '
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  cat >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
' <<'EOF'
PASTE_PUBLIC_KEY_HERE
EOF
```

然后回到新 Mac 测试：

```bash
ssh-add --apple-use-keychain ~/.ssh/star_monsters_deploy
ssh -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -i ~/.ssh/star_monsters_deploy \
  ubuntu@43.136.134.234 \
  'hostname; id -un'
```

## 6. 创建 `.deploy.env`

在新 Mac 的仓库根目录创建 `.deploy.env`：

```bash
cd ~/Documents/Codex/star_monster

cat > .deploy.env <<'EOF'
DEPLOY_HOST=43.136.134.234
DEPLOY_USER=ubuntu
DEPLOY_PORT=22
DEPLOY_IDENTITY_FILE=/Users/qing/.ssh/star_monsters_deploy
DEPLOY_PATH=/opt/star-monsters
EOF
```

如果新 Mac 的用户名不是 `qing`，需要把 `DEPLOY_IDENTITY_FILE` 改成实际路径，例如：

```bash
sed -i '' "s|^DEPLOY_IDENTITY_FILE=.*|DEPLOY_IDENTITY_FILE=$HOME/.ssh/star_monsters_deploy|" .deploy.env
```

确认：

```bash
cat .deploy.env
git status --short
```

`.deploy.env` 被 `.gitignore` 忽略，不应该提交。

## 7. 新 Mac 发布生产

发布前必须保证工作区干净，并且已经提交。

```bash
cd ~/Documents/Codex/star_monster

git pull --rebase origin main
git status --short

pnpm build
pnpm test
pnpm publish:production

curl -sS https://timothy.run/api/health
```

如果 `pnpm publish:production` 提示：

```text
Refusing to publish uncommitted changes.
```

说明有未提交文件。处理方式：

```bash
git status --short
git add -A
git commit -m "chore: prepare production release"
git push origin main
pnpm publish:production
```

如果提示：

```text
Permission denied (publickey,password)
```

说明生产 SSH 密钥没有配置好。回到第 5 节检查：

```bash
ssh-add -l
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/star_monsters_deploy ubuntu@43.136.134.234 'hostname; id -un'
```

## 8. 两台 Mac 接力开发规则

每次换电脑前，在当前电脑执行：

```bash
cd "<当前仓库目录>"
git status --short
git add -A
git commit -m "chore: sync work before switching mac"
git push origin main
```

每次在另一台电脑开始前，先执行：

```bash
cd "<另一台电脑仓库目录>"
git pull --rebase origin main
pnpm install
git status --short
```

规则：

- 不要两台电脑同时修改同一批文件。
- 开始工作前一定先 `git pull --rebase origin main`。
- 完成工作后一定 `git add -A && git commit && git push`。
- 发布前必须本地工作区干净，否则部署脚本会拒绝发布。
- GitHub 保存代码；生产服务器只接受 `pnpm publish:production` 发布出来的版本，不作为代码同步源。

## 9. 线上测试方式

孩子端：

```text
https://timothy.run
```

家长后台：

```text
https://timothy.run/parent/
```

超级后台：

```text
https://timothy.run/super/
```

健康检查：

```bash
curl -sS https://timothy.run/api/health
```

查看线上 API 日志：

```bash
ssh -i ~/.ssh/star_monsters_deploy ubuntu@43.136.134.234
sudo journalctl -u star-monsters-api.service -n 120 --no-pager
```

查看当前线上发布版本：

```bash
ssh -i ~/.ssh/star_monsters_deploy ubuntu@43.136.134.234 'cat /opt/star-monsters/.release-version'
```

## 10. 给另一台 Mac Codex 的执行提示词

在另一台 Mac 的 Codex 中可以直接发送：

```text
请先阅读仓库中的 docs/codex-new-mac-handoff.md，然后按文档帮我完成这台 Mac 的 Star Monsters 开发接力配置。
要求：
1. 不配置本地测试环境。
2. 只配置 GitHub 同步和线上生产发布能力。
3. 如果缺少 GitHub SSH 公钥或生产 SSH 私钥，请生成或提示我复制对应公钥/私钥，不要把任何私钥写入 Git。
4. 完成后执行 git pull、pnpm install、pnpm build，并测试 ssh 到生产服务器和 https://timothy.run/api/health。
```

## 11. 安全边界

- 不要把 `.env`、`.deploy.env`、MiniMax Key、DeepSeek Key、SSH 私钥提交到 Git。
- 不要把生产数据库 dump 提交到 Git。
- 不要在文档或代码中硬编码孩子登录码、后台密码或 Cookie Secret。
- 生产服务器数据库是孩子任务、历史记录、星星、学习进度的唯一线上事实来源。代码同步通过 Git，数据同步不通过 Git。
