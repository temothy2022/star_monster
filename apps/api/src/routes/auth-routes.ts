import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import {
  loginChild,
  loginStaff,
  logoutChild,
  logoutStaff,
  logoutPortal,
  requireAdmin,
  requireParent,
  requireChild,
  requireStaff,
} from "../services/auth-service.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { createFamilyWithParent } from "../services/account-service.js";
import {
  isParentPhone,
  normalizeParentPhone,
  sendParentRegistrationCode,
  verifyAndConsumeParentRegistrationCode,
} from "../services/parent-registration-service.js";

const childLoginSchema = z.object({
  code: z.string().min(8).max(16),
  deviceName: z.string().trim().min(1).max(80).optional(),
});

const staffLoginSchema = z.object({
  username: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(256),
});

const parentLoginSchema = z.object({
  phone: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(256),
});

const parentRegistrationSchema = z.object({
  phone: z.string().trim().refine(isParentPhone, "请输入有效的中国大陆手机号"),
  verificationCode: z.string().regex(/^\d{6}$/, "请输入 6 位数字验证码"),
  password: z
    .string()
    .min(8)
    .max(256)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
      message: "密码需要同时包含字母和数字",
    }),
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.post("/api/child/auth/login", async (request, reply) => {
    enforceRateLimit({
      key: `child-login:${request.ip}`,
      limit: 8,
      windowMs: 15 * 60 * 1000,
    });
    const input = childLoginSchema.parse(request.body);
    const child = await loginChild(
      input.code,
      input.deviceName,
      request,
      reply,
      config,
    );
    return {
      child: {
        id: child.id,
        nickname: child.nickname,
        avatarUrl: child.avatarUrl,
        petType: child.petType,
        onboardingCompleted: Boolean(child.onboardingCompletedAt),
      },
    };
  });

  app.post("/api/child/auth/logout", async (request, reply) => {
    await logoutChild(request, reply);
    return { ok: true };
  });

  app.get("/api/child/me", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    return {
      child: {
        id: child.id,
        nickname: child.nickname,
        avatarUrl: child.avatarUrl,
        petType: child.petType,
        onboardingCompletedAt: child.onboardingCompletedAt,
        dailyStarGoal: child.dailyStarGoal,
        dailyGoalBonusEnabled: child.dailyGoalBonusEnabled,
        dailyGoalBonusStars: child.dailyGoalBonusStars,
        starBalance: child.starBalance,
        lifetimeStarsEarned: child.lifetimeStarsEarned,
      },
    };
  });

  app.post("/api/staff/auth/login", async (request, reply) => {
    enforceRateLimit({
      key: `staff-login:${request.ip}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    const input = staffLoginSchema.parse(request.body);
    const user = await loginStaff(
      input.username,
      input.password,
      request,
      reply,
      config,
    );
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        familyId: user.familyId,
      },
    };
  });

  app.post("/api/parent/auth/login", async (request, reply) => {
    enforceRateLimit({
      key: `parent-login:${request.ip}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    const input = parentLoginSchema.parse(request.body);
    const user = await loginStaff(input.phone, input.password, request, reply, config, "parent");
    return { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, familyId: user.familyId } };
  });

  app.post("/api/parent/auth/send-verification-code", async (request) => {
    enforceRateLimit({
      key: `parent-sms-ip:${request.ip}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
      code: "SMS_RATE_LIMITED",
      message: "短信发送次数过多，请稍后再试",
    });
    const input = z.object({
      phone: z.string().trim().refine(isParentPhone, "请输入有效的中国大陆手机号"),
    }).parse(request.body);
    const phone = normalizeParentPhone(input.phone);
    enforceRateLimit({
      key: `parent-sms-phone:${phone}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
      code: "SMS_RATE_LIMITED",
      message: "这个手机号发送次数过多，请稍后再试",
    });
    return sendParentRegistrationCode(prisma, config, phone);
  });

  app.post("/api/parent/auth/register", async (request, reply) => {
    enforceRateLimit({
      key: `parent-register:${request.ip}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    const input = parentRegistrationSchema.parse(request.body);
    const phone = normalizeParentPhone(input.phone);
    try {
      await prisma.$transaction(async (tx) => {
        await verifyAndConsumeParentRegistrationCode(tx, phone, input.verificationCode);
        await createFamilyWithParent(tx, {
          familyName: phone + "的家庭",
          parentUsername: phone,
          parentPhoneNumber: phone,
          parentDisplayName: "家长",
          parentPassword: input.password,
          childNicknames: [],
          loginCodePepper: config.LOGIN_CODE_PEPPER,
          loginCodeEncryptionKey: config.AI_CONFIG_ENCRYPTION_KEY,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "PHONE_REGISTERED", "这个手机号已经注册过家长账号");
      }
      throw error;
    }
    const user = await loginStaff(
      phone,
      input.password,
      request,
      reply,
      config,
      "parent",
    );
    return reply.status(201).send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        familyId: user.familyId,
      },
      needsChildSetup: true,
    });
  });

  app.post("/api/admin/auth/login", async (request, reply) => {
    enforceRateLimit({
      key: `admin-login:${request.ip}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    const input = staffLoginSchema.parse(request.body);
    const user = await loginStaff(input.username, input.password, request, reply, config, "admin");
    return { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, familyId: user.familyId } };
  });

  app.post("/api/staff/auth/logout", async (request, reply) => {
    await logoutStaff(request, reply);
    return { ok: true };
  });

  app.get("/api/staff/me", async (request, reply) => {
    const { user } = await requireStaff(request, reply, config);
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        familyId: user.familyId,
      },
    };
  });

  app.post("/api/parent/auth/logout", async (request, reply) => {
    await logoutPortal(request, reply, "parent");
    return { ok: true };
  });

  app.post("/api/admin/auth/logout", async (request, reply) => {
    await logoutPortal(request, reply, "admin");
    return { ok: true };
  });

  app.get("/api/parent/me", async (request, reply) => {
    const { user } = await requireParent(request, reply, config);
    return { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, familyId: user.familyId } };
  });

  app.get("/api/admin/me", async (request, reply) => {
    const { user } = await requireAdmin(request, reply, config);
    return { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, familyId: user.familyId } };
  });
}
