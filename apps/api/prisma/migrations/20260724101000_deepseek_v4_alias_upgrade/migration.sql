UPDATE "FamilyAiConfig"
SET "model" = 'deepseek-v4-flash'
WHERE "model" IN ('deepseek-chat', 'deepseek-reasoner');
