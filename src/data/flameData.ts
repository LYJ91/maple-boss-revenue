/**
 * 추가옵션(환생의 불꽃) 게임 데이터.
 *
 * 출처:
 * - 추옵 로직(2021-02-25 패치 이후): 옵션 테이블에서 무작위 4종 선택 후 단계 결정
 * - 불꽃별 단계 확률: 넥슨 공개 확률 (보스 장비는 +2단계)
 * - 수치 공식: 커뮤니티 실측으로 정리된 공식 (나무위키 '추가옵션' 문서 기준)
 *
 * 주의: 본 계산기는 "보스 전리품 장비(추옵 3~7단계)"를 기준으로 한다.
 * 일반 장비는 옵션 라인 수(1~4개)가 확률 비공개라 정확한 기대값 계산이 불가능해 v1에서는 제외.
 */

/** 추옵 옵션 종류 */
export type FlameOptionId =
  | 'str'
  | 'dex'
  | 'int'
  | 'luk'
  | 'str_dex'
  | 'str_int'
  | 'str_luk'
  | 'dex_int'
  | 'dex_luk'
  | 'int_luk'
  | 'max_hp'
  | 'max_mp'
  | 'level_reduce'
  | 'armor'
  | 'attack_power'
  | 'magic_power'
  | 'boss_damage' // 무기 전용 (90레벨 이상)
  | 'damage' // 무기 전용
  | 'all_stat' // 70레벨 이상
  | 'speed' // 방어구 전용
  | 'jump'; // 방어구 전용

/** 불꽃 종류별 단계 확률 (일반 장비 기준 단계, 보스 장비는 +2단계) */
export interface FlameType {
  id: 'black' | 'abyss';
  label: string;
  /** [단계, 확률] — 일반 장비 기준. 보스 장비는 단계+2로 적용 */
  tiers: [tier: number, p: number][];
}

export const FLAME_TYPES: FlameType[] = [
  {
    id: 'black',
    label: '검은 환생의 불꽃',
    // 일반 2~5단계 = 보스 4~7단계
    tiers: [
      [2, 0.29],
      [3, 0.45],
      [4, 0.25],
      [5, 0.01],
    ],
  },
  {
    id: 'abyss',
    label: '심연의 환생의 불꽃',
    // 일반 3~5단계 = 보스 5~7단계
    tiers: [
      [3, 0.63],
      [4, 0.34],
      [5, 0.03],
    ],
  },
];

/** 옵션 개수 (보스 장비는 항상 4개 고정) */
export const FLAME_LINE_COUNT = 4;

const SINGLE_STATS: FlameOptionId[] = ['str', 'dex', 'int', 'luk'];
const DUAL_STATS: FlameOptionId[] = [
  'str_dex',
  'str_int',
  'str_luk',
  'dex_int',
  'dex_luk',
  'int_luk',
];
const COMMON: FlameOptionId[] = [
  ...SINGLE_STATS,
  ...DUAL_STATS,
  'max_hp',
  'max_mp',
  'level_reduce',
  'armor',
  'attack_power',
  'magic_power',
  'all_stat',
];

/** 장비 종류·레벨에 따른 추옵 후보 풀 (19종) */
export function optionPool(isWeapon: boolean, itemLevel: number): FlameOptionId[] {
  const pool: FlameOptionId[] = COMMON.filter((id) => {
    if (id === 'all_stat') return itemLevel >= 70; // 올스탯%는 70레벨 이상
    return true;
  });
  if (isWeapon) {
    if (itemLevel >= 90) pool.push('boss_damage'); // 보공은 90레벨 이상 무기
    pool.push('damage');
  } else {
    pool.push('speed', 'jump');
  }
  return pool;
}

/** 옵션 1개가 부여하는 실제 효과 */
export interface FlameEffect {
  str?: number;
  dex?: number;
  int?: number;
  luk?: number;
  maxHp?: number;
  maxMp?: number;
  attack?: number;
  magic?: number;
  armor?: number;
  allStatPct?: number;
  bossDamagePct?: number;
  damagePct?: number;
  levelReduce?: number;
  speed?: number;
  jump?: number;
}

/** 단일 스탯 계수: (장비레벨/20 몫 + 1). 250제는 220으로 취급 */
function singleStatUnit(itemLevel: number): number {
  const lv = itemLevel >= 250 ? 220 : itemLevel;
  return Math.floor(lv / 20) + 1;
}

/** 이중 스탯 계수: (장비레벨/40 몫 + 1). 250제는 220으로 취급(추정, 단일과 동일 규칙 적용) */
function dualStatUnit(itemLevel: number): number {
  const lv = itemLevel >= 250 ? 220 : itemLevel;
  return Math.floor(lv / 40) + 1;
}

/**
 * 무기 공/마 추옵: 순수 공마 × (레벨/40 몫 + 1) × 단계 × 1.1^(단계-3) % (올림)
 */
