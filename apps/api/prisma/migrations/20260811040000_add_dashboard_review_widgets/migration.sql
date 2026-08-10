UPDATE "ChildProfile"
SET "taskDashboardLayout" = jsonb_set(
  "taskDashboardLayout",
  '{widgets}',
  (
    SELECT COALESCE(jsonb_agg(widget ORDER BY position), '[]'::jsonb)
    FROM jsonb_array_elements("taskDashboardLayout"->'widgets')
      WITH ORDINALITY AS entry(widget, position)
    WHERE widget <> '"QUICK_LINKS"'::jsonb
  )
  || CASE
    WHEN "taskDashboardLayout"->'widgets' ? 'HANZI_REVIEW' THEN '[]'::jsonb
    ELSE '["HANZI_REVIEW"]'::jsonb
  END
  || CASE
    WHEN "taskDashboardLayout"->'widgets' ? 'POEM_REVIEW' THEN '[]'::jsonb
    ELSE '["POEM_REVIEW"]'::jsonb
  END
)
WHERE jsonb_typeof("taskDashboardLayout"->'widgets') = 'array';
