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

The reviewed words and child-friendly example sentences live in
`work/hanzi-content-reviewed.tsv`. Apply and validate them before generation:

```bash
pnpm hanzi:apply-reviewed -- \
  --input work/hanzi-assets-input.json \
  --content work/hanzi-content-reviewed.tsv \
  --output work/hanzi-assets-input.json

pnpm hanzi:generate -- \
  --input work/hanzi-assets-input.json \
  --validate-only \
  --repair-content
```

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

### Repair reviewed words and sentences without regenerating existing images

Use this mode after correcting words or example sentences. It:

- preserves every existing `image.jpeg` and `character.mp3`;
- generates a missing image or character pronunciation for characters that have
  not been processed yet;
- generates only missing reviewed word audio;
- creates a content-hashed sentence audio URL so iPad caches cannot keep the old
  sentence;
- removes stale local word/sentence audio after the replacement succeeds;
- continues from existing files after interruption;
- processes several characters concurrently.

Check the request plan without calling MiniMax:

```bash
pnpm hanzi:generate -- \
  --input work/hanzi-assets-input.json \
  --output outputs/hanzi-assets \
  --public-base-url "$HANZI_ASSET_PUBLIC_BASE_URL" \
  --repair-content \
  --concurrency 6 \
  --speech-rpm 18 \
  --image-rpm 9 \
  --plan
```

Run the repair and continue the unfinished characters:

```bash
pnpm hanzi:generate -- \
  --input work/hanzi-assets-input.json \
  --output outputs/hanzi-assets \
  --public-base-url "$HANZI_ASSET_PUBLIC_BASE_URL" \
  --repair-content \
  --concurrency 6 \
  --speech-rpm 18 \
  --image-rpm 9 \
  --retries 3
```

`--concurrency` controls how many characters are prepared concurrently, while
the two RPM options independently pace calls to MiniMax. MiniMax currently
documents T2A v2 as 10 RPM for free accounts and 20 RPM for paid accounts, and
image generation as 10 RPM. The defaults leave a small safety margin. When the
API returns status `1002`, the script waits for the quota window, automatically
reduces that endpoint to 9 RPM, and then resumes. Existing files are skipped, so
rerunning the same command continues rather than starting over.

If the MiniMax account is on the free tier, set `--speech-rpm 9` from the start
to avoid the initial automatic cooldown.

## 3. Compress generated images

Run this after MiniMax finishes and before uploading assets. The script keeps
the same file names and paths, so the manifest does not need to change.

Audit the current image size first:

```bash
pnpm hanzi:compress-images:check -- --input outputs/hanzi-assets
```

Preview the expected savings without touching files:

```bash
pnpm hanzi:compress-images -- \
  --input outputs/hanzi-assets \
  --dry-run
```

Compress the generated hanzi images:

```bash
pnpm hanzi:compress-images -- \
  --input outputs/hanzi-assets
```

The default image policy is conservative for the iPad UI: keep images at up to
1024px on the long side, recompress JPEG/WebP at quality 82, and optimize PNG
with palette compression when useful. To test only a small batch, add
`--limit 10`.

## 4. Configure Nginx once

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

## 5. Upload static assets

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
pnpm hanzi:deploy-assets
```

This uploads `outputs/hanzi-assets/` to:

```text
/opt/star-monsters/hanzi-assets/v1
```

## 6. Publish code updates

Run this before importing the manifest, because it applies the
`wordAudioUrls` database migration.

```bash
cd "/Users/qing/Documents/Codex/2026-07-22/ni"
pnpm deploy:production
```

## 7. Import media URLs into the database

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
