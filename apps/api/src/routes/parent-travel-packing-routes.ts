import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { checkFamilyTravelPacking } from "../domain/travel-packing-tips.js";
import { generateOpaqueToken, hashToken } from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { requireParent } from "../services/auth-service.js";

const idParams = z.object({ id: z.string().trim().min(1) });
const shareParams = z.object({ token: z.string().trim().min(32).max(160) });
const sharedIdParams = z.object({ token: z.string().trim().min(32).max(160), id: z.string().trim().min(1) });
const titleInput = z.object({ title: z.string().trim().min(1).max(24) });
const nameInput = z.object({ name: z.string().trim().min(1).max(20) });
const shareInput = z.object({ expiresInDays: z.number().int().min(1).max(30) });
const itemCreateInput = z.object({
  label: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(0).max(999).default(1),
  location: z.enum(["SUITCASE", "BACKPACK", "CAR"]).default("SUITCASE"),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
const itemUpdateInput = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  quantity: z.number().int().min(0).max(999).optional(),
  packed: z.boolean().optional(),
  location: z.enum(["SUITCASE", "BACKPACK", "CAR"]).optional(),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).refine((value) => (
  value.label !== undefined ||
  value.quantity !== undefined ||
  value.packed !== undefined ||
  value.location !== undefined ||
  value.expirationDate !== undefined
));

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

async function readListById(listId: string) {
  return prisma.travelPackingList.findUnique({ where: { id: listId }, include: listInclude });
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

async function categoryForList(listId: string, id: string) {
  const category = await prisma.travelPackingCategory.findFirst({ where: { id, listId } });
  if (!category) throw new HttpError(404, "PACKING_CATEGORY_NOT_FOUND", "没有找到这个分类");
  return category;
}

async function itemForList(listId: string, id: string) {
  const item = await prisma.travelPackingItem.findFirst({
    where: { id, category: { listId } },
  });
  if (!item) throw new HttpError(404, "PACKING_ITEM_NOT_FOUND", "没有找到这件物品");
  return item;
}

async function sharedListId(token: string) {
  const share = await prisma.travelPackingShare.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { listId: true, expiresAt: true },
  });
  if (!share) throw new HttpError(404, "PACKING_SHARE_NOT_FOUND", "这个分享链接不存在");
  if (share.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(410, "PACKING_SHARE_EXPIRED", "这个分享链接已经过期");
  }
  return share.listId;
}

function protectSharedRequest(request: FastifyRequest, token: string, mutation = true) {
  enforceRateLimit({
    key: `packing-share:${hashToken(token)}:${request.ip}:${mutation ? "write" : "read"}`,
    limit: mutation ? 240 : 600,
    windowMs: 60 * 60 * 1000,
    code: "PACKING_SHARE_RATE_LIMIT",
    message: "操作有点频繁，请稍后再试",
  });
}

async function renameList(listId: string, title: string) {
  await prisma.travelPackingList.update({ where: { id: listId }, data: { title } });
  return readListById(listId);
}

async function addCategory(listId: string, name: string) {
  const maximum = await prisma.travelPackingCategory.aggregate({ where: { listId }, _max: { sortOrder: true } });
  await prisma.travelPackingCategory.create({
    data: { listId, name, sortOrder: (maximum._max.sortOrder ?? -1) + 1 },
  });
  return readListById(listId);
}

async function renameCategory(listId: string, id: string, name: string) {
  await categoryForList(listId, id);
  await prisma.travelPackingCategory.update({ where: { id }, data: { name } });
  return readListById(listId);
}

async function deleteCategory(listId: string, id: string) {
  await categoryForList(listId, id);
  await prisma.travelPackingCategory.delete({ where: { id } });
  return readListById(listId);
}

async function addItem(listId: string, categoryId: string, input: z.infer<typeof itemCreateInput>) {
  await categoryForList(listId, categoryId);
  const maximum = await prisma.travelPackingItem.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
  await prisma.travelPackingItem.create({
    data: {
      categoryId,
      label: input.label,
      quantity: input.quantity,
      location: input.location,
      expirationDate: input.expirationDate ?? null,
      sortOrder: (maximum._max.sortOrder ?? -1) + 1,
    },
  });
  return readListById(listId);
}

async function updateItem(listId: string, id: string, input: z.infer<typeof itemUpdateInput>) {
  await itemForList(listId, id);
  await prisma.travelPackingItem.update({ where: { id }, data: input });
  return readListById(listId);
}

async function deleteItem(listId: string, id: string) {
  await itemForList(listId, id);
  await prisma.travelPackingItem.delete({ where: { id } });
  return readListById(listId);
}

