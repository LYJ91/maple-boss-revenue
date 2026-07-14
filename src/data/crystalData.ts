import type { Boss, Difficulty, ResetType } from '../types';

/**
 * 결정석 가격 데이터
 *
 * 출처(공식): 메이플스토리 2026-06-18 업데이트 공지 "강렬한 힘의 결정 개편"
 *   https://maplestory.nexon.com/news/update/806
 *   - 검은 마법사의 변경 가격은 2026-07-01부터 적용 (공지 명시) → prices의 since로 처리
 *   - 같은 공지의 보스 개편: 이지 시그너스 삭제, 하드 힐라 / 카오스 핑크빈 / 노멀 시그너스가 일간 보스로 전환
 * 6/18 공지에 없는(=변동 없는) 가격은 직전 조정(2025-10-23) 이후 유지 중인 가격이다.
 *
 * 가격 갱신 방법은 README.md의 "가격 데이터 갱신" 절 참고.
 */
export const DATA_SOURCE = {
  label: '메이플스토리 공식 업데이트 공지 (2026-06-18 적용)',
  url: 'https://maplestory.nexon.com/news/update/806',
  /** 이 데이터가 공식 공지와 대조 확인된 날짜 */
  verifiedAt: '2026-07-06',
} as const;

/** 게임 규칙 상수 */
export const RULES = {
  /** 월드당 주간 결정석 판매 개수 제한 (일일+주간 합산) */
  worldWeeklySellLimit: 90,
  /** 캐릭터당 주간 보스 결정 판매 개수 제한 */
  weeklyBossSellLimitPerCharacter: 12,
  /** 계산기에서 관리할 최대 캐릭터 수 (체크리스트 연동 캐릭터를 수용할 만큼 넉넉히) */
  maxCharacters: 30,
  /** 월간 수익 계산 시 주간 수익에 곱하는 주 수 */
  weeksPerMonth: 4,
  maxPartySize: 6,
  maxDailyClearsPerWeek: 7,
} as const;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '이지',
  normal: '노멀',
  hard: '하드',
  chaos: '카오스',
  extreme: '익스트림',
};

export const RESET_LABEL: Record<ResetType, string> = {
  daily: '일일',
  weekly: '주간',
  monthly: '월간',
};

/** 직전 일괄 조정일 (6/18 공지에서 변동이 없었던 가격의 기준일) */
const PREV = '2025-10-23';
/** 2026-06-18 공지 적용일 */
const P618 = '2026-06-18';

const p = (price: number, since: string) => ({ price, since });

