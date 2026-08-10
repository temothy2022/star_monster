UPDATE "ChildProfile"
SET "taskDashboardLayout" = jsonb_set(
  "taskDashboardLayout",
  '{widgets}',
  ("taskDashboardLayout"->'widgets') || '"NOTIFICATIONS"'::jsonb
)
WHERE jsonb_typeof("taskDashboardLayout"->'widgets') = 'array'
  AND NOT ("taskDashboardLayout"->'widgets' ? 'NOTIFICATIONS');
