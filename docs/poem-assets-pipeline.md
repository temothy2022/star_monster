# 古诗媒体生成与导入流程

本流程用于批量生成古诗学习的专属配图和朗读音频。生成脚本会调用 MiniMax，输出到 `outputs/poem-assets/`，并生成可导入数据库的 `manifest.json`。

## 1. 准备

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
export MINIMAX_API_KEY="你的 MiniMax Key"
export POEM_ASSET_PUBLIC_BASE_URL="https://timothy.run/poem-assets/v1"
```

建议先看计划，不会调用 MiniMax：

```bash
pnpm poem:generate-assets -- \
  --input "/Users/qing/Workbuddy/2026-07-29-10-33-53/人教版小学语文1-6年级古诗.json" \
  --output outputs/poem-assets \
  --public-base-url "$POEM_ASSET_PUBLIC_BASE_URL" \
  --plan
```

## 2. 小批量试跑

先跑 3 首，检查配图风格、音频内容和体积：

```bash
pnpm poem:generate-assets -- \
  --input "/Users/qing/Workbuddy/2026-07-29-10-33-53/人教版小学语文1-6年级古诗.json" \
  --output outputs/poem-assets \
  --public-base-url "$POEM_ASSET_PUBLIC_BASE_URL" \
  --limit 3 \
  --concurrency 2 \
  --image-rpm 6 \
  --speech-rpm 10
```

朗读音频格式是：`标题 + 朝代 + 作者 + 全文`。例如：`《咏鹅》。唐代，骆宾王。鹅，鹅，鹅...`

## 3. 全量生成

确认小样可用后跑全量：

```bash
pnpm poem:generate-assets -- \
  --input "/Users/qing/Workbuddy/2026-07-29-10-33-53/人教版小学语文1-6年级古诗.json" \
  --output outputs/poem-assets \
  --public-base-url "$POEM_ASSET_PUBLIC_BASE_URL" \
  --concurrency 3 \
  --image-rpm 8 \
  --speech-rpm 12
```

脚本默认会：

- 图片生成后立即压缩成 `webp`，默认最长边 `768px`、质量 `76`。
- 音频请求 MiniMax 时直接使用单声道 MP3、`24000Hz`、`64kbps`。
- 使用内容 hash 命名文件，避免线上长缓存继续命中旧音频或旧图。
- 支持断点续跑；已存在文件默认跳过。

如果本机安装了 `ffmpeg`，可以额外打开二次音频压缩：

```bash
pnpm poem:generate-assets -- \
  --input "/Users/qing/Workbuddy/2026-07-29-10-33-53/人教版小学语文1-6年级古诗.json" \
  --output outputs/poem-assets \
  --public-base-url "$POEM_ASSET_PUBLIC_BASE_URL" \
  --ffmpeg-audio
```

## 4. 上传媒体

确认 `outputs/poem-assets/manifest.json` 是完整全量文件后再上传。上传脚本使用 `.deploy.env`：

```bash
pnpm poem:deploy-assets
```

默认上传到：

```text
/opt/star-monsters/poem-assets/v1
```

## 5. Nginx 静态路径

生产 Nginx 需要和汉字媒体一样增加静态路径：

```nginx
location ^~ /poem-assets/ {
    alias /opt/star-monsters/poem-assets/;
    access_log off;
    add_header Cache-Control "public, max-age=2592000, immutable";
    try_files $uri =404;
}
```

改完后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 6. 导入数据库

本地导入：

```bash
pnpm poem:import-assets -- \
  --manifest outputs/poem-assets/manifest.json \
  --public-base-url "$POEM_ASSET_PUBLIC_BASE_URL"
```

生产导入：

```bash
ssh ubuntu@43.136.134.234 \
  'cd /opt/star-monsters && corepack pnpm --filter @star-monsters/api exec tsx prisma/import-poem-assets.ts \
  --manifest /opt/star-monsters/poem-assets/v1/manifest.json \
  --public-base-url https://timothy.run/poem-assets/v1'
```

导入后，孩子端古诗学习会优先使用 `Poem.imageUrl` 和 `Poem.audioUrl`；没有媒体的诗仍会回退到默认图和浏览器朗读。
