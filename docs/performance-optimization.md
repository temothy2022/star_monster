# 性能优化交接

本轮优化已经包含在代码中：孩子端任务列表的轮询改为 10 秒且只在任务页已有数据后运行；任务接口不再返回当天全部历史尝试；汉字会话只查询题目所需的字；汉字预加载只缓存当前和下一个内容；古诗和任务页按路由懒加载；媒体响应使用流式发送；静态图片已统一审计并转换可明显缩小的 PNG/WebP。

## 生成媒体压缩

音频压缩脚本需要本机安装 `ffmpeg`。压缩前建议保留一次备份：

```bash
brew install ffmpeg
pnpm assets:compress-audio -- \
  --input packages/assets/generated/hanzi-assets \
  --in-place \
  --bitrate 64k \
  --sample-rate 24000
pnpm assets:compress-audio -- \
  --input packages/assets/generated/poem-assets \
  --in-place \
  --bitrate 64k \
  --sample-rate 24000
```

这会保持目录结构和文件名不变，数据库 URL 不需要立即修改。当前环境未安装 `ffmpeg`，所以本轮没有直接改写 `packages/assets/generated/` 中的 MP3。

## 媒体缓存指纹

压缩或替换媒体后，建议给 manifest 中实际引用的文件追加内容指纹，避免 Nginx/浏览器继续使用旧缓存：

```bash
pnpm assets:fingerprint-media -- \
  --input packages/assets/generated/hanzi-assets \
  --manifest packages/assets/generated/hanzi-assets/manifest.json \
  --public-base-url https://timothy.run/hanzi-assets/v1 \
  --in-place

pnpm assets:fingerprint-media -- \
  --input packages/assets/generated/poem-assets \
  --manifest packages/assets/generated/poem-assets/manifest.json \
  --public-base-url https://timothy.run/poem-assets/v1 \
  --in-place
```

脚本默认只允许 `--dry-run` 或 `--in-place`，不会无提示覆盖原媒体。完成后依次执行媒体上传脚本和对应的 manifest 导入；`rsync --delete` 会清理旧的生成文件，但不会删除后台上传目录。

## 发布

普通代码使用 `pnpm deploy:production`。发布脚本现在会自动安装仓库内的 Nginx gzip、缓存和代理超时配置，并在重载前执行 `nginx -t`。媒体文件仍使用独立的 `pnpm hanzi:deploy-assets` 和 `pnpm poem:deploy-assets`，避免把大媒体文件混入代码发布包。

## 当前审计基线

- 孩子端初始 JS：约 `229KB`，gzip 约 `72KB`。
- 家长端初始 JS：约 `292KB`，gzip 约 `89KB`。
- 超级后台初始 JS：约 `210KB`，gzip 约 `66KB`。
- 设计实验室栅格素材：`137` 个，共约 `12.22MB`，通过 `pnpm assets:audit`。
