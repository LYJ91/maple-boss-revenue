import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser, authError } from "./_lib/auth.js";
import { getNexonKey } from "./_lib/nexon.js";

const NEXON_BASE = "https://open.api.nexon.com/maplestory/v1";
interface NexonCharacterList {
  account_list: {
    character_list: {
      ocid: string;
      character_name: string;
      world_name: string;
      character_class: string;
      character_level: number;
    }[];
  }[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  }
  try {
    const user = await requireUser(req);
    const accountId =
      typeof req.query.accountId === "string" ? req.query.accountId.trim() : "";
    if (!accountId)
      return res.status(400).json({ error: "계정 ID가 필요합니다." });
    const key = await getNexonKey(user.subject, accountId);
    if (!key)
      return res.status(404).json({ error: "연결된 계정을 찾을 수 없습니다." });
    const listRes = await fetch(`${NEXON_BASE}/character/list`, {
      headers: { "x-nxopen-api-key": key },
    });
    if (!listRes.ok) {
      const message =
        listRes.status === 403
          ? "저장된 API 키가 유효하지 않습니다."
          : listRes.status === 429
            ? "해당 키의 일일 조회 한도를 초과했습니다."
            : `넥슨 API 오류 (${listRes.status})`;
      return res.status(listRes.status).json({ error: message });
    }
    const data = (await listRes.json()) as NexonCharacterList;
    const characters = data.account_list
      .flatMap((account) => account.character_list)
      .map((c) => ({
        ocid: c.ocid,
        name: c.character_name,
        world: c.world_name,
        job: c.character_class,
        level: c.character_level,
      }))
      .sort((a, b) => b.level - a.level);
    return res.status(200).json({ characters });
  } catch (error) {
    const e = authError(error);
    return res.status(e.status).json({ error: e.message });
  }
}
