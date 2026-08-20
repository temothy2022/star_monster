import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { buildAiModelUsageDashboard } from "../domain/ai-model-usage.js";
import { buildPerformanceDashboard } from "../domain/performance-metrics.js";
import { hashSecret } from "../lib/crypto.js";
import { encryptSecret } from "../lib/secret-encryption.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  createChildAccount,
  createFamilyWithParent,
  regenerateChildLoginCode,
  revealChildLoginCode,
} from "../services/account-service.js";
import { requireAdmin } from "../services/auth-service.js";
import { writeAudit } from "../services/audit-service.js";
import { addBusinessDays, businessDateAt } from "../lib/time.js";
import { callDeepSeekJson, listDeepSeekModels } from "../services/deepseek-service.js";
import {
  challengePromptPoolSummary,
  ensureChallengePromptPool,
} from "../services/challenge-conversation-service.js";
import {
  getPlatformFeatureSettings,
  updatePlatformFeatureSettings,
} from "../services/platform-feature-service.js";
import { systemAiCredentials } from "../services/system-ai-service.js";
import {
  createDatabaseBackup,
  getSystemOperationsDashboard,
  runSystemOperation,
  SYSTEM_OPERATION_DEFINITIONS,
} from "../services/system-operations-service.js";

const familySchema = z.object({
  name: z.string().trim().min(1).max(80),
  parent: z.object({
    username: z.string().trim().min(2).max(80),
    displayName: z.string().trim().min(1).max(80),
    password: z.string().min(8).max(256),
  }),
  children: z
    .array(z.object({ nickname: z.string().trim().min(2).max(9).optional() }))
    .min(1)
    .max(20),
});

const childSchema = z.object({
  nickname: z.string().trim().min(2).max(9).optional(),
});
const childUpdateSchema = z.object({
  nickname: z.string().trim().min(2).max(9),
});

const parentSchema = z.object({
  username: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(256),
});

const accountStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

const familyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

const userUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(256),
});

const idParams = z.object({ id: z.string().min(1) });
const performanceQuery = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  familyId: z.string().trim().min(1).optional(),
  childId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});
const aiUsageQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
const adminListQuery = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
const aiConfigSchema = z.object({
  apiKey: z.string().trim().min(10).max(512).optional(),
  model: z.string().trim().min(1).max(100).regex(/^deepseek-[a-z0-9.-]+$/i),
  enabled: z.boolean(),
});
const aiConnectionSchema = z.object({ ok: z.literal(true), message: z.string() });
const platformFeatureSchema = z.object({
  realChildCompetitionEnabled: z.boolean(),
});
const systemOperationSchema = z.object({
  operation: z.enum(Object.keys(SYSTEM_OPERATION_DEFINITIONS) as [keyof typeof SYSTEM_OPERATION_DEFINITIONS, ...(keyof typeof SYSTEM_OPERATION_DEFINITIONS)[]]),
  confirmation: z.string().trim().min(1).max(80),
});
const databaseBackupSchema = z.object({
  confirmation: z.literal("下载数据库备份"),
});