export function weaponAttackFlame(
  baseAttack: number,
  itemLevel: number,
  tier: number,
): number {
  const pct =
    (Math.floor(itemLevel / 40) + 1) * tier * Math.pow(1.1, tier - 3);
  return Math.ceil((baseAttack * pct) / 100);
}

/** MaxHP/MP: 장비레벨(일의 자리 버림) × 3 × 단계. 에테르넬(250제)은 233.33으로 취급 */
function hpUnit(itemLevel: number): number {
  if (itemLevel >= 250) return 233.3333333333;
  return Math.floor(itemLevel / 10) * 10;
}

/**
 * 옵션 + 단계 → 실제 효과 수치.
 * @param baseAttack 무기 순수 공격력/마력 (무기 공마 옵션 계산용, 없으면 0)
 */
export function optionEffect(
  id: FlameOptionId,
  tier: number,
  itemLevel: number,
  isWeapon: boolean,
  baseAttack: number,
  baseMagic: number,
): FlameEffect {
  const s = singleStatUnit(itemLevel) * tier;
  const d = dualStatUnit(itemLevel) * tier;
  switch (id) {
    case 'str':
      return { str: s };
    case 'dex':
      return { dex: s };
    case 'int':
      return { int: s };
    case 'luk':
      return { luk: s };
    case 'str_dex':
      return { str: d, dex: d };
    case 'str_int':
      return { str: d, int: d };
    case 'str_luk':
      return { str: d, luk: d };
    case 'dex_int':
      return { dex: d, int: d };
    case 'dex_luk':
      return { dex: d, luk: d };
    case 'int_luk':
      return { int: d, luk: d };
    case 'max_hp':
      return { maxHp: Math.round(hpUnit(itemLevel) * 3 * tier) };
    case 'max_mp':
      return { maxMp: Math.round(hpUnit(itemLevel) * 3 * tier) };
    case 'level_reduce':
      return { levelReduce: 5 * tier };
    case 'armor':
      return { armor: tier };
    case 'attack_power':
      return isWeapon
        ? { attack: weaponAttackFlame(baseAttack, itemLevel, tier) }
        : { attack: tier };
    case 'magic_power':
      return isWeapon
        ? { magic: weaponAttackFlame(baseMagic, itemLevel, tier) }
        : { magic: tier };
    case 'boss_damage':
      return { bossDamagePct: 2 * tier };
    case 'damage':
      return { damagePct: tier };
    case 'all_stat':
      return { allStatPct: tier };
    case 'speed':
      return { speed: tier };
    case 'jump':
      return { jump: tier };
  }
}

/** 직업 프로필 — 어떤 옵션이 유효한지 */
export interface JobProfile {
  /** 주스탯 (제논은 3개) */
  main: ('str' | 'dex' | 'int' | 'luk')[];
  /** 부스탯 */
  sub: ('str' | 'dex' | 'int' | 'luk')[];
  /** 유효 공격 종류 */
  attackType: 'attack' | 'magic';
  /** 데몬어벤져 여부 (MaxHP가 주스탯) */
  useHp: boolean;
}

/**
 * 환산 가중치 (환산 주스탯 1 기준의 근사 계수).
 * 스펙·직업에 따라 달라지는 값이라 "참고용"이며, 필요 시 이 표만 수정하면 된다.
 */
export const SCORE_WEIGHTS = {
  mainStat: 1,
  subStat: 0.1,
  /** 유효 공/마 1당 주스탯 환산 (통상 4로 취급) */
  attack: 4,
  /** 올스탯 1%당 주스탯 환산 (통상 10으로 취급) */
  allStatPct: 10,
  /** 제논은 3스탯 직업이라 올스탯% 효율이 더 높음 */
  allStatPctXenon: 18,
  /** 데몬어벤져 MaxHP 환산 (HP 17.5 ≈ 주스탯 1로 근사) */
  maxHpAvenger: 1 / 17.5,
  /** 무기 전용: 데미지/보공 1%당 주스탯 환산 (근사) */
  damagePct: 2,
  bossDamagePct: 2,
} as const;