export const BOSSES: Boss[] = [
  // ─── 일일 보스 ───────────────────────────────────────────────
  {
    id: 'zakum',
    name: '자쿰',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(114_000, PREV)] },
      { difficulty: 'normal', prices: [p(349_000, PREV)] },
    ],
  },
  {
    id: 'papulatus',
    name: '파풀라투스',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(390_000, PREV)] },
      { difficulty: 'normal', prices: [p(1_200_000, P618)] },
    ],
  },
  {
    id: 'magnus',
    name: '매그너스',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(411_000, PREV)] },
      { difficulty: 'normal', prices: [p(1_160_000, P618)] },
    ],
  },
  {
    id: 'hilla',
    name: '힐라',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(455_000, PREV)] },
      // 2026-06-18부터 주간 → 일간 보스로 전환
      { difficulty: 'hard', prices: [p(1_280_000, P618)] },
    ],
  },
  {
    id: 'horntail',
    name: '혼테일',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(502_000, PREV)] },
      { difficulty: 'normal', prices: [p(576_000, PREV)] },
      { difficulty: 'chaos', prices: [p(770_000, PREV)] },
    ],
  },
  {
    id: 'bloody-queen',
    name: '블러디 퀸',
    reset: 'daily',
    maxPartySize: 6,
    variants: [{ difficulty: 'normal', prices: [p(551_000, PREV)] }],
  },
  {
    id: 'von-bon',
    name: '반반',
    reset: 'daily',
    maxPartySize: 6,
    variants: [{ difficulty: 'normal', prices: [p(551_000, PREV)] }],
  },
  {
    id: 'pierre',
    name: '피에르',
    reset: 'daily',
    maxPartySize: 6,
    variants: [{ difficulty: 'normal', prices: [p(551_000, PREV)] }],
  },
  {
    id: 'vellum',
    name: '벨룸',
    reset: 'daily',
    maxPartySize: 6,
    variants: [{ difficulty: 'normal', prices: [p(551_000, PREV)] }],
  },
  {
    id: 'von-leon',
    name: '반 레온',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(602_000, PREV)] },
      { difficulty: 'normal', prices: [p(830_000, PREV)] },
      { difficulty: 'hard', prices: [p(1_070_000, P618)] },
    ],
  },
  {
    id: 'arkarium',
    name: '아카이럼',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(656_000, PREV)] },
      { difficulty: 'normal', prices: [p(1_110_000, P618)] },
    ],
  },
  {
    id: 'kaung',
    name: '카웅',
    reset: 'daily',
    maxPartySize: 6,
    variants: [{ difficulty: 'normal', prices: [p(712_000, PREV)] }],
  },
  {
    id: 'pink-bean',
    name: '핑크빈',
    reset: 'daily',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(799_000, PREV)] },
      // 2026-06-18부터 주간 → 일간 보스로 전환
      { difficulty: 'chaos', prices: [p(1_320_000, P618)] },
    ],
  },
  {
    id: 'cygnus',
    name: '시그너스',
    reset: 'daily',
    maxPartySize: 6,
    // 이지 난이도는 2026-06-18 삭제. 노멀은 주간 → 일간 보스로 전환.
    variants: [{ difficulty: 'normal', prices: [p(1_360_000, P618)] }],
  },

  // ─── 주간 보스 ───────────────────────────────────────────────
  {
    id: 'zakum-weekly',
    name: '자쿰',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [{ difficulty: 'chaos', prices: [p(8_080_000, PREV)] }],
  },
  {
    id: 'bloody-queen-weekly',
    name: '블러디 퀸',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [{ difficulty: 'chaos', prices: [p(8_140_000, PREV)] }],
  },
  {
    id: 'von-bon-weekly',
    name: '반반',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [{ difficulty: 'chaos', prices: [p(8_150_000, PREV)] }],
  },
  {
    id: 'pierre-weekly',
    name: '피에르',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [{ difficulty: 'chaos', prices: [p(8_170_000, PREV)] }],
  },
  {
    id: 'magnus-weekly',
    name: '매그너스',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [{ difficulty: 'hard', prices: [p(8_560_000, PREV)] }],
  },
  {
    id: 'vellum-weekly',
    name: '벨룸',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [{ difficulty: 'chaos', prices: [p(9_280_000, PREV)] }],
  },
  {
    id: 'papulatus-weekly',
    name: '파풀라투스',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [{ difficulty: 'chaos', prices: [p(13_100_000, P618)] }],
  },
  {
    id: 'lotus',
    name: '스우',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(16_700_000, P618)] },
      { difficulty: 'hard', prices: [p(51_500_000, P618)] },
      { difficulty: 'extreme', prices: [p(574_000_000, P618)] },
    ],
  },
  {
    id: 'damien',
    name: '데미안',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(17_500_000, P618)] },
      { difficulty: 'hard', prices: [p(48_900_000, P618)] },
    ],
  },
  {
    id: 'guardian-angel-slime',
    name: '가디언 엔젤 슬라임',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(25_500_000, P618)] },
      { difficulty: 'chaos', prices: [p(75_100_000, P618)] },
    ],
  },
  {
    id: 'lucid',
    name: '루시드',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(29_800_000, P618)] },
      { difficulty: 'normal', prices: [p(35_600_000, P618)] },
      { difficulty: 'hard', prices: [p(62_900_000, P618)] },
    ],
  },
  {
    id: 'will',
    name: '윌',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(32_300_000, P618)] },
      { difficulty: 'normal', prices: [p(41_100_000, P618)] },
      { difficulty: 'hard', prices: [p(77_100_000, P618)] },
    ],
  },
  {
    id: 'dusk',
    name: '더스크',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(44_000_000, P618)] },
      { difficulty: 'chaos', prices: [p(69_800_000, P618)] },
    ],
  },
  {
    id: 'dunkel',
    name: '듄켈',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(47_500_000, P618)] },
      { difficulty: 'hard', prices: [p(94_400_000, P618)] },
    ],
  },
  {
    id: 'verus-hilla',
    name: '진 힐라',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(71_200_000, P618)] },
      { difficulty: 'hard', prices: [p(106_000_000, P618)] },
    ],
  },
  {
    id: 'seren',
    name: '선택받은 세렌',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(239_000_000, P618)] },
      { difficulty: 'hard', prices: [p(356_000_000, P618)] },
      { difficulty: 'extreme', prices: [p(2_835_000_000, P618)] },
    ],
  },
  {
    id: 'kalos',
    name: '감시자 칼로스',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(280_000_000, P618)] },
      { difficulty: 'normal', prices: [p(505_000_000, P618)] },
      { difficulty: 'chaos', prices: [p(1_273_000_000, P618)] },
      { difficulty: 'extreme', prices: [p(4_104_000_000, P618)] },
    ],
  },
  {
    id: 'adversary',
    name: '최초의 대적자',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(308_000_000, P618)] },
      { difficulty: 'normal', prices: [p(560_000_000, P618)] },
      { difficulty: 'hard', prices: [p(1_435_000_000, P618)] },
      { difficulty: 'extreme', prices: [p(4_712_000_000, P618)] },
    ],
  },
  {
    id: 'kaling',
    name: '카링',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'easy', prices: [p(377_000_000, P618)] },
      { difficulty: 'normal', prices: [p(678_000_000, P618)] },
      { difficulty: 'hard', prices: [p(1_739_000_000, P618)] },
      { difficulty: 'extreme', prices: [p(5_387_000_000, P618)] },
    ],
  },
  {
    id: 'brilliant-star',
    name: '찬란한 흉성',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(625_000_000, P618)] },
      { difficulty: 'hard', prices: [p(2_678_000_000, P618)] },
    ],
  },
  {
    id: 'limbo',
    name: '림보',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(1_026_000_000, P618)] },
      { difficulty: 'hard', prices: [p(2_385_000_000, P618)] },
    ],
  },
  {
    id: 'baldrix',
    name: '발드릭스',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(1_368_000_000, P618)] },
      { difficulty: 'hard', prices: [p(3_078_000_000, P618)] },
    ],
  },
  {
    id: 'jupiter',
    name: '유피테르',
    reset: 'weekly',
    maxPartySize: 6,
    variants: [
      { difficulty: 'normal', prices: [p(1_615_000_000, P618)] },
      { difficulty: 'hard', prices: [p(4_845_000_000, P618)] },
    ],
  },

  // ─── 월간 보스 ───────────────────────────────────────────────
  {
    id: 'black-mage',
    name: '검은 마법사',
    reset: 'monthly',
    maxPartySize: 6,
    variants: [
      {
        difficulty: 'hard',
        // 6/18 공지: 변경 가격은 2026-07-01부터 적용
        prices: [p(700_000_000, '2025-11-01'), p(665_000_000, '2026-07-01')],
      },
      {
        difficulty: 'extreme',
        prices: [p(9_200_000_000, '2025-11-01'), p(8_740_000_000, '2026-07-01')],
      },
    ],
  },
];

export const BOSS_MAP: ReadonlyMap<string, Boss> = new Map(BOSSES.map((b) => [b.id, b]));
