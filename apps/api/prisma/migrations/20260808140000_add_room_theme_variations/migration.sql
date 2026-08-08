INSERT INTO "PetRoomTheme" (
  "id", "key", "name", "description", "priceStars",
  "backgroundLandscapeUrl", "backgroundTabletUrl", "backgroundPhoneUrl", "previewUrl",
  "ambience", "sortOrder", "updatedAt"
) VALUES
('pet-room-theme-osaka-castle', 'osaka-castle', '大阪城春日小屋', '在樱花和护城河边看看大阪城', 24,
 '/pet-assets/v1/room-themes/osaka-castle/background-landscape.webp', '/pet-assets/v1/room-themes/osaka-castle/background-tablet.webp', '/pet-assets/v1/room-themes/osaka-castle/background-phone.webp', '/pet-assets/v1/room-themes/osaka-castle/preview.webp',
 '[]'::jsonb, 90, CURRENT_TIMESTAMP),
('pet-room-theme-great-wall', 'great-wall', '长城探险小屋', '沿着山岭上的长城走一走', 26,
 '/pet-assets/v1/room-themes/great-wall/background-landscape.webp', '/pet-assets/v1/room-themes/great-wall/background-tablet.webp', '/pet-assets/v1/room-themes/great-wall/background-phone.webp', '/pet-assets/v1/room-themes/great-wall/preview.webp',
 '[]'::jsonb, 100, CURRENT_TIMESTAMP),
('pet-room-theme-basketball-court', 'basketball-court', '篮球活力场', '在阳光球场练习投篮', 20,
 '/pet-assets/v1/room-themes/basketball-court/background-landscape.webp', '/pet-assets/v1/room-themes/basketball-court/background-tablet.webp', '/pet-assets/v1/room-themes/basketball-court/background-phone.webp', '/pet-assets/v1/room-themes/basketball-court/preview.webp',
 '[]'::jsonb, 110, CURRENT_TIMESTAMP),
('pet-room-theme-space-guardian', 'space-guardian', '星际守护基地', '穿上红银色的勇气，去星空训练场', 30,
 '/pet-assets/v1/room-themes/space-guardian/background-landscape.webp', '/pet-assets/v1/room-themes/space-guardian/background-tablet.webp', '/pet-assets/v1/room-themes/space-guardian/background-phone.webp', '/pet-assets/v1/room-themes/space-guardian/preview.webp',
 '[]'::jsonb, 120, CURRENT_TIMESTAMP);
