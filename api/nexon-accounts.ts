import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { requireUser, authError } from "./_lib/auth.js";
import { accountAad, encryptText } from "./_lib/crypto.js";
import { db, ensureUser, resultRows } from "./_lib/db.js";
import { accountCreateSchema, accountPatchSchema } from "./_lib/validation.js";

const NEXON_BASE = "https://open.api.nexon.com/maplestory/v1";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const user = await requireUser(req);
    await ensureUser(user.subject, user.email);
    if (req.method === "GET") {
      const rows = resultRows<{ id: string; label: string }>(
        await db()`SELECT id, label FROM nexon_accounts WHERE user_id=${user.subject} ORDER BY created_at`,
      );
      return res
        .status(200)
        .json({
          accounts: rows.map((r) => ({
            id: r.id,
            label: r.label,
            connected: true,
          })),
        });
    }
    if (req.method === "POST") {
      const parsed = accountCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({
            error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
          });
      const { label, apiKey } = parsed.data;
      const validation = await fetch(`${NEXON_BASE}/character/list`, {
        headers: { "x-nxopen-api-key": apiKey },
      });
      if (!validation.ok)
        return res
          .status(validation.status)
          .json({
            error:
              validation.status === 403
                ? "API 키가 유효하지 않습니다."
                : `넥슨 API 오류 (${validation.status})`,
          });
      const id = parsed.data.id ?? randomUUID();
      const encrypted = encryptText(apiKey, accountAad(user.subject, id));
      await db()`
        INSERT INTO nexon_accounts (id, user_id, label, key_ciphertext, key_iv, key_tag, key_version)
        VALUES (${id}, ${user.subject}, ${label}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag}, ${encrypted.keyVersion})
        ON CONFLICT (user_id, id) DO UPDATE SET label=EXCLUDED.label, key_ciphertext=EXCLUDED.key_ciphertext,
          key_iv=EXCLUDED.key_iv, key_tag=EXCLUDED.key_tag, key_version=EXCLUDED.key_version, updated_at=now()
      `;
      return res.status(201).json({ account: { id, label, connected: true } });
    }
    if (req.method === "PATCH") {
      const parsed = accountPatchSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "입력값을 확인해주세요." });
      const rows = resultRows<{ id: string }>(
        await db()`UPDATE nexon_accounts SET label=${parsed.data.label}, updated_at=now() WHERE id=${parsed.data.id} AND user_id=${user.subject} RETURNING id`,
      );
      return rows.length
        ? res.status(200).json({ ok: true })
        : res.status(404).json({ error: "계정을 찾을 수 없습니다." });
    }
    if (req.method === "DELETE") {
      const id = typeof req.query.id === "string" ? req.query.id : "";
      if (!id) return res.status(400).json({ error: "계정 ID가 필요합니다." });
      const rows = resultRows<{ id: string }>(
        await db()`DELETE FROM nexon_accounts WHERE id=${id} AND user_id=${user.subject} RETURNING id`,
      );
      return rows.length
        ? res.status(200).json({ ok: true })
        : res.status(404).json({ error: "계정을 찾을 수 없습니다." });
    }
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  } catch (error) {
    const e = authError(error);
    return res.status(e.status).json({ error: e.message });
  }
}
