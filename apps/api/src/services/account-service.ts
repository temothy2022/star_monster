import { Prisma, type PetType } from "@prisma/client";
import {
  generateChildLoginCode,
  hashSecret,
  loginCodeLookup,
} from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";

type DbClient = Prisma.TransactionClient;

export async function createChildAccount(
  tx: DbClient,
  input: {
    familyId: string;
    nickname?: string;
    petType?: PetType;
    loginCodePepper: string;
  },
): Promise<{ childId: string; loginCode: string }> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const loginCode = generateChildLoginCode();
    const lookup = loginCodeLookup(loginCode, input.loginCodePepper);
    const collision = await tx.childProfile.findUnique({
      where: { loginCodeLookup: lookup },
      select: { id: true },
    });
    if (collision) continue;

    const child = await tx.childProfile.create({
      data: {
        familyId: input.familyId,
        nickname: input.nickname,
        petType: input.petType,
        loginCodeLookup: lookup,
        loginCodeHash: await hashSecret(loginCode),
        loginCodeLastFour: loginCode.slice(-4),
      },
    });
    return { childId: child.id, loginCode };
  }
  throw new HttpError(503, "LOGIN_CODE_EXHAUSTED", "暂时无法生成登录代码");
}

export async function regenerateChildLoginCode(
  tx: DbClient,
  childId: string,
  loginCodePepper: string,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const loginCode = generateChildLoginCode();
    const lookup = loginCodeLookup(loginCode, loginCodePepper);
    const collision = await tx.childProfile.findUnique({
      where: { loginCodeLookup: lookup },
      select: { id: true },
    });
    if (collision) continue;

    await tx.childProfile.update({
      where: { id: childId },
      data: {
        loginCodeLookup: lookup,
        loginCodeHash: await hashSecret(loginCode),
        loginCodeLastFour: loginCode.slice(-4),
      },
    });
    return loginCode;
  }
  throw new HttpError(503, "LOGIN_CODE_EXHAUSTED", "暂时无法生成登录代码");
}

export async function createFamilyWithParent(
  tx: DbClient,
  input: {
    familyName: string;
    parentUsername: string;
    parentDisplayName: string;
    parentPassword: string;
    childNicknames: Array<string | undefined>;
    loginCodePepper: string;
  },
) {
  const username = input.parentUsername.trim().toLowerCase();
  const existingUser = await tx.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existingUser) {
    throw new HttpError(409, "USERNAME_TAKEN", "这个家长用户名已经存在");
  }

  const family = await tx.family.create({ data: { name: input.familyName } });
  const parent = await tx.user.create({
    data: {
      familyId: family.id,
      username,
      displayName: input.parentDisplayName,
      passwordHash: await hashSecret(input.parentPassword),
      role: "PARENT",
    },
  });
  const children = [];
  for (const nickname of input.childNicknames) {
    children.push(
      await createChildAccount(tx, {
        familyId: family.id,
        nickname,
        loginCodePepper: input.loginCodePepper,
      }),
    );
  }

  return { family, parent, children };
}
