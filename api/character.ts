import type { VercelRequest, VercelResponse } from '@vercel/node';

const NEXON_BASE = 'https://open.api.nexon.com/maplestory/v1';

/**
 * GET /api/character?name=캐릭터명
 * 사이트 운영자 API 키(NEXON_API_KEY)로 캐릭터명 → ocid → 기본 정보를 조회한다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (!name) {
    return res.status(400).json({ error: '캐릭터명을 입력해주세요.' });
  }

  const key = process.env.NEXON_API_KEY;
  if (!key) {
    return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
  }

  const headers = { 'x-nxopen-api-key': key };

  try {
    const idRes = await fetch(
      `${NEXON_BASE}/id?character_name=${encodeURIComponent(name)}`,
      { headers },
    );
    if (!idRes.ok) {
      return res.status(idRes.status).json({ error: nexonErrorMessage(idRes.status) });
    }
    const { ocid } = (await idRes.json()) as { ocid: string };

    const basicRes = await fetch(`${NEXON_BASE}/character/basic?ocid=${ocid}`, {
      headers,
    });
    if (!basicRes.ok) {
      return res
        .status(basicRes.status)
        .json({ error: nexonErrorMessage(basicRes.status) });
    }
    const basic = (await basicRes.json()) as Record<string, unknown>;

    // 같은 캐릭터 재검색 시 넥슨 호출을 아끼기 위해 CDN 캐시 1시간
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      ocid,
      name: basic.character_name,
      world: basic.world_name,
      job: basic.character_class,
      level: basic.character_level,
      image: basic.character_image,
    });
  } catch {
    return res.status(502).json({ error: '넥슨 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }
}

function nexonErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return '존재하지 않는 캐릭터입니다. 캐릭터명을 확인해주세요.';
    case 403:
      return 'API 키 인증에 실패했습니다.';
    case 429:
      return '일일 조회 한도를 초과했습니다. 내일 다시 시도해주세요.';
    default:
      return `넥슨 API 오류 (${status})`;
  }
}
