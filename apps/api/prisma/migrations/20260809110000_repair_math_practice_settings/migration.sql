-- The original math-practice migration is recorded as applied in some
-- production databases even though this settings table is missing. Keep this
-- repair idempotent so it is safe for databases that already have the table.
CREATE TABLE IF NOT EXISTS "MathPracticeSettings" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "totalQuestions" INTEGER NOT NULL DEFAULT 10,
    "typeCounts" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MathPracticeSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MathPracticeSettings_childId_key"
  ON "MathPracticeSettings"("childId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MathPracticeSettings_childId_fkey'
      AND conrelid = '"MathPracticeSettings"'::regclass
  ) THEN
    ALTER TABLE "MathPracticeSettings"
      ADD CONSTRAINT "MathPracticeSettings_childId_fkey"
      FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
