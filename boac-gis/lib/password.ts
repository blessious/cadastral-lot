import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey))
    );
  });

  return `scrypt$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText, extra] =
    storedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText || extra) return false;

  const N = Number(costText);
  const r = Number(blockSizeText);
  const p = Number(parallelizationText);
  if (N !== 16384 || r !== 8 || p !== 1) return false;

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length < 16 || expected.length !== 64) return false;

    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        expected.length,
        { N, r, p, maxmem: 64 * 1024 * 1024 },
        (error, derivedKey) => (error ? reject(error) : resolve(derivedKey))
      );
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
