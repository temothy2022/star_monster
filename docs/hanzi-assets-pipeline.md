# Hanzi Assets Pipeline

This pipeline keeps hanzi learning media outside the Vite build bundle. Images
and audio are generated locally, uploaded as static files, then imported into the
database as URLs.

## 1. Prepare the content sheet

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
pnpm hanzi:prepare -- --input "/Users/qing/Downloads/一年级生字710.txt" --output work/hanzi-assets-input.json
```

The source text currently contains 698 unique hanzi after duplicates are removed.

Before generating media, fill every row in `work/hanzi-assets-input.json`:

- `pinyin`: pinyin with tone marks, such as `shuǐ`
- `meaning`: short child-friendly meaning text
- `shapeHint`: short shape association
- `imageDescription`: English image prompt concept, with no text in the image
- `sentence`: one unified sentence, using `__` where the hanzi should be hidden
- `words`: 3 common words containing this hanzi

## 2. Generate images and audio

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
export MINIMAX_API_KEY="你的 MiniMax 密钥"
export HANZI_ASSET_PUBLIC_BASE_URL="https://timi.duckpte.com/hanzi-assets/v1"

pnpm hanzi:generate -- \
  --input work/hanzi-assets-input.json \
  --output outputs/hanzi-assets \
  --public-base-url "$HANZI_ASSET_PUBLIC_BASE_URL"
```

For a small test batch:

```bash
pnpm hanzi:generate -- \
  --input work/hanzi-assets-input.json \
  --output outputs/hanzi-assets \
  --public-base-url "$HANZI_ASSET_PUBLIC_BASE_URL" \
  --limit 5
```

The script can resume safely. Existing files are skipped unless `--overwrite` is
passed.

## 3. Configure Nginx once

On the server, add this `location` inside the existing `server { ... }` block
for `timi.duckpte.com`:

```nginx
location ^~ /hanzi-assets/ {
    alias /opt/star-monsters/hanzi-assets/;
    try_files $uri =404;
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
}
```

Then reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Upload static assets

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
pnpm hanzi:deploy-assets
```

This uploads `outputs/hanzi-assets/` to:

```text
/opt/star-monsters/hanzi-assets/v1
```

## 5. Publish code updates

Run this before importing the manifest, because it applies the
`wordAudioUrls` database migration.

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
pnpm deploy:production
```

## 6. Import media URLs into the database

Local database:

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
pnpm hanzi:import -- \
  --manifest outputs/hanzi-assets/manifest.json \
  --public-base-url https://timi.duckpte.com/hanzi-assets/v1
```

Production database, after `pnpm deploy:production` has uploaded the importer:

```bash
ssh -i /Users/qing/.ssh/star_monsters_deploy ubuntu@124.156.187.215
cd /opt/star-monsters
corepack pnpm --filter @star-monsters/api exec tsx prisma/import-hanzi-assets.ts \
  --manifest /opt/star-monsters/hanzi-assets/v1/manifest.json \
  --public-base-url https://timi.duckpte.com/hanzi-assets/v1
```