async function resetList(listId: string) {
  await prisma.travelPackingItem.updateMany({ where: { category: { listId } }, data: { packed: false } });
  return readListById(listId);
}

async function packingTips(listId: string) {
  const list = await readListById(listId);
  if (!list) throw new HttpError(404, "PACKING_LIST_NOT_FOUND", "没有找到这份行李清单");
  return checkFamilyTravelPacking(list.categories.flatMap((category) => category.items));
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
    return { list: await renameList(list.id, title) };
  });

  app.post("/api/parent/travel-packing-list/shares", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { expiresInDays } = shareInput.parse(request.body);
    const list = await ensureList(familyId);
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.travelPackingShare.deleteMany({ where: { listId: list.id, expiresAt: { lte: new Date() } } }),
      prisma.travelPackingShare.create({ data: { listId: list.id, tokenHash: hashToken(token), expiresAt } }),
    ]);
    return { token, expiresAt };
  });

  app.get("/api/parent/travel-packing-list/tips", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const list = await ensureList(familyId);
    reply.header("Cache-Control", "no-store");
    return packingTips(list.id);
  });

  app.post("/api/parent/travel-packing-list/categories", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { name } = nameInput.parse(request.body);
    const list = await ensureList(familyId);
    return { list: await addCategory(list.id, name) };
  });

  app.patch("/api/parent/travel-packing-list/categories/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const { name } = nameInput.parse(request.body);
    const list = await ensureList(familyId);
    return { list: await renameCategory(list.id, id, name) };
  });

  app.delete("/api/parent/travel-packing-list/categories/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const list = await ensureList(familyId);
    return { list: await deleteCategory(list.id, id) };
  });

  app.post("/api/parent/travel-packing-list/categories/:id/items", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = itemCreateInput.parse(request.body);
    const list = await ensureList(familyId);
    return { list: await addItem(list.id, id, input) };
  });

  app.patch("/api/parent/travel-packing-list/items/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = itemUpdateInput.parse(request.body);
    const list = await ensureList(familyId);
    return { list: await updateItem(list.id, id, input) };
  });

  app.delete("/api/parent/travel-packing-list/items/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const list = await ensureList(familyId);
    return { list: await deleteItem(list.id, id) };
  });

  app.post("/api/parent/travel-packing-list/reset", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const list = await ensureList(familyId);
    return { list: await resetList(list.id) };
  });

  app.get("/api/public/travel-packing/:token", async (request, reply) => {
    const { token } = shareParams.parse(request.params);
    protectSharedRequest(request, token, false);
    reply.header("Cache-Control", "no-store");
    const listId = await sharedListId(token);
    return { list: await readListById(listId) };
  });

  app.get("/api/public/travel-packing/:token/tips", async (request, reply) => {
    const { token } = shareParams.parse(request.params);
    protectSharedRequest(request, token, false);
    reply.header("Cache-Control", "no-store");
    return packingTips(await sharedListId(token));
  });

  app.patch("/api/public/travel-packing/:token", async (request, reply) => {
    const { token } = shareParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    const { title } = titleInput.parse(request.body);
    return { list: await renameList(await sharedListId(token), title) };
  });

  app.post("/api/public/travel-packing/:token/categories", async (request, reply) => {
    const { token } = shareParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    const { name } = nameInput.parse(request.body);
    return { list: await addCategory(await sharedListId(token), name) };
  });

  app.patch("/api/public/travel-packing/:token/categories/:id", async (request, reply) => {
    const { token, id } = sharedIdParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    const { name } = nameInput.parse(request.body);
    return { list: await renameCategory(await sharedListId(token), id, name) };
  });

  app.delete("/api/public/travel-packing/:token/categories/:id", async (request, reply) => {
    const { token, id } = sharedIdParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    return { list: await deleteCategory(await sharedListId(token), id) };
  });

  app.post("/api/public/travel-packing/:token/categories/:id/items", async (request, reply) => {
    const { token, id } = sharedIdParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    const input = itemCreateInput.parse(request.body);
    return { list: await addItem(await sharedListId(token), id, input) };
  });

  app.patch("/api/public/travel-packing/:token/items/:id", async (request, reply) => {
    const { token, id } = sharedIdParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    const input = itemUpdateInput.parse(request.body);
    return { list: await updateItem(await sharedListId(token), id, input) };
  });

  app.delete("/api/public/travel-packing/:token/items/:id", async (request, reply) => {
    const { token, id } = sharedIdParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    return { list: await deleteItem(await sharedListId(token), id) };
  });

  app.post("/api/public/travel-packing/:token/reset", async (request, reply) => {
    const { token } = shareParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    return { list: await resetList(await sharedListId(token)) };
  });
}
