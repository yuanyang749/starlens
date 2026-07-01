import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// 中文注释：密钥派生目前是单轮无盐 SHA-256（不是 PBKDF2/scrypt/HKDF），
// 暴力破解没有额外的迭代成本抵消。真正的防线是保证 TOKEN_ENCRYPTION_SECRET 本身熵足够，
// 所以这里强制最短长度，而不是更换派生算法——换算法需要给已加密数据做版本化迁移，
// 现在只加一道零迁移成本的长度校验。
const MIN_SECRET_LENGTH = 32;

function getKey() {
  const secret = process.env.TOKEN_ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_SECRET is required to encrypt secrets.");
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters long.`,
    );
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));

  if (!iv || !tag || !encrypted) {
    throw new Error("Encrypted secret is malformed.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
