-- Use the approved child dashboard arrangement for all existing profiles.
-- New profiles receive the same layout through DEFAULT_TASK_DASHBOARD_LAYOUT.
UPDATE "ChildProfile"
SET "taskDashboardLayout" = '{
  "version": 1,
  "widgets": ["CLOCK", "BALANCE", "POEM_REVIEW", "CATEGORY_PROGRESS", "COUNTDOWN_TIMER", "NOTIFICATIONS", "HANZI_REVIEW", "LEADERBOARD", "MASCOT", "POSTCARDS", "STREAK"],
  "columns": {"CLOCK": 4, "BALANCE": 4, "POEM_REVIEW": 4, "CATEGORY_PROGRESS": 8, "COUNTDOWN_TIMER": 8, "NOTIFICATIONS": 8, "HANZI_REVIEW": 0, "LEADERBOARD": 0, "MASCOT": 0, "POSTCARDS": 0, "STREAK": 8},
  "rows": {"CLOCK": 15, "MASCOT": 13, "STREAK": 13, "BALANCE": 13, "POEM_REVIEW": 13, "HANZI_REVIEW": 13, "NOTIFICATIONS": 10, "CATEGORY_PROGRESS": 18},
  "clockEnabled": true,
  "categoryProgressEnabled": true
}'::jsonb;
