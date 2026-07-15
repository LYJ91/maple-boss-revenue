import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser, authError } from "./_lib/auth.js";
import { getNexonKey } from "./_lib/nexon.js";

const NEXON_BASE = "https://open.api.nexon.com/maplestory/v1";

interface NexonSchedulerState {
  date: string | null;
  character_name: string;
  weekly_contents: {
    content_name: string;
    type: string;
    registration_flag: string;
    now_count: number;
    max_count: number;
  }[];
  boss_contents: {
    content_name: string;
    difficulty: string;
    cycle: string;
    registration_flag: string;
    complete_flag: string;
  }[];
  weekly_boss_clear_count: number;
  weekly_boss_clear_limit_count: number;
}

/**
 * GET /api/scheduler?ocid=...  (?ㅻ뜑 x-user-api-key: ?대떦 罹먮┃??怨꾩젙???μ뒯 API ??
 * ?μ뒯 ?ㅼ?以꾨윭 API濡?罹먮┃?곗쓽 二쇨컙 蹂댁뒪/肄섑뀗痢??ъ꽦 ?꾪솴??議고쉶?쒕떎.
 * ?ㅼ?以꾨윭 API?????뚯쑀 怨꾩젙??罹먮┃?곕쭔 議고쉶?????덈떎. ?ㅻ뒗 ??ν븯吏 ?딄퀬 ?꾨떖留??쒕떎.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  }
  try {
    const user = await requireUser(req);
    const ocid =
      typeof req.query.ocid === "string" ? req.query.ocid.trim() : "";
    const accountId =
      typeof req.query.accountId === "string" ? req.query.accountId.trim() : "";
    if (!ocid || !/^[A-Za-z0-9_-]{8,100}$/.test(ocid))
      return res.status(400).json({ error: "올바른 ocid가 필요합니다." });
    if (!accountId)
      return res.status(400).json({ error: "계정 ID가 필요합니다." });
    const userKey = await getNexonKey(user.subject, accountId);
    if (!userKey)
      return res.status(404).json({ error: "연결된 계정을 찾을 수 없습니다." });
    const nexonRes = await fetch(
      `${NEXON_BASE}/scheduler/character-state?ocid=${encodeURIComponent(ocid)}`,
      { headers: { "x-nxopen-api-key": userKey } },
    );
    if (!nexonRes.ok)
      return res
        .status(nexonRes.status)
        .json({ error: schedulerErrorMessage(nexonRes.status) });
    const data = (await nexonRes.json()) as NexonSchedulerState;
    return res.status(200).json({
      date: data.date,
      weeklyBossClearCount: data.weekly_boss_clear_count,
      weeklyBossClearLimit: data.weekly_boss_clear_limit_count,
      bosses: (data.boss_contents ?? []).map((b) => ({
        name: b.content_name,
        difficulty: b.difficulty,
        cycle: b.cycle,
        complete: b.complete_flag === "true",
      })),
      contents: (data.weekly_contents ?? [])
        .filter((c) => c.type === "contents")
        .map((c) => ({
          name: c.content_name,
          nowCount: c.now_count,
          maxCount: c.max_count,
          registered: c.registration_flag === "true",
        })),
    });
  } catch (error) {
    const e = authError(error);
    return res.status(e.status).json({ error: e.message });
  }
}
function schedulerErrorMessage(status: number): string {
  switch (status) {
    case 400:
      // ?μ뒯 ?ㅼ?以꾨윭 API?????뚯쑀 怨꾩젙 諛뽰쓽 罹먮┃?걔룸??묒냽 罹먮┃??議고쉶 ??400??諛섑솚?쒕떎
      return "議고쉶?????녿뒗 罹먮┃?곗엯?덈떎. ??怨꾩젙(API ????罹먮┃?곗씤吏, 6/25 ?댄썑 ?묒냽?덈뒗吏 ?뺤씤?댁＜?몄슂.";
    case 403:
      return "API ???몄쬆???ㅽ뙣?덉뒿?덈떎.";
    case 429:
      return "?대떦 ?ㅼ쓽 ?쇱씪 議고쉶 ?쒕룄瑜?珥덇낵?덉뒿?덈떎.";
    default:
      return `?μ뒯 API ?ㅻ쪟 (${status})`;
  }
}
