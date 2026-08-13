import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireParent } from "../services/auth-service.js";

const idParams = z.object({ id: z.string().trim().min(1) });
const categoryItemParams = z.object({ id: z.string().trim().min(1) });
const titleInput = z.object({ title: z.string().trim().min(1).max(24) });
const nameInput = z.object({ name: z.string().trim().min(1).max(20) });
const itemCreateInput = z.object({
  label: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(0).max(999).default(1),
});
const itemUpdateInput = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  quantity: z.number().int().min(0).max(999).optional(),
  packed: z.boolean().optional(),
}).refine((value) => value.label !== undefined || value.quantity !== undefined || value.packed !== undefined);

const DEFAULT_CATEGORIES = [
  { name: "证件与出行", items: ["身份证件", "车票或登机信息", "钱包与银行卡"] },
  { name: "衣物", items: ["换洗衣物", "睡衣", "备用鞋袜"] },
  { name: "孩子用品", items: ["孩子水杯", "纸巾和湿巾", "安抚玩具或绘本"] },
  { name: "药品", items: ["退烧药", "创可贴", "常用药"] },
  { name: "洗护用品", items: ["牙刷与牙膏", "防晒", "驱蚊用品"] },
  { name: "电子设备", items: ["手机充电器", "充电宝"] },
] as const;

const listInclude = {
  categories: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
      },
    },
  },
};

async function familyIdFor(request: FastifyRequest, reply: FastifyReply, config: AppConfig) {
  const { user } = await requireParent(request, reply, config);
  if (!user.familyId) throw new HttpError(403, "PARENT_FAMILY_REQUIRED", "当前账号没有绑定家庭");
  return user.familyId;
}

async function readList(familyId: string) {
  return prisma.travelPackingList.findUnique({ where: { familyId }, include: listInclude });
}

async function ensureList(familyId: string) {
  const existing = await readList(familyId);
  if (existing) return existing;

  try {
    return await prisma.travelPackingList.create({
      data: {
        familyId,
        categories: {
          create: DEFAULT_CATEGORIES.map((category, categoryIndex) => ({
            name: category.name,
            sortOrder: categoryIndex,
            items: {
              create: category.items.map((label, itemIndex) => ({ label, sortOrder: itemIndex })),
            },
          })),
        },
      },
      include: listInclude,
    });
  } catch (reason) {
    if (reason instanceof Prisma.PrismaClientKnownRequestError && reason.code === "P2002") {
      const concurrent = await readList(familyId);
      if (concurrent) return concurrent;
    }
    throw reason;
  }
}

async function ownedCategory(familyId: string, id: string) {
  const category = await prisma.travelPackingCategory.findFirst({
    where: { id, list: { familyId } },
  });
  if (!category) throw new HttpError(404, "PACKING_CATEGORY_NOT_FOUND", "没有找到这个分类");
  return category;
}

async function ownedItem(familyId: string, id: string) {
  const item = await prisma.travelPackingItem.findFirst({
    where: { id, category: { list: { familyId } } },
  });
  if (!item) throw new HttpError(404, "PACKING_ITEM_NOT_FOUND", "没有找到这件物品");
  return item;
}

export async function registerParentTravelPackingRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/parent/travel-packing-list", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    return { list: await ensureList(familyId) };
  });

  app.patch("/api/parent/travel-packing-list", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { title } = titleInput.parse(request.body);
    const list = await ensureList(familyId);
    await prisma.travelPackingList.update({ where: { id: list.id }, data: { title } });
    return { list: await readList(familyId) };
  });

  app.post("/api/parent/travel-packing-list/categories", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { name } = nameInput.parse(request.body);
    const list = await ensureList(familyId);
    const maximum = await prisma.travelPackingCategory.aggregate({
      where: { listId: list.id },
      _max: { sortOrder: true },
    });
    await prisma.travelPackingCategory.create({
      data: { listId: list.id, name, sortOrder: (maximum._max.sortOrder ?? -1) + 1 },
    });
    return { list: await readList(familyId) };
  });

  app.patch("/api/parent/travel-packing-list/categories/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const { name } = nameInput.parse(request.body);
    await ownedCategory(familyId, id);
    await prisma.travelPackingCategory.update({ where: { id }, data: { name } });
    return { list: await readList(familyId) };
  });

  app.delete("/api/parent/travel-packing-list/categories/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    await ownedCategory(familyId, id);
    await prisma.travelPackingCategory.delete({ where: { id } });
    return { list: await readList(familyId) };
  });

  app.post("/api/parent/travel-packing-list/categories/:id/items", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = categoryItemParams.parse(request.params);
    const { label, quantity } = itemCreateInput.parse(request.body);
    await ownedCategory(familyId, id);
    const maximum = await prisma.travelPackingItem.aggregate({
      where: { categoryId: id },
      _max: { sortOrder: true },
    });
    await prisma.travelPackingItem.create({
      data: { categoryId: id, label, quantity, sortOrder: (maximum._max.sortOrder ?? -1) + 1 },
    });
    return { list: await readList(familyId) };
  });

  app.patch("/api/parent/travel-packing-list/items/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = itemUpdateInput.parse(request.body);
    await ownedItem(familyId, id);
    await prisma.travelPackingItem.update({ where: { id }, data: input });
    return { list: await readList(familyId) };
  });

  app.delete("/api/parent/travel-packing-list/items/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    await ownedItem(familyId, id);
    await prisma.travelPackingItem.delete({ where: { id } });
    return { list: await readList(familyId) };
  });

  app.post("/api/parent/travel-packing-list/reset", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const list = await ensureList(familyId);
    await prisma.travelPackingItem.updateMany({
      where: { category: { listId: list.id } },
      data: { packed: false },
    });
    return { list: await readList(familyId) };
  });
}
