ALTER TYPE "StarLedgerType" ADD VALUE 'PET_ROOM_THEME_SPEND';

ALTER TABLE "PetGrowthProfile" ADD COLUMN "equippedRoomThemeId" TEXT;

CREATE TABLE "PetRoomTheme" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priceStars" INTEGER NOT NULL,
  "backgroundLandscapeUrl" TEXT NOT NULL,
  "backgroundTabletUrl" TEXT NOT NULL,
  "backgroundPhoneUrl" TEXT NOT NULL,
  "previewUrl" TEXT NOT NULL,
  "ambience" JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetRoomTheme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PetRoomThemeUnlock" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "themeId" TEXT NOT NULL,
  "priceStarsSnapshot" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PetRoomThemeUnlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PetRoomTheme_key_key" ON "PetRoomTheme"("key");
CREATE INDEX "PetRoomTheme_isEnabled_sortOrder_idx" ON "PetRoomTheme"("isEnabled", "sortOrder");
CREATE UNIQUE INDEX "PetRoomThemeUnlock_idempotencyKey_key" ON "PetRoomThemeUnlock"("idempotencyKey");
CREATE UNIQUE INDEX "PetRoomThemeUnlock_childId_themeId_key" ON "PetRoomThemeUnlock"("childId", "themeId");
CREATE INDEX "PetRoomThemeUnlock_childId_purchasedAt_idx" ON "PetRoomThemeUnlock"("childId", "purchasedAt");

ALTER TABLE "PetGrowthProfile" ADD CONSTRAINT "PetGrowthProfile_equippedRoomThemeId_fkey"
  FOREIGN KEY ("equippedRoomThemeId") REFERENCES "PetRoomTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PetRoomThemeUnlock" ADD CONSTRAINT "PetRoomThemeUnlock_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PetRoomThemeUnlock" ADD CONSTRAINT "PetRoomThemeUnlock_themeId_fkey"
  FOREIGN KEY ("themeId") REFERENCES "PetRoomTheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PetRoomTheme" (
  "id", "key", "name", "description", "priceStars",
  "backgroundLandscapeUrl", "backgroundTabletUrl", "backgroundPhoneUrl", "previewUrl",
  "ambience", "sortOrder", "updatedAt"
) VALUES
('pet-room-theme-sunny-garden', 'sunny-garden', '阳光花园小屋', '暖暖阳光照进熟悉的小屋', 0,
 '/pet-assets/v1/room-themes/sunny-garden/background-landscape.webp', '/pet-assets/v1/room-themes/sunny-garden/background-tablet.webp', '/pet-assets/v1/room-themes/sunny-garden/background-phone.webp', '/pet-assets/v1/room-themes/sunny-garden/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/sunny-garden/clouds.webp","motion":"DRIFT","placement":"TOP"},{"imageUrl":"/pet-assets/v1/room-themes/sunny-garden/birds.webp","motion":"FLY","placement":"UPPER_RIGHT"}]'::jsonb, 10, CURRENT_TIMESTAMP),
('pet-room-theme-cloud-castle', 'cloud-castle', '云端城堡', '住进飘在云朵上的童话城堡', 8,
 '/pet-assets/v1/room-themes/cloud-castle/background-landscape.webp', '/pet-assets/v1/room-themes/cloud-castle/background-tablet.webp', '/pet-assets/v1/room-themes/cloud-castle/background-phone.webp', '/pet-assets/v1/room-themes/cloud-castle/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/cloud-castle/clouds.webp","motion":"DRIFT","placement":"TOP"},{"imageUrl":"/pet-assets/v1/room-themes/cloud-castle/balloon.webp","motion":"FLOAT","placement":"UPPER_RIGHT"}]'::jsonb, 20, CURRENT_TIMESTAMP),
('pet-room-theme-forest-treehouse', 'forest-treehouse', '森林树屋', '在树叶和萤火虫中安静长大', 10,
 '/pet-assets/v1/room-themes/forest-treehouse/background-landscape.webp', '/pet-assets/v1/room-themes/forest-treehouse/background-tablet.webp', '/pet-assets/v1/room-themes/forest-treehouse/background-phone.webp', '/pet-assets/v1/room-themes/forest-treehouse/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/forest-treehouse/leaves.webp","motion":"FALL","placement":"TOP"},{"imageUrl":"/pet-assets/v1/room-themes/forest-treehouse/fireflies.webp","motion":"TWINKLE","placement":"CENTER"}]'::jsonb, 30, CURRENT_TIMESTAMP),
