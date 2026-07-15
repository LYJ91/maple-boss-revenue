import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedValue {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

const KEY_VERSION = 1;

function masterKey(): Buffer {
  const raw = process.env.NEXON_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw)
    throw new Error("NEXON_CREDENTIAL_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error("Encryption key must be 32 bytes (base64)");
  return key;
}

export function encryptText(plainText: string, aad: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  return { ciphertext, iv, tag: cipher.getAuthTag(), keyVersion: KEY_VERSION };
}

export function decryptText(value: EncryptedValue, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), value.iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(value.tag);
  return Buffer.concat([
    decipher.update(value.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function stateAad(
  userId: string,
  scope: string,
  keyVersion = KEY_VERSION,
): string {
  return `state:${userId}:${scope}:v${keyVersion}`;
}

export function accountAad(
  userId: string,
  accountId: string,
  keyVersion = KEY_VERSION,
): string {
  return `nexon:${userId}:${accountId}:v${keyVersion}`;
}
