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
const todoCreateInput = z.object({ label: z.string().trim().min(1).max(80) });
const todoUpdateInput = z.object({ completed: z.boolean() });
const listCreateInput = z.object({
  title: z.string().trim().min(1).max(24),
  sourceId: z.string().trim().min(1).nullable().optional(),
});
const templateCreateInput = z.object({
  title: z.string().trim().min(1).max(24),
  sourceListId: z.string().trim().min(1),
});
const itemCreateInput = z.object({
  label: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(0).max(999).default(1),
  location: z.enum(["SUITCASE", "BACKPACK", "CAR"]).default("SUITCASE"),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
const itemUpdateInput = z.object({
  categoryId: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).max(30).optional(),
  quantity: z.number().int().min(0).max(999).optional(),
  packed: z.boolean().optional(),
  location: z.enum(["SUITCASE", "BACKPACK", "CAR"]).optional(),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).refine((value) => (
  value.categoryId !== undefined ||
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
  todos: {
    orderBy: [{ completed: "asc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
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
  return prisma.travelPackingList.findFirst({
    where: { familyId, kind: "LIST", isActive: true },
    include: listInclude,
  });
}

async function readListById(listId: string) {
  return prisma.travelPackingList.findUnique({ where: { id: listId }, include: listInclude });
}

async function ensureList(familyId: string) {
  const existing = await readList(familyId);
  if (existing) return existing;

  const inactive = await prisma.travelPackingList.findFirst({
    where: { familyId, kind: "LIST" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  if (inactive) {
    await prisma.travelPackingList.update({ where: { id: inactive.id }, data: { isActive: true } });
    const activated = await readListById(inactive.id);
    if (activated) return activated;
  }

  try {
    return await prisma.travelPackingList.create({
      data: {
        familyId,
        kind: "LIST",
        isActive: true,
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

async function packingWorkspace(familyId: string) {
  const entries = await prisma.travelPackingList.findMany({
    where: { familyId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { categories: true, todos: true } },
      categories: { select: { _count: { select: { items: true } } } },
    },
  });
  const summarize = (entry: typeof entries[number]) => ({
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    isActive: entry.isActive,
    sourceListId: entry.sourceListId,
    categoryCount: entry._count.categories,
    itemCount: entry.categories.reduce((sum, category) => sum + category._count.items, 0),
    todoCount: entry._count.todos,
    updatedAt: entry.updatedAt,
  });
  return {
    activeListId: entries.find((entry) => entry.kind === "LIST" && entry.isActive)?.id ?? null,
    lists: entries.filter((entry) => entry.kind === "LIST").map(summarize),
    templates: entries.filter((entry) => entry.kind === "TEMPLATE").map(summarize),
  };
}

async function ownedPackingEntry(familyId: string, id: string, kind?: "LIST" | "TEMPLATE") {
  const entry = await prisma.travelPackingList.findFirst({ where: { id, familyId, ...(kind ? { kind } : {}) } });
  if (!entry) throw new HttpError(404, "PACKING_ENTRY_NOT_FOUND", kind === "TEMPLATE" ? "没有找到这个模板" : "没有找到这份清单");
  return entry;
}

async function copyPackingContents(
  tx: Prisma.TransactionClient,
  sourceId: string,
  targetId: string,
) {
  const source = await tx.travelPackingList.findUnique({ where: { id: sourceId }, include: listInclude });
  if (!source) throw new HttpError(404, "PACKING_SOURCE_NOT_FOUND", "没有找到要继承的清单或模板");
  for (const category of source.categories) {
    await tx.travelPackingCategory.create({
      data: {
        listId: targetId,
        name: category.name,
        sortOrder: category.sortOrder,
        items: {
          create: category.items.map((item) => ({
            label: item.label,
            quantity: item.quantity,
            packed: false,
            location: item.location,
            expirationDate: item.expirationDate,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });
  }
  if (source.todos.length > 0) {
    await tx.travelPackingTodo.createMany({
      data: source.todos.map((todo) => ({
        listId: targetId,
        label: todo.label,
        completed: false,
        sortOrder: todo.sortOrder,
      })),
    });
  }
}

async function createPackingList(familyId: string, title: string, sourceId?: string | null) {
  if (sourceId) await ownedPackingEntry(familyId, sourceId);
  const id = await prisma.$transaction(async (tx) => {
    await tx.travelPackingList.updateMany({
      where: { familyId, kind: "LIST", isActive: true },
      data: { isActive: false },
    });
    const created = await tx.travelPackingList.create({
      data: { familyId, title, kind: "LIST", isActive: true, sourceListId: sourceId ?? null },
    });
    if (sourceId) await copyPackingContents(tx, sourceId, created.id);
    return created.id;
  });
  return readListById(id);
}

async function activatePackingList(familyId: string, id: string) {
  await ownedPackingEntry(familyId, id, "LIST");
  await prisma.$transaction(async (tx) => {
    await tx.travelPackingList.updateMany({ where: { familyId, kind: "LIST", isActive: true }, data: { isActive: false } });
    await tx.travelPackingList.update({ where: { id }, data: { isActive: true } });
  });
  return readListById(id);
}

async function createPackingTemplate(familyId: string, title: string, sourceListId: string) {
  await ownedPackingEntry(familyId, sourceListId);
  const count = await prisma.travelPackingList.count({ where: { familyId, kind: "TEMPLATE" } });
  if (count >= 30) throw new HttpError(409, "PACKING_TEMPLATE_LIMIT", "最多保存 30 个模板");
  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.travelPackingList.create({
      data: { familyId, title, kind: "TEMPLATE", isActive: false, sourceListId },
    });
    await copyPackingContents(tx, sourceListId, created.id);
    return created.id;
  });
  return prisma.travelPackingList.findUnique({ where: { id } });
}

async function deletePackingEntry(familyId: string, id: string, kind: "LIST" | "TEMPLATE") {
  const entry = await ownedPackingEntry(familyId, id, kind);
  if (kind === "LIST") {
    const alternatives = await prisma.travelPackingList.findMany({
      where: { familyId, kind: "LIST", id: { not: id } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 1,
    });
    if (alternatives.length === 0) throw new HttpError(409, "PACKING_LAST_LIST", "至少要保留一份出行清单");
    await prisma.$transaction(async (tx) => {
      await tx.travelPackingList.delete({ where: { id } });
      if (entry.isActive) await tx.travelPackingList.update({ where: { id: alternatives[0].id }, data: { isActive: true } });
    });
  } else {
    await prisma.travelPackingList.delete({ where: { id } });
  }
  return packingWorkspace(familyId);
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

async function todoForList(listId: string, id: string) {
  const todo = await prisma.travelPackingTodo.findFirst({ where: { id, listId } });
  if (!todo) throw new HttpError(404, "PACKING_TODO_NOT_FOUND", "没有找到这条待办");
  return todo;
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
  const current = await itemForList(listId, id);
  let sortOrder: number | undefined;
  if (input.categoryId && input.categoryId !== current.categoryId) {
    await categoryForList(listId, input.categoryId);
    const maximum = await prisma.travelPackingItem.aggregate({
      where: { categoryId: input.categoryId },
      _max: { sortOrder: true },
    });
    sortOrder = (maximum._max.sortOrder ?? -1) + 1;
  }
  await prisma.travelPackingItem.update({ where: { id }, data: { ...input, sortOrder } });
  return readListById(listId);
}

async function deleteItem(listId: string, id: string) {
  await itemForList(listId, id);
  await prisma.travelPackingItem.delete({ where: { id } });
  return readListById(listId);
}

async function resetList(listId: string) {
  await prisma.$transaction([
    prisma.travelPackingItem.updateMany({ where: { category: { listId } }, data: { packed: false } }),
    prisma.travelPackingTodo.updateMany({ where: { listId }, data: { completed: false } }),
  ]);
  return readListById(listId);
}

async function addTodo(listId: string, label: string) {
  const maximum = await prisma.travelPackingTodo.aggregate({ where: { listId }, _max: { sortOrder: true } });
  await prisma.travelPackingTodo.create({
    data: { listId, label, sortOrder: (maximum._max.sortOrder ?? -1) + 1 },
  });
  return readListById(listId);
}

async function updateTodo(listId: string, id: string, completed: boolean) {
  await todoForList(listId, id);
  await prisma.travelPackingTodo.update({ where: { id }, data: { completed } });
  return readListById(listId);
}

async function deleteTodo(listId: string, id: string) {
  await todoForList(listId, id);
  await prisma.travelPackingTodo.delete({ where: { id } });
  return readListById(listId);
}

async function packingTips(listId: string) {
  const list = await readListById(listId);
  if (!list) throw new HttpError(404, "PACKING_LIST_NOT_FOUND", "没有找到这份行李清单");
  return checkFamilyTravelPacking(list.categories.flatMap((category) => category.items));
}

export async function registerParentTravelPackingRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/parent/travel-packing-workspace", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    await ensureList(familyId);
    reply.header("Cache-Control", "no-store");
    return packingWorkspace(familyId);
  });

  app.post("/api/parent/travel-packing-lists", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { title, sourceId } = listCreateInput.parse(request.body);
    const count = await prisma.travelPackingList.count({ where: { familyId, kind: "LIST" } });
    if (count >= 30) throw new HttpError(409, "PACKING_LIST_LIMIT", "最多保留 30 份出行清单");
    const list = await createPackingList(familyId, title, sourceId);
    return { list, workspace: await packingWorkspace(familyId) };
  });

  app.post("/api/parent/travel-packing-lists/:id/activate", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const list = await activatePackingList(familyId, id);
    return { list, workspace: await packingWorkspace(familyId) };
  });

  app.delete("/api/parent/travel-packing-lists/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    return { workspace: await deletePackingEntry(familyId, id, "LIST"), list: await ensureList(familyId) };
  });

  app.post("/api/parent/travel-packing-templates", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { title, sourceListId } = templateCreateInput.parse(request.body);
    const template = await createPackingTemplate(familyId, title, sourceListId);
    return { template, workspace: await packingWorkspace(familyId) };
  });

  app.patch("/api/parent/travel-packing-templates/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const { title } = titleInput.parse(request.body);
    await ownedPackingEntry(familyId, id, "TEMPLATE");
    await prisma.travelPackingList.update({ where: { id }, data: { title } });
    return { workspace: await packingWorkspace(familyId) };
  });

  app.delete("/api/parent/travel-packing-templates/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    return { workspace: await deletePackingEntry(familyId, id, "TEMPLATE") };
  });

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

  app.post("/api/parent/travel-packing-list/todos", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { label } = todoCreateInput.parse(request.body);
    const list = await ensureList(familyId);
    return { list: await addTodo(list.id, label) };
  });

  app.patch("/api/parent/travel-packing-list/todos/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const { completed } = todoUpdateInput.parse(request.body);
    const list = await ensureList(familyId);
    return { list: await updateTodo(list.id, id, completed) };
  });

  app.delete("/api/parent/travel-packing-list/todos/:id", async (request, reply) => {
    const familyId = await familyIdFor(request, reply, config);
    const { id } = idParams.parse(request.params);
    const list = await ensureList(familyId);
    return { list: await deleteTodo(list.id, id) };
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

  app.post("/api/public/travel-packing/:token/todos", async (request, reply) => {
    const { token } = shareParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    const { label } = todoCreateInput.parse(request.body);
    return { list: await addTodo(await sharedListId(token), label) };
  });

  app.patch("/api/public/travel-packing/:token/todos/:id", async (request, reply) => {
    const { token, id } = sharedIdParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    const { completed } = todoUpdateInput.parse(request.body);
    return { list: await updateTodo(await sharedListId(token), id, completed) };
  });

  app.delete("/api/public/travel-packing/:token/todos/:id", async (request, reply) => {
    const { token, id } = sharedIdParams.parse(request.params);
    protectSharedRequest(request, token);
    reply.header("Cache-Control", "no-store");
    return { list: await deleteTodo(await sharedListId(token), id) };
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
