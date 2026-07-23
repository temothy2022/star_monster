import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  CHILD_LOGIN_ALPHABET,
  CHILD_LOGIN_CODE_LENGTH,
} from "../domain/constants.js";

const scrypt = promisify(nodeScrypt);
const HASH_BYTES = 64;

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeChildLoginCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

export function loginCodeLookup(code: string, pepper: string): string {
  return createHmac("sha256", pepper)
    .update(normalizeChildLoginCode(code))
    .digest("hex");
}

export function generateChildLoginCode(): string {
  const bytes = randomBytes(CHILD_LOGIN_CODE_LENGTH);
  let code = "";
  for (let index = 0; index < CHILD_LOGIN_CODE_LENGTH; index += 1) {
    code += CHILD_LOGIN_ALPHABET[bytes[index]! % CHILD_LOGIN_ALPHABET.length];
  }
  return code;
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(secret, salt, HASH_BYTES)) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${derivedKey.toString("base64url")}`;
}

export async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  const [algorithm, encodedSalt, encodedHash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedHash) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, "base64url");
  const expected = Buffer.from(encodedHash, "base64url");
  const actual = (await scrypt(secret, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
