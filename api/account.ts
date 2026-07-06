import type { VercelRequest, VercelResponse } from '@vercel/node';

const NEXON_BASE = 'https://open.api.nexon.com/maplestory/v1';

interface NexonCharacterList {
  account_list: {
    account_id: string;
    character_list: {
      ocid: string;
      character_name: string;
      world_name: string;
      character_class: string;
      character_level: number;
    }[];
  }[];
}

/**
 * GET /api/account  (헤더 x-user-api-key: 방문자 본인의 넥슨 API 키)
 * 방문자 키 소유 계정의 전체 캐릭터 목록을 반환한다. 키는 저장하지 않고 전달만 한다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userKey = req.headers['x-user-api-key'];
  if (typeof userKey !== 'string' || !userKey.trim()) {
    return res.status(400).json({ error: 'API 키를 입력해주세요.' });
  }

  try {
    const listRes = await fetch(`${NEXON_BASE}/character/list`, {
      headers: { 'x-nxopen-api-key': userKey.trim() },
    });
    if (!listRes.ok) {
      const message =
        listRes.status === 403
          ? 'API 키가 유효하지 않습니다. live_로 시작하는 키인지 확인해주세요.'
          : listRes.status === 429
            ? '해당 키의 일일 조회 한도를 초과했습니다.'
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

    // 방문자별 응답이므로 캐시하지 않는다
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ characters });
  } catch {
    return res.status(502).json({ error: '넥슨 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }
}
