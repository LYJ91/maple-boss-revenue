import type { VercelRequest, VercelResponse } from '@vercel/node';

const NEXON_BASE = 'https://open.api.nexon.com/maplestory/v1';

/** 조회 가능한 파트 화이트리스트 (part 이름 → 넥슨 API 경로) */
const PARTS: Record<string, string> = {
  basic: '/character/basic',
  popularity: '/character/popularity',
  stat: '/character/stat',
  'hyper-stat': '/character/hyper-stat',
  propensity: '/character/propensity',
  ability: '/character/ability',
  item: '/character/item-equipment',
  cash: '/character/cashitem-equipment',
  symbol: '/character/symbol-equipment',
  'set-effect': '/character/set-effect',
  beauty: '/character/beauty-equipment',
  android: '/character/android-equipment',
  pet: '/character/pet-equipment',
  'link-skill': '/character/link-skill',
  vmatrix: '/character/vmatrix',
  hexamatrix: '/character/hexamatrix',
  'hexa-stat': '/character/hexamatrix-stat',
  dojang: '/character/dojang',
  union: '/user/union',
  'union-raider': '/user/union-raider',
  'union-artifact': '/user/union-artifact',
  'union-champion': '/user/union-champion',
};

/** 개발 단계 키의 초당 5건 제한을 지키기 위한 동시 호출 묶음 크기 */
const CHUNK_SIZE = 4;
const CHUNK_INTERVAL_MS = 1100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET /api/detail?ocid=...&parts=basic,stat,item
 * 지정한 파트들을 넥슨 API에서 모아 { 파트명: 응답 } 형태로 반환한다.
 * 실패한 파트는 { error } 로 표시하고 전체 요청은 성공 처리한다 (부분 렌더링 허용).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ocid = typeof req.query.ocid === 'string' ? req.query.ocid.trim() : '';
  const partsRaw = typeof req.query.parts === 'string' ? req.query.parts : '';
  const parts = partsRaw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p in PARTS);

  if (!ocid || parts.length === 0) {
    return res.status(400).json({ error: 'ocid와 parts를 지정해주세요.' });
  }

  const key = process.env.NEXON_API_KEY;
  if (!key) {
    return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
  }
  const headers = { 'x-nxopen-api-key': key };

  const fetchPart = async (part: string): Promise<[string, unknown]> => {
    try {
      const r = await fetch(`${NEXON_BASE}${PARTS[part]}?ocid=${ocid}`, { headers });
      if (!r.ok) {
        return [part, { error: `조회 실패 (${r.status})` }];
      }
      return [part, await r.json()];
    } catch {
      return [part, { error: '네트워크 오류' }];
    }
  };

  const result: Record<string, unknown> = {};
  for (let i = 0; i < parts.length; i += CHUNK_SIZE) {
    const chunk = parts.slice(i, i + CHUNK_SIZE);
    const settled = await Promise.all(chunk.map(fetchPart));
    for (const [part, data] of settled) result[part] = data;
    if (i + CHUNK_SIZE < parts.length) await sleep(CHUNK_INTERVAL_MS);
  }

  // 넥슨 데이터는 일 단위 갱신이므로 CDN 1시간 캐시
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json(result);
}
