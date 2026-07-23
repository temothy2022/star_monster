import type {
  ChildProfile,
  ChildSession,
  User,
  UserRole,
  UserSession,
} from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import {
  generateOpaqueToken,
  hashToken,
  loginCodeLookup,
  normalizeChildLoginCode,
  verifySecret,
} from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export const CHILD_COOKIE = "sm_child_session";
export const STAFF_COOKIE = "sm_staff_session";

type RequestMetadata = {
  userAgent?: string;
  ipAddress?: string;
};

export type AuthenticatedChild = {
  child: ChildProfile;
  session: ChildSession;
};

export type AuthenticatedUser = {
  user: User;
  session: UserSession;
};

function futureDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function metadataFromRequest(request: FastifyRequest): RequestMetadata {
  return {
    userAgent: request.headers["user-agent"],
    ipAddress: request.ip,
  };
}

function cookieOptions(config: AppConfig, days: number) {
  return {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires: futureDate(days),
  };
}

export async function loginChild(
  codeInput: string,
  deviceName: string | undefined,
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
): Promise<ChildProfile> {
  const code = normalizeChildLoginCode(codeInput);
  const child = await prisma.childProfile.findUnique({
    where: { loginCodeLookup: loginCodeLookup(code, config.LOGIN_CODE_PEPPER) },
    include: { family: { select: { status: true } } },
  });

  if (
    !child ||
    child.status !== "ACTIVE" ||
    child.family.status !== "ACTIVE" ||
    !(await verifySecret(code, child.loginCodeHash))
  ) {
    throw new HttpError(401, "INVALID_CHILD_CODE", "登录代码不正确");
  }

  const rawToken = generateOpaqueToken();
  const metadata = metadataFromRequest(request);
  await prisma.$transaction([
    prisma.childSession.create({
      data: {
        childId: child.id,
        tokenHash: hashToken(rawToken),
        deviceName,
        ...metadata,
        expiresAt: futureDate(config.CHILD_SESSION_DAYS),
      },
    }),
    prisma.childProfile.update({
      where: { id: child.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  reply.setCookie(
    CHILD_COOKIE,
    rawToken,
    cookieOptions(config, config.CHILD_SESSION_DAYS),
  );
  return child;
}

export async function loginStaff(
  usernameInput: string,
  password: string,
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
): Promise<User> {
  const username = usernameInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    include: { family: { select: { status: true } } },
  });
  if (
    !user ||
    user.status !== "ACTIVE" ||
    (user.role === "PARENT" && user.family?.status !== "ACTIVE") ||
    !(await verifySecret(password, user.passwordHash))
  ) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "用户名或密码不正确");
  }

  const rawToken = generateOpaqueToken();
  const metadata = metadataFromRequest(request);
  await prisma.$transaction([
    prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        ...metadata,
        expiresAt: futureDate(config.STAFF_SESSION_DAYS),
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  reply.setCookie(
    STAFF_COOKIE,
    rawToken,
    cookieOptions(config, config.STAFF_SESSION_DAYS),
  );
  return user;
}

export async function requireChild(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
): Promise<AuthenticatedChild> {
  const rawToken = request.cookies[CHILD_COOKIE];
  if (!rawToken) {
    throw new HttpError(401, "CHILD_AUTH_REQUIRED", "请先登录");
  }

  const session = await prisma.childSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { child: { include: { family: { select: { status: true } } } } },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.child.status !== "ACTIVE" ||
    session.child.family.status !== "ACTIVE"
  ) {
    reply.clearCookie(CHILD_COOKIE, { path: "/" });
    throw new HttpError(401, "CHILD_SESSION_EXPIRED", "登录已过期，请重新登录");
  }

  const expiresAt = futureDate(config.CHILD_SESSION_DAYS);
  await prisma.childSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date(), expiresAt },
  });
  reply.setCookie(CHILD_COOKIE, rawToken, {
    ...cookieOptions(config, config.CHILD_SESSION_DAYS),
    expires: expiresAt,
  });

  return { child: session.child, session };
}

export async function requireStaff(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  roles?: UserRole[],
): Promise<AuthenticatedUser> {
  const rawToken = request.cookies[STAFF_COOKIE];
  if (!rawToken) {
    throw new HttpError(401, "STAFF_AUTH_REQUIRED", "请先登录");
  }

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { include: { family: { select: { status: true } } } } },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE" ||
    (session.user.role === "PARENT" &&
      session.user.family?.status !== "ACTIVE")
  ) {
    reply.clearCookie(STAFF_COOKIE, { path: "/" });
    throw new HttpError(401, "STAFF_SESSION_EXPIRED", "登录已过期，请重新登录");
  }
  if (roles && !roles.includes(session.user.role)) {
    throw new HttpError(403, "FORBIDDEN", "没有访问权限");
  }

  const expiresAt = futureDate(config.STAFF_SESSION_DAYS);
  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date(), expiresAt },
  });
  reply.setCookie(STAFF_COOKIE, rawToken, {
    ...cookieOptions(config, config.STAFF_SESSION_DAYS),
    expires: expiresAt,
  });
  return { user: session.user, session };
}

export async function logoutChild(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawToken = request.cookies[CHILD_COOKIE];
  if (rawToken) {
    await prisma.childSession.deleteMany({
      where: { tokenHash: hashToken(rawToken) },
    });
  }
  reply.clearCookie(CHILD_COOKIE, { path: "/" });
}

export async function logoutStaff(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawToken = request.cookies[STAFF_COOKIE];
  if (rawToken) {
    await prisma.userSession.deleteMany({
      where: { tokenHash: hashToken(rawToken) },
    });
  }
  reply.clearCookie(STAFF_COOKIE, { path: "/" });
}