export async function registerSuperAdminRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.get("/api/admin/system/dashboard", async (request, reply) => {
    await requireAdmin(request, reply, config);
    return getSystemOperationsDashboard(config);
  });

  app.post("/api/admin/system/operations", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const input = systemOperationSchema.parse(request.body);
    try {
      return await runSystemOperation({
        ...input,
        actorId: user.id,
        ipAddress: request.ip,
        config,
        logger: request.log,
      });
    } catch (error) {
      throw new HttpError(
        error instanceof Error && error.message.includes("正在执行") ? 409 : 400,
        "SYSTEM_OPERATION_FAILED",
        error instanceof Error ? error.message : "系统操作执行失败",
      );
    }
  });

  app.post("/api/admin/system/database-backup", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    databaseBackupSchema.parse(request.body);
    try {
      const backup = await createDatabaseBackup({
        databaseUrl: config.DATABASE_URL,
        actorId: user.id,
        ipAddress: request.ip,
      });
      return reply
        .header("Content-Type", "application/octet-stream")
        .header("Content-Disposition", `attachment; filename="${backup.fileName}"`)
        .header("Cache-Control", "no-store")
        .send(backup.data);
    } catch (error) {
      throw new HttpError(
        500,
        "DATABASE_BACKUP_FAILED",
        error instanceof Error ? error.message : "数据库备份失败",
      );
    }
  });

  app.get("/api/admin/platform-features", async (request, reply) => {
    await requireAdmin(request, reply, config);
    return { settings: await getPlatformFeatureSettings() };
  });

  app.put("/api/admin/platform-features", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const input = platformFeatureSchema.parse(request.body);
    const settings = await prisma.$transaction(async (tx) => {
      const updated = await updatePlatformFeatureSettings(tx, {
        ...input,
        updatedByUserId: user.id,
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        action: "PLATFORM_FEATURE_UPDATE",
        resourceType: "PlatformFeatureConfig",
        resourceId: "default",
        metadata: input,
        ipAddress: request.ip,
      });
      return updated;
    });
    return { settings };
  });

  app.get("/api/admin/ai/config", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const stored = await prisma.systemAiConfig.findUnique({
      where: { id: "default" },
      select: { provider: true, model: true, apiKeyLastFour: true, enabled: true, updatedAt: true },
    });
    return {
      config: stored
        ? { ...stored, configured: true }
        : {
            provider: "DEEPSEEK",
            model: "deepseek-v4-flash",
            apiKeyLastFour: null,
            enabled: false,
            updatedAt: null,
            configured: false,
          },
    };
  });

  app.put("/api/admin/ai/config", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const input = aiConfigSchema.parse(request.body);
    const existing = await prisma.systemAiConfig.findUnique({ where: { id: "default" } });
    if (!existing && !input.apiKey) {
      throw new HttpError(400, "AI_KEY_REQUIRED", "首次配置必须填写 DeepSeek 密钥");
    }
    const encrypted = input.apiKey
      ? encryptSecret(input.apiKey, config.AI_CONFIG_ENCRYPTION_KEY)
      : null;
    const storedSecret = encrypted
      ? {
          encryptedApiKey: encrypted.ciphertext,
          encryptionIv: encrypted.iv,
          encryptionTag: encrypted.tag,
          apiKeyLastFour: input.apiKey!.slice(-4),
        }
      : existing
        ? {
            encryptedApiKey: existing.encryptedApiKey,
            encryptionIv: existing.encryptionIv,
            encryptionTag: existing.encryptionTag,
            apiKeyLastFour: existing.apiKeyLastFour,
          }
        : null;
    if (!storedSecret) {
      throw new HttpError(400, "AI_KEY_REQUIRED", "首次配置必须填写 DeepSeek 密钥");
    }
    const stored = await prisma.$transaction(async (tx) => {
      const saved = await tx.systemAiConfig.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          model: input.model,
          enabled: input.enabled,
          ...storedSecret,
          updatedByUserId: user.id,
        },
        update: {
          model: input.model,
          enabled: input.enabled,
          updatedByUserId: user.id,
          ...(encrypted
            ? {
                encryptedApiKey: encrypted.ciphertext,
                encryptionIv: encrypted.iv,
                encryptionTag: encrypted.tag,
                apiKeyLastFour: input.apiKey!.slice(-4),
              }
            : {}),
        },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        action: "AI_CONFIG_UPDATE",
        resourceType: "SystemAiConfig",
        resourceId: saved.id,
        metadata: { model: input.model, enabled: input.enabled, keyReplaced: Boolean(input.apiKey) },
        ipAddress: request.ip,
      });
      return saved;
    });
    return { config: { provider: stored.provider, model: stored.model, apiKeyLastFour: stored.apiKeyLastFour, enabled: stored.enabled, updatedAt: stored.updatedAt, configured: true } };
  });

  app.get("/api/admin/ai/models", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const credentials = await systemAiCredentials(config, false);
    return { models: await listDeepSeekModels({ apiKey: credentials.apiKey, config }) };
  });

  app.post("/api/admin/ai/config/test", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const credentials = await systemAiCredentials(config);
    const result = await callDeepSeekJson({
      apiKey: credentials.apiKey,
      model: credentials.model,
      config,
      systemPrompt: "你是连接测试助手，只输出 JSON。",
      userPayload: { instruction: "返回连接成功" },
      outputSchema: aiConnectionSchema,
      maxTokens: 80,
    });
    return { ...result.data, model: result.model };
  });

  app.get("/api/admin/ai/challenge-prompts", async (request, reply) => {
    await requireAdmin(request, reply, config);
    return { pool: await challengePromptPoolSummary() };
  });

  app.post("/api/admin/ai/challenge-prompts/generate", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const generatedCount = await ensureChallengePromptPool(config, true);
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        action: "CHALLENGE_PROMPT_POOL_GENERATE",
        resourceType: "ChallengePromptTemplate",
        resourceId: "active-pool",
        metadata: { generatedCount },
        ipAddress: request.ip,
      });
    });
    return { pool: await challengePromptPoolSummary() };
  });

  app.get("/api/admin/families", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const query = adminListQuery.parse(request.query);
    const where: Prisma.FamilyWhereInput = query.q ? {
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { users: { some: { OR: [
          { username: { contains: query.q, mode: "insensitive" } },
          { displayName: { contains: query.q, mode: "insensitive" } },
        ] } } },
        { children: { some: { nickname: { contains: query.q, mode: "insensitive" } } } },
      ],
    } : {};
    const [families, total] = await Promise.all([prisma.family.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          users: {
            where: { role: "PARENT" },
            select: {
              id: true,
              username: true,
              displayName: true,
              status: true,
              lastLoginAt: true,
              sessions: {
                orderBy: { lastSeenAt: "desc" },
                take: 1,
                select: { lastSeenAt: true },
              },
            },
          },
          children: {
            select: {
              id: true,
              nickname: true,
              petType: true,
              status: true,
              loginCodeLastFour: true,
              lastLoginAt: true,
              sessions: {
                orderBy: { lastSeenAt: "desc" },
                take: 1,
                select: { lastSeenAt: true },
              },
            },
          },
        },
      }), prisma.family.count({ where })]);

    return {
      families: families.map((family) => ({
        ...family,
        users: family.users.map(({ sessions, lastLoginAt, ...user }) => ({
          ...user,
          lastActiveAt: sessions[0]?.lastSeenAt ?? lastLoginAt,
        })),
        children: family.children.map(({ sessions, lastLoginAt, ...child }) => ({
          ...child,
          loginCode: null,
          lastActiveAt: sessions[0]?.lastSeenAt ?? lastLoginAt,
        })),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  app.get("/api/admin/family-options", async (request, reply) => {
    await requireAdmin(request, reply, config);
    return { families: await prisma.family.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }) };
  });

  app.get("/api/admin/children", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const query = adminListQuery.parse(request.query);
    const where: Prisma.ChildProfileWhereInput = query.q ? {
      OR: [
        { nickname: { contains: query.q, mode: "insensitive" } },
        { loginCodeLastFour: { contains: query.q } },
        { family: { name: { contains: query.q, mode: "insensitive" } } },
      ],
    } : {};
    const [children, total] = await Promise.all([
      prisma.childProfile.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          family: { select: { id: true, name: true } },
          sessions: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } },
        },
      }),
      prisma.childProfile.count({ where }),
    ]);
    return {
      children: children.map(({ sessions, family, ...child }) => ({
        family,
        child: {
          ...child,
          loginCode: null,
          lastActiveAt: sessions[0]?.lastSeenAt ?? child.lastLoginAt,
        },
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  app.get("/api/admin/families/:id/overview", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const { id: familyId } = idParams.parse(request.params);
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        children: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            nickname: true,
            petType: true,
            starBalance: true,
            lifetimeStarsEarned: true,
            dailyStarGoal: true,
            lastLoginAt: true,
            sessions: {
              orderBy: { lastSeenAt: "desc" },
              take: 1,
              select: { lastSeenAt: true },
            },
          },
        },
      },
    });
    if (!family) throw new HttpError(404, "FAMILY_NOT_FOUND", "没有找到家庭");

    const today = businessDateAt(new Date(), config.APP_TIME_ZONE);
    const from = addBusinessDays(today, -29);
    const children = await Promise.all(family.children.map(async (child) => {
      const [templates, dailyTasks, attempts, ledger, wishes, redemptions] = await Promise.all([
        prisma.taskTemplate.findMany({
          where: { childId: child.id, archivedAt: null },
          orderBy: [{ isEnabled: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            category: true,
            experienceKind: true,
            baseStars: true,
            scheduleKind: true,
            weekdays: true,
            oneTimeDate: true,
            isEnabled: true,
            repeatableDaily: true,
          },
        }),
        prisma.dailyTask.findMany({
          where: { childId: child.id, taskDate: { gte: from, lte: today } },
          select: { taskDate: true, status: true },
        }),
        prisma.taskAttempt.findMany({
          where: { childId: child.id, startedAt: { gte: from } },
          select: { status: true },
        }),
        prisma.starLedger.findMany({
          where: { childId: child.id, createdAt: { gte: from } },
          orderBy: { createdAt: "desc" },
          take: 120,
          select: { id: true, type: true, amount: true, balanceAfter: true, reason: true, createdAt: true },
        }),
        prisma.wishReward.findMany({
          where: { childId: child.id, archivedAt: null },
          orderBy: [{ isEnabled: "desc" }, { sortOrder: "asc" }],
          select: {
            id: true,
            title: true,
            category: true,
            costStars: true,
            redemptionType: true,
            recurrenceKind: true,
            stockRemaining: true,
            isEnabled: true,
            _count: { select: { redemptions: true } },
          },
        }),
        prisma.wishRedemption.findMany({
          where: { childId: child.id, requestedAt: { gte: from } },
          orderBy: { requestedAt: "desc" },
          take: 120,
          select: {
            id: true,
            titleSnapshot: true,
            categorySnapshot: true,
            costStarsSnapshot: true,
            status: true,
            requestedAt: true,
            completedAt: true,
            cancelledAt: true,
          },
        }),
      ]);
      const todayTasks = dailyTasks.filter((task) => task.taskDate.getTime() === today.getTime());
      const completedDailyTasks = dailyTasks.filter((task) => task.status === "COMPLETED").length;
      const completedToday = todayTasks.filter((task) => task.status === "COMPLETED").length;
      return {
        id: child.id,
        nickname: child.nickname,
        petType: child.petType,
        starBalance: child.starBalance,
        lifetimeStarsEarned: child.lifetimeStarsEarned,
        dailyStarGoal: child.dailyStarGoal,
        lastActiveAt: child.sessions[0]?.lastSeenAt ?? child.lastLoginAt,
        taskStats: {
          periodTotal: dailyTasks.length,
          periodCompleted: completedDailyTasks,
          completionRate: dailyTasks.length ? Math.round((completedDailyTasks / dailyTasks.length) * 100) : null,
          todayTotal: todayTasks.length,
          todayCompleted: completedToday,
          attemptsCompleted: attempts.filter((attempt) => attempt.status === "COMPLETED").length,
          attemptsAbandoned: attempts.filter((attempt) => attempt.status === "ABANDONED").length,
        },
        starStats: {
          periodEarned: ledger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0),
          periodSpent: Math.abs(ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)),
        },
        taskTemplates: templates,
        wishes: wishes.map(({ _count, ...wish }) => ({ ...wish, redemptionCount: _count.redemptions })),
        redemptions,
        ledger,
      };
    }));
    return { family: { id: family.id, name: family.name, status: family.status, createdAt: family.createdAt }, from, to: today, children };
  });

  app.post("/api/admin/families", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const input = familySchema.parse(request.body);
    const result = await prisma.$transaction(
      async (tx) => {
        const created = await createFamilyWithParent(tx, {
          familyName: input.name,
          parentUsername: input.parent.username,
          parentDisplayName: input.parent.displayName,
          parentPassword: input.parent.password,
          childNicknames: input.children.map((child) => child.nickname),
          loginCodePepper: config.LOGIN_CODE_PEPPER,
          loginCodeEncryptionKey: config.AI_CONFIG_ENCRYPTION_KEY,
        });
        await writeAudit(tx, {
          actorType: "USER",
          actorId: user.id,
          familyId: created.family.id,
          action: "FAMILY_CREATE",
          resourceType: "Family",
          resourceId: created.family.id,
          ipAddress: request.ip,
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    reply.status(201);
    return result;
  });

  app.post("/api/admin/families/:id/children", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id: familyId } = idParams.parse(request.params);
    const input = childSchema.parse(request.body);
    const family = await prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new HttpError(404, "FAMILY_NOT_FOUND", "没有找到家庭");

    const result = await prisma.$transaction(async (tx) => {
      const child = await createChildAccount(tx, {
        familyId,
        nickname: input.nickname,
        loginCodePepper: config.LOGIN_CODE_PEPPER,
        loginCodeEncryptionKey: config.AI_CONFIG_ENCRYPTION_KEY,
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId,
        action: "CHILD_CREATE",
        resourceType: "ChildProfile",
        resourceId: child.childId,
        ipAddress: request.ip,
      });
      return child;
    });
    reply.status(201);
    return result;
  });

  app.post("/api/admin/families/:id/parents", async (request, reply) => {
    const { user: actor } = await requireAdmin(request, reply, config);
    const { id: familyId } = idParams.parse(request.params);
    const input = parentSchema.parse(request.body);
    const family = await prisma.family.findUnique({ where: { id: familyId } });
    if (!family) throw new HttpError(404, "FAMILY_NOT_FOUND", "没有找到家庭");
    const username = input.username.toLowerCase();
    if (await prisma.user.findUnique({ where: { username } })) {
      throw new HttpError(409, "USERNAME_TAKEN", "用户名已经存在");
    }
    const parent = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          familyId,
          username,
          displayName: input.displayName,
          passwordHash: await hashSecret(input.password),
          role: "PARENT",
        },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: actor.id,
        familyId,
        action: "PARENT_CREATE",
        resourceType: "User",
        resourceId: created.id,
        ipAddress: request.ip,
      });
      return created;
    });
    reply.status(201);
    return { parent };
  });

  app.patch("/api/admin/families/:id", async (request, reply) => {
    const { user: actor } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = familyUpdateSchema.parse(request.body);
    const family = await prisma.$transaction(async (tx) => {
      const updated = await tx.family.update({
        where: { id },
        data: input,
      });
      if (input.status === "DISABLED") {
        await tx.userSession.deleteMany({
          where: { user: { familyId: id } },
        });
        await tx.childSession.deleteMany({
          where: { child: { familyId: id } },
        });
      }
      await writeAudit(tx, {
        actorType: "USER",
        actorId: actor.id,
        familyId: id,
        action: "FAMILY_UPDATE",
        resourceType: "Family",
        resourceId: id,
        metadata: input,
        ipAddress: request.ip,
      });
      return updated;
    });
    return { family };
  });

  app.patch("/api/admin/users/:id", async (request, reply) => {
    const { user: actor } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = userUpdateSchema.parse(request.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, "USER_NOT_FOUND", "没有找到账号");
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: input });
      if (input.status === "DISABLED") {
        await tx.userSession.deleteMany({ where: { userId: id } });
      }
      await writeAudit(tx, {
        actorType: "USER",
        actorId: actor.id,
        familyId: target.familyId ?? undefined,
        action: "USER_UPDATE",
        resourceType: "User",
        resourceId: id,
        metadata: input,
        ipAddress: request.ip,
      });
      return updated;
    });
    return { user };
  });

  app.post("/api/admin/children/:id/regenerate-code", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const child = await prisma.childProfile.findUnique({ where: { id } });
    if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");

    const loginCode = await prisma.$transaction(async (tx) => {
      const code = await regenerateChildLoginCode(
        tx,
        id,
        config.LOGIN_CODE_PEPPER,
        config.AI_CONFIG_ENCRYPTION_KEY,
      );
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: child.familyId,
        action: "CHILD_LOGIN_CODE_REGENERATE",
        resourceType: "ChildProfile",
        resourceId: id,
        ipAddress: request.ip,
      });
      return code;
    });
    return { childId: id, loginCode };
  });

  app.get("/api/admin/children/:id/login-code", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const child = await prisma.childProfile.findUnique({ where: { id } });
    if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
    return {
      childId: child.id,
      loginCode: revealChildLoginCode(child, config.AI_CONFIG_ENCRYPTION_KEY),
      loginCodeLastFour: child.loginCodeLastFour,
      recoverable: Boolean(child.loginCodeCiphertext),
    };
  });

  app.patch("/api/admin/children/:id/status", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = accountStatusSchema.parse(request.body);
    const child = await prisma.$transaction(async (tx) => {
      const updated = await tx.childProfile.update({
        where: { id },
        data: { status: input.status },
      });
      if (input.status === "DISABLED") {
        await tx.childSession.deleteMany({ where: { childId: id } });
      }
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: updated.familyId,
        action: "CHILD_STATUS_UPDATE",
        resourceType: "ChildProfile",
        resourceId: id,
        metadata: { status: input.status },
        ipAddress: request.ip,
      });
      return updated;
    });
    return { child };
  });

  app.patch("/api/admin/children/:id", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = childUpdateSchema.parse(request.body);
    const existing = await prisma.childProfile.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
    const child = await prisma.$transaction(async (tx) => {
      const updated = await tx.childProfile.update({
        where: { id },
        data: { nickname: input.nickname },
      });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: existing.familyId,
        action: "CHILD_PROFILE_UPDATE",
        resourceType: "ChildProfile",
        resourceId: id,
        metadata: input,
        ipAddress: request.ip,
      });
      return updated;
    });
    return { child };
  });

  app.post("/api/admin/children/:id/logout-all", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const child = await prisma.childProfile.findUnique({ where: { id } });
    if (!child) throw new HttpError(404, "CHILD_NOT_FOUND", "没有找到孩子");
    const count = await prisma.$transaction(async (tx) => {
      const result = await tx.childSession.deleteMany({ where: { childId: id } });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: user.id,
        familyId: child.familyId,
        action: "CHILD_LOGOUT_ALL",
        resourceType: "ChildProfile",
        resourceId: id,
        ipAddress: request.ip,
      });
      return result.count;
    });
    return { ok: true, sessionsRemoved: count };
  });

  app.post("/api/admin/users/:id/reset-password", async (request, reply) => {
    const { user: actor } = await requireAdmin(request, reply, config);
    const { id } = idParams.parse(request.params);
    const input = resetPasswordSchema.parse(request.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, "USER_NOT_FOUND", "没有找到账号");

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash: await hashSecret(input.password) },
      });
      await tx.userSession.deleteMany({ where: { userId: id } });
      await writeAudit(tx, {
        actorType: "USER",
        actorId: actor.id,
        familyId: target.familyId ?? undefined,
        action: "USER_PASSWORD_RESET",
        resourceType: "User",
        resourceId: id,
        ipAddress: request.ip,
      });
    });
    return { ok: true };
  });

  app.get("/api/admin/metrics", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [
      families,
      parents,
      children,
      onboardingCompleted,
      childDau,
      childWau,
      childMau,
      completedTasks,
      timedCompleted,
      timedOut,
      abandoned,
      dailyTaskCounts,
      starTotals,
      redemptionCounts,
    ] = await Promise.all([
      prisma.family.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({
        where: { role: "PARENT", status: "ACTIVE", family: { status: "ACTIVE" } },
      }),
      prisma.childProfile.count({
        where: { status: "ACTIVE", family: { status: "ACTIVE" } },
      }),
      prisma.childProfile.count({
        where: {
          status: "ACTIVE",
          family: { status: "ACTIVE" },
          onboardingCompletedAt: { not: null },
        },
      }),
      prisma.childProfile.count({
        where: {
          status: "ACTIVE",
          family: { status: "ACTIVE" },
          lastLoginAt: { gte: dayAgo },
        },
      }),
      prisma.childProfile.count({
        where: {
          status: "ACTIVE",
          family: { status: "ACTIVE" },
          lastLoginAt: { gte: weekAgo },
        },
      }),
      prisma.childProfile.count({
        where: {
          status: "ACTIVE",
          family: { status: "ACTIVE" },
          lastLoginAt: { gte: monthAgo },
        },
      }),
      prisma.taskAttempt.count({ where: { status: "COMPLETED" } }),
      prisma.taskAttempt.count({
        where: { status: "COMPLETED", dailyTask: { modeSnapshot: "TIMED" } },
      }),
      prisma.taskAttempt.count({ where: { status: "TIMED_OUT" } }),
      prisma.taskAttempt.count({ where: { status: "ABANDONED" } }),
      prisma.dailyTask.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.starLedger.groupBy({
        by: ["type"],
        _sum: { amount: true },
      }),
      prisma.wishRedemption.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);
    return {
      families,
      parents,
      children,
      onboardingCompleted,
      activeChildren: { daily: childDau, weekly: childWau, monthly: childMau },
      attempts: { completed: completedTasks, timedCompleted, timedOut, abandoned },
      dailyTasks: Object.fromEntries(
        dailyTaskCounts.map((row) => [row.status, row._count._all]),
      ),
      stars: Object.fromEntries(
        starTotals.map((row) => [row.type, row._sum.amount ?? 0]),
      ),
      redemptions: Object.fromEntries(
        redemptionCounts.map((row) => [row.status, row._count._all]),
      ),
    };
  });

  app.get("/api/admin/ai-usage", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const { days } = aiUsageQuery.parse(request.query);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    const records = await prisma.aiModelCall.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: "asc" },
      take: 100_001,
      select: {
        provider: true,
        operation: true,
        model: true,
        status: true,
        durationMs: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        createdAt: true,
      },
    });
    const dashboard = buildAiModelUsageDashboard(records.slice(0, 100_000), days, new Date(), config.APP_TIME_ZONE);
    return { ...dashboard, truncated: records.length > 100_000 };
  });

  app.get("/api/admin/performance", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const { days, familyId, childId, page, pageSize } = performanceQuery.parse(request.query);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
    const metricWhere: Prisma.ChildPerformanceMetricWhereInput = {
      createdAt: { gte: from },
      ...(childId
        ? { childId }
        : familyId
          ? { child: { familyId } }
          : {}),
    };
    const [metricsWithSentinel, scopeChildren] = await Promise.all([
      prisma.childPerformanceMetric.findMany({
        where: metricWhere,
        orderBy: { createdAt: "desc" },
        take: 50_001,
        select: {
          id: true,
          childId: true,
          kind: true,
          operation: true,
          path: true,
          method: true,
          status: true,
          requestId: true,
          totalMs: true,
          serverMs: true,
          clientOverheadMs: true,
          apiTotalMs: true,
          nonApiMs: true,
          ttfbMs: true,
          downloadMs: true,
          transferSize: true,
          visibilityState: true,
          online: true,
          effectiveType: true,
          connectionRttMs: true,
          downlinkMbps: true,
          errorName: true,
          errorMessage: true,
          appVersion: true,
          createdAt: true,
        },
      }),
      prisma.childProfile.findMany({
        where: { status: "ACTIVE", family: { status: "ACTIVE" } },
        orderBy: [{ family: { name: "asc" } }, { nickname: "asc" }],
        select: {
          id: true,
          nickname: true,
          family: { select: { id: true, name: true } },
        },
      }),
    ]);
    const truncated = metricsWithSentinel.length > 50_000;
    const metrics = metricsWithSentinel.slice(0, 50_000);
    const childDetails = new Map(
      scopeChildren.map((child) => [
        child.id,
        { nickname: child.nickname, familyName: child.family.name },
      ]),
    );
    const dashboard = buildPerformanceDashboard(
      metrics.map((metric) => ({
        ...metric,
        childNickname: childDetails.get(metric.childId)?.nickname ?? null,
        familyName: childDetails.get(metric.childId)?.familyName ?? null,
      })),
      days,
      config.APP_TIME_ZONE,
      page,
      pageSize,
    );
    return {
      ...dashboard,
      truncated,
      filters: {
        selectedFamilyId: familyId ?? null,
        selectedChildId: childId ?? null,
        families: [...new Map(
          scopeChildren.map((child) => [
            child.family.id,
            { id: child.family.id, name: child.family.name },
          ]),
        ).values()],
        children: scopeChildren.map((child) => ({
          id: child.id,
          nickname: child.nickname,
          familyId: child.family.id,
          familyName: child.family.name,
        })),
      },
    };
  });

  app.get("/api/admin/audit-logs", async (request, reply) => {
    await requireAdmin(request, reply, config);
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(10).max(100).default(20),
      })
      .parse(request.query);
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.auditLog.count(),
    ]);
    return { logs, total, page: query.page, pageSize: query.pageSize };
  });
}
