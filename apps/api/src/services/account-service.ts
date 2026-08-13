import { Prisma, type PetType } from "@prisma/client";
import {
  generateChildLoginCode,
  hashSecret,
  loginCodeLookup,
} from "../lib/crypto.js";
import { decryptSecret, encryptSecret } from "../lib/secret-encryption.js";
import { HttpError } from "../lib/http-error.js";

type DbClient = Prisma.TransactionClient;

export async function createChildAccount(
  tx: DbClient,
  input: {
    familyId: string;
    nickname?: string;
    petType?: PetType;
    loginCodePepper: string;
    loginCodeEncryptionKey: string;
  },
): Promise<{ childId: string; loginCode: string }> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const loginCode = generateChildLoginCode();
    const lookup = loginCodeLookup(loginCode, input.loginCodePepper);
    const encrypted = encryptSecret(loginCode, input.loginCodeEncryptionKey);
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
        loginCodeCiphertext: encrypted.ciphertext,
        loginCodeEncryptionIv: encrypted.iv,
        loginCodeEncryptionTag: encrypted.tag,
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
  loginCodeEncryptionKey: string,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const loginCode = generateChildLoginCode();
    const lookup = loginCodeLookup(loginCode, loginCodePepper);
    const encrypted = encryptSecret(loginCode, loginCodeEncryptionKey);
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
        loginCodeCiphertext: encrypted.ciphertext,
        loginCodeEncryptionIv: encrypted.iv,
        loginCodeEncryptionTag: encrypted.tag,
      },
    });
    return loginCode;
  }
  throw new HttpError(503, "LOGIN_CODE_EXHAUSTED", "暂时无法生成登录代码");
}

export function revealChildLoginCode(
  child: {
    loginCodeCiphertext: string | null;
    loginCodeEncryptionIv: string | null;
    loginCodeEncryptionTag: string | null;
  },
  loginCodeEncryptionKey: string,
): string | null {
  if (
    !child.loginCodeCiphertext ||
    !child.loginCodeEncryptionIv ||
    !child.loginCodeEncryptionTag
  ) return null;
  try {
    return decryptSecret({
      ciphertext: child.loginCodeCiphertext,
      iv: child.loginCodeEncryptionIv,
      tag: child.loginCodeEncryptionTag,
    }, loginCodeEncryptionKey);
  } catch {
    throw new HttpError(500, "CHILD_LOGIN_CODE_DECRYPT_FAILED", "暂时无法读取探险代码");
  }
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
    loginCodeEncryptionKey: string;
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
        loginCodeEncryptionKey: input.loginCodeEncryptionKey,
      }),
    );
  }

  return { family, parent, children };
}
