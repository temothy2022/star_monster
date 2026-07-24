import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import {
  loginChild,
  loginStaff,
  logoutChild,
  logoutStaff,
  requireChild,
  requireStaff,
} from "../services/auth-service.js";
import { enforceRateLimit } from "../lib/rate-limit.js";

const childLoginSchema = z.object({
  code: z.string().min(8).max(16),
  deviceName: z.string().trim().min(1).max(80).optional(),
});

const staffLoginSchema = z.object({
  username: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(256),
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
}
