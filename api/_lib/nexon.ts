import { decryptText, accountAad } from "./crypto.js";
import { db, resultRows } from "./db.js";

export async function getNexonKey(
  userId: string,
  accountId: string,
): Promise<string | null> {
  const rows = resultRows<{
    key_ciphertext: Uint8Array;
    key_iv: Uint8Array;
    key_tag: Uint8Array;
    key_version: number;
  }>(
    await db()`
    SELECT key_ciphertext, key_iv, key_tag, key_version
    FROM nexon_accounts WHERE id=${accountId} AND user_id=${userId}
  `,
  );
  const row = rows[0];
  if (!row) return null;
  return decryptText(
    {
      ciphertext: Buffer.from(row.key_ciphertext),
      iv: Buffer.from(row.key_iv),
      tag: Buffer.from(row.key_tag),
      keyVersion: Number(row.key_version),
    },
    accountAad(userId, accountId, Number(row.key_version)),
  );
}
