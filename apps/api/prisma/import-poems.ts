import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const poemSchema = z.array(
  z.object({
    title: z.string().trim().min(1),
    dynasty: z.string().trim().min(1),
    author: z.string().trim().min(1),
    grade: z.number().int().min(1).max(6),
    semester: z.string().trim().min(1),
    content: z.string().trim().min(1),
  }),
);

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: pnpm poem:import -- /absolute/path/poems.json");
}

const poems = poemSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const prisma = new PrismaClient();

try {
  await prisma.$transaction(
    poems.map((poem, index) =>
      prisma.poem.upsert({
        where: {
          title_dynasty_author_grade_semester: {
            title: poem.title,
            dynasty: poem.dynasty,
            author: poem.author,
            grade: poem.grade,
            semester: poem.semester,
          },
        },
        create: {
          id: `poem-${String(index + 1).padStart(3, "0")}`,
          ...poem,
          sortOrder: index,
        },
        update: {
          ...poem,
          sortOrder: index,
          isEnabled: true,
        },
      }),
    ),
  );
  console.log(`Imported ${poems.length} poems.`);
} finally {
  await prisma.$disconnect();
}
