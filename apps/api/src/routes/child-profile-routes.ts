import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { requireChild } from "../services/auth-service.js";

const onboardingSchema = z.object({
  petType: z
    .enum(["DOUYA", "PAOPAO", "TUANTUAN", "MILU", "SHANSHAN"])
    .optional(),
  nickname: z.string().trim().min(2).max(9).optional(),
  complete: z.boolean().optional(),
});

export async function registerChildProfileRoutes(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.patch("/api/child/onboarding", async (request, reply) => {
    const { child } = await requireChild(request, reply, config);
    const input = onboardingSchema.parse(request.body);
    const petType = input.petType ?? child.petType;
    const nickname = input.nickname ?? child.nickname;

    if (input.complete && (!petType || !nickname)) {
      throw new HttpError(
        400,
        "ONBOARDING_INCOMPLETE",
        "需要先选择星宠并填写昵称",
      );
    }

    const updated = await prisma.childProfile.update({
      where: { id: child.id },
      data: {
        ...(input.petType ? { petType: input.petType } : {}),
        ...(input.nickname ? { nickname: input.nickname } : {}),
        ...(input.complete ? { onboardingCompletedAt: new Date() } : {}),
      },
    });

    return {
      child: {
        id: updated.id,
        nickname: updated.nickname,
        petType: updated.petType,
        onboardingCompletedAt: updated.onboardingCompletedAt,
      },
    };
  });
}
