-- Track each child's school learning plan without changing shared resources
-- or existing learning/review progress.
CREATE TABLE "HanziSchoolTarget" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HanziSchoolTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoemSchoolTarget" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "poemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoemSchoolTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HanziSchoolTarget_childId_characterId_key"
    ON "HanziSchoolTarget"("childId", "characterId");
CREATE INDEX "HanziSchoolTarget_childId_sortOrder_createdAt_idx"
    ON "HanziSchoolTarget"("childId", "sortOrder", "createdAt");
CREATE UNIQUE INDEX "PoemSchoolTarget_childId_poemId_key"
    ON "PoemSchoolTarget"("childId", "poemId");
CREATE INDEX "PoemSchoolTarget_childId_sortOrder_createdAt_idx"
    ON "PoemSchoolTarget"("childId", "sortOrder", "createdAt");

ALTER TABLE "HanziSchoolTarget"
    ADD CONSTRAINT "HanziSchoolTarget_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HanziSchoolTarget"
    ADD CONSTRAINT "HanziSchoolTarget_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "HanziCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoemSchoolTarget"
    ADD CONSTRAINT "PoemSchoolTarget_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoemSchoolTarget"
    ADD CONSTRAINT "PoemSchoolTarget_poemId_fkey"
    FOREIGN KEY ("poemId") REFERENCES "Poem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
