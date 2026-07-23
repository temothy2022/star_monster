import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { AppConfig } from "./config.js";
import { HttpError } from "./lib/http-error.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerChildProfileRoutes } from "./routes/child-profile-routes.js";
import { registerChildTaskRoutes } from "./routes/child-task-routes.js";
import { registerChildProgressRoutes } from "./routes/child-progress-routes.js";
import { registerSuperAdminRoutes } from "./routes/super-admin-routes.js";
import { registerParentRoutes } from "./routes/parent-routes.js";
import { registerParentAiRoutes } from "./routes/parent-ai-routes.js";
import { prisma } from "./lib/prisma.js";

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    trustProxy: true,
  });

  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(cors, {
    credentials: true,
    origin: [
      config.CHILD_APP_ORIGIN,
      config.PARENT_APP_ORIGIN,
      config.ADMIN_APP_ORIGIN,
    ],
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, database: "ready" };
    } catch {
      return reply.status(503).send({ ok: false, database: "unavailable" });
    }
  });

  await registerAuthRoutes(app, config);
  await registerChildProfileRoutes(app, config);
  await registerChildTaskRoutes(app, config);
  await registerChildProgressRoutes(app, config);
  await registerSuperAdminRoutes(app, config);
  await registerParentRoutes(app, config);
  await registerParentAiRoutes(app, config);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "INVALID_INPUT",
          message: "提交的数据不正确",
          issues: error.issues,
        },
      });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    const clientError = error as {
      code?: string;
      statusCode?: number;
    };
    if (
      typeof clientError.statusCode === "number" &&
      clientError.statusCode >= 400 &&
      clientError.statusCode < 500
    ) {
      return reply.status(clientError.statusCode).send({
        error: {
          code: clientError.code ?? "BAD_REQUEST",
          message: "请求格式不正确",
        },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" },
    });
  });

  return app;
}
