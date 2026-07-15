import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser, authError } from "./_lib/auth.js";
import { db, ensureUser, resultRows } from "./_lib/db.js";
import { historyRecordSchema } from "./_lib/validation.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const user = await requireUser(req);
    await ensureUser(user.subject, user.email);
    if (req.method === "GET") {
      const rows = resultRows<{
        week: string;
        revenue: string | number;
        crystals: number;
        monthly_boss_revenue: string | number;
        character_count: number;
        updated_at: string;
      }>(
        await db()`
        SELECT week::text, revenue, crystals, monthly_boss_revenue, character_count, updated_at
        FROM weekly_history WHERE user_id=${user.subject} ORDER BY week DESC LIMIT 52
      `,
      );
      return res.status(200).json({
        records: rows.map((r) => ({
          week: r.week,
          revenue: Number(r.revenue),
          crystals: Number(r.crystals),
          monthlyBossRevenue: Number(r.monthly_boss_revenue),
          characterCount: Number(r.character_count),
          updatedAt: r.updated_at,
        })),
      });
    }
    if (req.method === "PUT") {
      const parsed = historyRecordSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ error: "주간 기록 형식이 올바르지 않습니다." });
      const r = parsed.data;
      await db()`
        INSERT INTO weekly_history
          (user_id, week, revenue, crystals, monthly_boss_revenue, character_count, updated_at)
        VALUES (${user.subject}, ${r.week}, ${r.revenue}, ${r.crystals}, ${r.monthlyBossRevenue}, ${r.characterCount}, ${r.updatedAt ?? new Date().toISOString()})
        ON CONFLICT (user_id, week) DO UPDATE SET
          revenue=EXCLUDED.revenue, crystals=EXCLUDED.crystals,
          monthly_boss_revenue=EXCLUDED.monthly_boss_revenue,
          character_count=EXCLUDED.character_count, updated_at=EXCLUDED.updated_at
        WHERE weekly_history.updated_at <= EXCLUDED.updated_at
      `;
      await db()`
        DELETE FROM weekly_history WHERE user_id=${user.subject} AND week NOT IN
          (SELECT week FROM weekly_history WHERE user_id=${user.subject} ORDER BY week DESC LIMIT 52)
      `;
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  } catch (error) {
    const e = authError(error);
    return res.status(e.status).json({ error: e.message });
  }
}