('pet-room-theme-underwater-observatory', 'underwater-observatory', '海底观察舱', '透过大窗看看神秘的蓝色海洋', 12,
 '/pet-assets/v1/room-themes/underwater-observatory/background-landscape.webp', '/pet-assets/v1/room-themes/underwater-observatory/background-tablet.webp', '/pet-assets/v1/room-themes/underwater-observatory/background-phone.webp', '/pet-assets/v1/room-themes/underwater-observatory/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/underwater-observatory/bubbles.webp","motion":"RISE","placement":"BOTTOM_LEFT"},{"imageUrl":"/pet-assets/v1/room-themes/underwater-observatory/fish.webp","motion":"SWIM","placement":"UPPER_RIGHT"}]'::jsonb, 40, CURRENT_TIMESTAMP),
('pet-room-theme-cherry-courtyard', 'cherry-courtyard', '樱花庭院', '粉色花瓣轻轻落进春日庭院', 14,
 '/pet-assets/v1/room-themes/cherry-courtyard/background-landscape.webp', '/pet-assets/v1/room-themes/cherry-courtyard/background-tablet.webp', '/pet-assets/v1/room-themes/cherry-courtyard/background-phone.webp', '/pet-assets/v1/room-themes/cherry-courtyard/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/cherry-courtyard/petals.webp","motion":"FALL","placement":"TOP"},{"imageUrl":"/pet-assets/v1/room-themes/cherry-courtyard/butterflies.webp","motion":"FLY","placement":"UPPER_RIGHT"}]'::jsonb, 50, CURRENT_TIMESTAMP),
('pet-room-theme-snow-lodge', 'snow-lodge', '雪山木屋', '窗外飘雪，屋里暖得刚刚好', 16,
 '/pet-assets/v1/room-themes/snow-lodge/background-landscape.webp', '/pet-assets/v1/room-themes/snow-lodge/background-tablet.webp', '/pet-assets/v1/room-themes/snow-lodge/background-phone.webp', '/pet-assets/v1/room-themes/snow-lodge/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/snow-lodge/snowflakes.webp","motion":"FALL","placement":"TOP"},{"imageUrl":"/pet-assets/v1/room-themes/snow-lodge/warm-sparkles.webp","motion":"TWINKLE","placement":"CENTER"}]'::jsonb, 60, CURRENT_TIMESTAMP),
('pet-room-theme-starlight-camp', 'starlight-camp', '星空露营地', '躺在帐篷旁数一数闪亮星星', 18,
 '/pet-assets/v1/room-themes/starlight-camp/background-landscape.webp', '/pet-assets/v1/room-themes/starlight-camp/background-tablet.webp', '/pet-assets/v1/room-themes/starlight-camp/background-phone.webp', '/pet-assets/v1/room-themes/starlight-camp/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/starlight-camp/stars.webp","motion":"TWINKLE","placement":"TOP"},{"imageUrl":"/pet-assets/v1/room-themes/starlight-camp/comet.webp","motion":"COMET","placement":"UPPER_RIGHT"}]'::jsonb, 70, CURRENT_TIMESTAMP),
('pet-room-theme-lunar-station', 'lunar-station', '月球空间站', '从月球基地眺望蓝色地球', 22,
 '/pet-assets/v1/room-themes/lunar-station/background-landscape.webp', '/pet-assets/v1/room-themes/lunar-station/background-tablet.webp', '/pet-assets/v1/room-themes/lunar-station/background-phone.webp', '/pet-assets/v1/room-themes/lunar-station/preview.webp',
 '[{"imageUrl":"/pet-assets/v1/room-themes/lunar-station/planets.webp","motion":"FLOAT","placement":"TOP"},{"imageUrl":"/pet-assets/v1/room-themes/lunar-station/satellite.webp","motion":"ORBIT","placement":"UPPER_RIGHT"}]'::jsonb, 80, CURRENT_TIMESTAMP);
