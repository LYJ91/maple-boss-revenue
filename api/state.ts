import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser, authError } from "./_lib/auth.js";
import { decryptText, encryptText, stateAad } from "./_lib/crypto.js";
import { db, ensureUser, resultRows } from "./_lib/db.js";
import {
  bodyWithinLimit,
  scopeSchema,
  statePutSchema,
} from "./_lib/validation.js";

interface StateRow {
  payload_ciphertext: Uint8Array;
  payload_iv: Uint8Array;
  payload_tag: Uint8Array;
  revision: string | number;
  schema_version: number;
  updated_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const user = await requireUser(req);
    await ensureUser(user.subject, user.email);
    if (req.method === "GET") return getState(req, res, user.subject);
    if (req.method === "PUT") return putState(req, res, user.subject);
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  } catch (error) {
    const e = authError(error);
    return res.status(e.status).json({ error: e.message });
  }
}

async function getState(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
) {
  const parsed = scopeSchema.safeParse(req.query.scope);
  if (!parsed.success)
    return res.status(400).json({ error: "scope가 올바르지 않습니다." });
  const scope = parsed.data;
  const rows = resultRows<StateRow>(
    await db()`
    SELECT payload_ciphertext, payload_iv, payload_tag, revision, schema_version, updated_at
    FROM state_documents WHERE user_id = ${userId} AND scope = ${scope}
  `,
  );
  const row = rows[0];
  if (!row)
    return res.status(200).json({ exists: false, revision: 0, payload: null });
  const plain = decryptText(
    {
      ciphertext: Buffer.from(row.payload_ciphertext),
      iv: Buffer.from(row.payload_iv),
      tag: Buffer.from(row.payload_tag),
      keyVersion: 1,
    },
    stateAad(userId, scope),
  );
  return res.status(200).json({
    exists: true,
    revision: Number(row.revision),
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at,
    payload: JSON.parse(plain),
  });
}

async function putState(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
) {
  if (!bodyWithinLimit(req.body))
    return res.status(413).json({ error: "저장 데이터가 너무 큽니다." });
  const parsed = statePutSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "저장 데이터 형식이 올바르지 않습니다." });
  const { scope, baseRevision, schemaVersion, payload, force } = parsed.data;
  const encrypted = encryptText(
    JSON.stringify(payload),
    stateAad(userId, scope),
  );
  const sql = db();

  if (baseRevision === 0) {
    const inserted = resultRows<{ revision: number; updated_at: string }>(
      await sql`
      INSERT INTO state_documents
        (user_id, scope, payload_ciphertext, payload_iv, payload_tag, revision, schema_version)
      VALUES (${userId}, ${scope}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag}, 1, ${schemaVersion})
      ON CONFLICT (user_id, scope) DO NOTHING
      RETURNING revision, updated_at
    `,
    );
    if (inserted.length)
      return res
        .status(200)
        .json({ revision: 1, updatedAt: inserted[0].updated_at });
  } else {
    const updated = resultRows<{ revision: number; updated_at: string }>(
      force
        ? await sql`
          UPDATE state_documents SET payload_ciphertext=${encrypted.ciphertext}, payload_iv=${encrypted.iv},
            payload_tag=${encrypted.tag}, revision=revision+1, schema_version=${schemaVersion}, updated_at=now()
          WHERE user_id=${userId} AND scope=${scope} RETURNING revision, updated_at
        `
        : await sql`
          UPDATE state_documents SET payload_ciphertext=${encrypted.ciphertext}, payload_iv=${encrypted.iv},
            payload_tag=${encrypted.tag}, revision=revision+1, schema_version=${schemaVersion}, updated_at=now()
          WHERE user_id=${userId} AND scope=${scope} AND revision=${baseRevision}
          RETURNING revision, updated_at
        `,
    );
    if (updated.length)
      return res
        .status(200)
        .json({
          revision: Number(updated[0].revision),
          updatedAt: updated[0].updated_at,
        });
  }

  const current = resultRows<{ revision: number }>(
    await sql`
    SELECT revision FROM state_documents WHERE user_id=${userId} AND scope=${scope}
  `,
  );
  return res
    .status(409)
    .json({
      error: "다른 기기에서 데이터가 변경되었습니다.",
      revision: Number(current[0]?.revision ?? 0),
    });
}
