import type { VercelRequest, VercelResponse } from '@vercel/node';

const NEXON_BASE = 'https://open.api.nexon.com/maplestory/v1';

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
 * GET /api/scheduler?ocid=...  (헤더 x-user-api-key: 해당 캐릭터 계정의 넥슨 API 키)
 * 넥슨 스케줄러 API로 캐릭터의 주간 보스/콘텐츠 달성 현황을 조회한다.
 * 스케줄러 API는 키 소유 계정의 캐릭터만 조회할 수 있다. 키는 저장하지 않고 전달만 한다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ocid = typeof req.query.ocid === 'string' ? req.query.ocid.trim() : '';
  if (!ocid) {
    return res.status(400).json({ error: 'ocid가 필요합니다.' });
  }
  const userKey = req.headers['x-user-api-key'];
  if (typeof userKey !== 'string' || !userKey.trim()) {
    return res.status(400).json({ error: 'API 키를 입력해주세요.' });
  }

  try {
    const nexonRes = await fetch(
      `${NEXON_BASE}/scheduler/character-state?ocid=${encodeURIComponent(ocid)}`,
      { headers: { 'x-nxopen-api-key': userKey.trim() } },
    );
    if (!nexonRes.ok) {
      return res
        .status(nexonRes.status)
        .json({ error: schedulerErrorMessage(nexonRes.status) });
    }

    const data = (await nexonRes.json()) as NexonSchedulerState;

    // 클라이언트에서 쓰는 정보만 추려 payload를 줄인다
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      date: data.date,
      weeklyBossClearCount: data.weekly_boss_clear_count,
      weeklyBossClearLimit: data.weekly_boss_clear_limit_count,
      bosses: (data.boss_contents ?? []).map((b) => ({
        name: b.content_name,
        difficulty: b.difficulty,
        cycle: b.cycle,
        complete: b.complete_flag === 'true',
      })),
      contents: (data.weekly_contents ?? [])
        .filter((c) => c.type === 'contents')
        .map((c) => ({
          name: c.content_name,
          nowCount: c.now_count,
          maxCount: c.max_count,
          registered: c.registration_flag === 'true',
        })),
    });
  } catch {
    return res.status(502).json({ error: '넥슨 API 호출에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }
}

function schedulerErrorMessage(status: number): string {
  switch (status) {
    case 400:
      // 넥슨 스케줄러 API는 키 소유 계정 밖의 캐릭터·미접속 캐릭터 조회 시 400을 반환한다
      return '조회할 수 없는 캐릭터입니다. 이 계정(API 키)의 캐릭터인지, 6/25 이후 접속했는지 확인해주세요.';
    case 403:
      return 'API 키 인증에 실패했습니다.';
    case 429:
      return '해당 키의 일일 조회 한도를 초과했습니다.';
    default:
      return `넥슨 API 오류 (${status})`;
  }
}