/** 직업명 → 주스탯 매핑. 여기 없는 직업은 스탯 수치로 추론(fallback) */
const JOB_MAIN_STAT: Record<string, 'str' | 'dex' | 'int' | 'luk' | 'hp' | 'xenon'> = {
  // 전사 (STR)
  히어로: 'str',
  팔라딘: 'str',
  다크나이트: 'str',
  소울마스터: 'str',
  미하일: 'str',
  블래스터: 'str',
  데몬슬레이어: 'str',
  아란: 'str',
  카이저: 'str',
  아델: 'str',
  제로: 'str',
  // 마법사 (INT)
  '아크메이지(불,독)': 'int',
  '아크메이지(썬,콜)': 'int',
  비숍: 'int',
  플레임위자드: 'int',
  배틀메이지: 'int',
  에반: 'int',
  루미너스: 'int',
  일리움: 'int',
  라라: 'int',
  키네시스: 'int',
  // 궁수 (DEX)
  보우마스터: 'dex',
  신궁: 'dex',
  패스파인더: 'dex',
  윈드브레이커: 'dex',
  와일드헌터: 'dex',
  메르세데스: 'dex',
  카인: 'dex',
  // 도적 (LUK)
  나이트로드: 'luk',
  섀도어: 'luk',
  듀얼블레이드: 'luk',
  나이트워커: 'luk',
  팬텀: 'luk',
  카데나: 'luk',
  칼리: 'luk',
  호영: 'luk',
  // 해적
  바이퍼: 'str',
  캐논마스터: 'str',
  캐논슈터: 'str',
  스트라이커: 'str',
  은월: 'str',
  아크: 'str',
  렌: 'str',
  캡틴: 'dex',
  메카닉: 'dex',
  엔젤릭버스터: 'dex',
  // 특수
  제논: 'xenon',
  데몬어벤져: 'hp',
};

/** 부스탯 짝 */
const SUB_STAT: Record<'str' | 'dex' | 'int' | 'luk', 'str' | 'dex' | 'int' | 'luk'> = {
  str: 'dex',
  dex: 'str',
  int: 'luk',
  luk: 'dex',
};

/**
 * 직업명으로 프로필 생성. 매핑에 없으면 스탯 수치(STR/DEX/INT/LUK 중 최대)로 추론.
 * @param finalStats 넥슨 stat 응답의 final_stat에서 뽑은 {STR, DEX, INT, LUK} (fallback용)
 */
export function jobProfile(
  jobName: string | undefined,
  finalStats?: { str?: number; dex?: number; int?: number; luk?: number },
): JobProfile {
  const mapped = jobName ? JOB_MAIN_STAT[jobName.trim()] : undefined;

  if (mapped === 'xenon') {
    return { main: ['str', 'dex', 'luk'], sub: [], attackType: 'attack', useHp: false };
  }
  if (mapped === 'hp') {
    return { main: [], sub: [], attackType: 'attack', useHp: true };
  }

  let main: 'str' | 'dex' | 'int' | 'luk' | undefined = mapped;
  if (!main && finalStats) {
    const entries: ['str' | 'dex' | 'int' | 'luk', number][] = [
      ['str', finalStats.str ?? 0],
      ['dex', finalStats.dex ?? 0],
      ['int', finalStats.int ?? 0],
      ['luk', finalStats.luk ?? 0],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    if (entries[0][1] > 0) main = entries[0][0];
  }
  if (!main) main = 'str';

  return {
    main: [main],
    sub: [SUB_STAT[main]],
    attackType: main === 'int' ? 'magic' : 'attack',
    useHp: false,
  };
}

/** 효과 → 환산 주스탯 점수 */
export function effectScore(
  e: FlameEffect,
  profile: JobProfile,
  isWeapon: boolean,
): number {
  const w = SCORE_WEIGHTS;
  let score = 0;
  const stats = { str: e.str ?? 0, dex: e.dex ?? 0, int: e.int ?? 0, luk: e.luk ?? 0 };

  const isXenon = profile.main.length === 3;
  for (const key of profile.main) score += stats[key] * w.mainStat;
  for (const key of profile.sub) score += stats[key] * w.subStat;

  if (profile.useHp) {
    score += (e.maxHp ?? 0) * w.maxHpAvenger;
    score += (e.attack ?? 0) * w.attack;
    // 데몬어벤져의 올스탯%는 HP에 미적용이라 잔스탯 수준
    score += (e.allStatPct ?? 0) * 0.5;
  } else {
    const att = profile.attackType === 'magic' ? (e.magic ?? 0) : (e.attack ?? 0);
    score += att * w.attack;
    score += (e.allStatPct ?? 0) * (isXenon ? w.allStatPctXenon : w.allStatPct);
  }

  if (isWeapon) {
    score += (e.bossDamagePct ?? 0) * w.bossDamagePct;
    score += (e.damagePct ?? 0) * w.damagePct;
  }
  return score;
}

/** 분석 대상 장비 슬롯 (추옵이 존재할 수 있는 슬롯만) */
export const ANALYZABLE_SLOTS = new Set([
  '모자',
  '상의',
  '하의',
  '한벌옷',
  '신발',
  '장갑',
  '망토',
  '어깨장식',
  '무기',
  '얼굴장식',
  '눈장식',
  '귀고리',
  '펜던트',
  '펜던트2',
  '벨트',
  '포켓 아이템',
  '기계 심장',
  '반지1',
  '반지2',
  '반지3',
  '반지4',
]);
