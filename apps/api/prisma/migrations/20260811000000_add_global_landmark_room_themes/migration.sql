INSERT INTO "PetRoomTheme" (
  "id", "key", "name", "description", "priceStars",
  "backgroundLandscapeUrl", "backgroundTabletUrl", "backgroundPhoneUrl", "previewUrl",
  "ambience", "sortOrder", "mascotMotion", "updatedAt"
) VALUES
('pet-room-theme-giza-pyramids', 'giza-pyramids', '金字塔沙漠小屋', '在金色沙漠里看看古老的金字塔', 28,
 '/pet-assets/v1/room-themes/giza-pyramids/background-landscape.webp', '/pet-assets/v1/room-themes/giza-pyramids/background-tablet.webp', '/pet-assets/v1/room-themes/giza-pyramids/background-phone.webp', '/pet-assets/v1/room-themes/giza-pyramids/preview.webp',
 '[]'::jsonb, 130, 'ADVENTURE_MARCH', CURRENT_TIMESTAMP),
('pet-room-theme-eiffel-tower', 'eiffel-tower', '巴黎铁塔花园小屋', '在花园窗边远望埃菲尔铁塔', 29,
 '/pet-assets/v1/room-themes/eiffel-tower/background-landscape.webp', '/pet-assets/v1/room-themes/eiffel-tower/background-tablet.webp', '/pet-assets/v1/room-themes/eiffel-tower/background-phone.webp', '/pet-assets/v1/room-themes/eiffel-tower/preview.webp',
 '[]'::jsonb, 140, 'PETAL_SWAY', CURRENT_TIMESTAMP),
('pet-room-theme-sydney-opera-house', 'sydney-opera-house', '悉尼海港小屋', '在阳光海港边看看悉尼歌剧院', 30,
 '/pet-assets/v1/room-themes/sydney-opera-house/background-landscape.webp', '/pet-assets/v1/room-themes/sydney-opera-house/background-tablet.webp', '/pet-assets/v1/room-themes/sydney-opera-house/background-phone.webp', '/pet-assets/v1/room-themes/sydney-opera-house/preview.webp',
 '[]'::jsonb, 150, 'IDLE', CURRENT_TIMESTAMP),
('pet-room-theme-machu-picchu', 'machu-picchu', '马丘比丘山间小屋', '在云雾山谷里探索马丘比丘', 31,
 '/pet-assets/v1/room-themes/machu-picchu/background-landscape.webp', '/pet-assets/v1/room-themes/machu-picchu/background-tablet.webp', '/pet-assets/v1/room-themes/machu-picchu/background-phone.webp', '/pet-assets/v1/room-themes/machu-picchu/preview.webp',
 '[]'::jsonb, 160, 'ADVENTURE_MARCH', CURRENT_TIMESTAMP),
('pet-room-theme-taj-mahal', 'taj-mahal', '泰姬陵花园小屋', '在柔和花园里远望泰姬陵', 32,
 '/pet-assets/v1/room-themes/taj-mahal/background-landscape.webp', '/pet-assets/v1/room-themes/taj-mahal/background-tablet.webp', '/pet-assets/v1/room-themes/taj-mahal/background-phone.webp', '/pet-assets/v1/room-themes/taj-mahal/preview.webp',
 '[]'::jsonb, 170, 'PETAL_SWAY', CURRENT_TIMESTAMP),
('pet-room-theme-tower-bridge', 'tower-bridge', '伦敦塔桥小屋', '在河畔窗前看看伦敦塔桥', 33,
 '/pet-assets/v1/room-themes/tower-bridge/background-landscape.webp', '/pet-assets/v1/room-themes/tower-bridge/background-tablet.webp', '/pet-assets/v1/room-themes/tower-bridge/background-phone.webp', '/pet-assets/v1/room-themes/tower-bridge/preview.webp',
 '[]'::jsonb, 180, 'IDLE', CURRENT_TIMESTAMP);
