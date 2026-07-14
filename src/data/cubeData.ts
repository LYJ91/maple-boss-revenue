/**
 * 큐브 줄별 등급 확률 + 유효 옵션 근사 비율.
 *
 * 줄 등급 확률 출처 (넥슨 공식 확률형 아이템 가이드):
 * - 메멘토 실버 = 장인의 큐브
 * - 메멘토 골드 = 명장의 큐브
 * - 블랙 큐브
 * - 메멘토 브론즈 에디 = 수상한 에디셔널 큐브
 *
 * 같은 등급 안에서 ‘유효 줄’이 뜰 비율은 옵션 종류표 전수가 비현실적이라
 * 카테고리별 근사 상수로 둔다 (우선순위 정렬용).
 */

export type PotentialGrade = 'rare' | 'epic' | 'unique' | 'legendary';

export type CubeId = 'silver' | 'gold' | 'black' | 'bronze';

export type CubeSlotCategory =
  | 'weapon'
  | 'secondary'
  | 'emblem'
  | 'armor'
  | 'accessory'
  | 'gloves'
  | 'hat';

export interface CubeType {
  id: CubeId;
  label: string;
  /** 본잠 / 에디 */
  potKind: 'main' | 'additional';
  /** 이 큐브로 분석하는 대상 등급 */
  targetGrade: PotentialGrade;
}

export const CUBE_TYPES: CubeType[] = [
  { id: 'silver', label: '메멘토 실버', potKind: 'main', targetGrade: 'unique' },
  { id: 'gold', label: '메멘토 골드', potKind: 'main', targetGrade: 'legendary' },
  { id: 'black', label: '블랙 큐브', potKind: 'main', targetGrade: 'legendary' },
  { id: 'bronze', label: '메멘토 브론즈', potKind: 'additional', targetGrade: 'epic' },
];

/**
 * 장비 잠재 등급이 grade일 때, 큐브 1회 결과의 줄별 동일 등급(또는 상한 등급) 확률.
 * index 0/1/2 = 첫/둘/셋 번째 옵션.
 */
export const SAME_GRADE_LINE_P: Record<CubeId, Partial<Record<PotentialGrade, [number, number, number]>>> = {
  // 장인의 큐브 / 실버
  silver: {
    unique: [1, 0.011858, 0.011858],
    epic: [1, 0.047619, 0.047619],
    rare: [1, 0.166667, 0.166667],
  },
  // 명장의 큐브 / 골드
  gold: {
    legendary: [1, 0.001996, 0.001996],
    unique: [1, 0.016959, 0.016959],
    epic: [1, 0.079994, 0.079994],
    rare: [1, 0.166667, 0.166667],
  },
  // 블랙 큐브
  black: {
    legendary: [1, 0.2, 0.05],
    unique: [1, 0.2, 0.05],
    epic: [1, 0.2, 0.05],
    rare: [1, 0.2, 0.05],
  },
  // 수상한/브론즈 에디셔널
  bronze: {
    epic: [1, 0.004, 0.004],
    rare: [1, 0.019608, 0.019608],
  },
};

/**
 * 동일 등급 줄이 떴을 때 그 줄이 ‘유효’일 근사 확률.
 * (옵션 풀에서 유효 종류 비중 추정 — 우선순위용 근사치)
 */
export const USEFUL_GIVEN_SAME_GRADE: Record<CubeSlotCategory, number> = {
  weapon: 0.32,
  secondary: 0.3,
  emblem: 0.28,
  armor: 0.18,
  accessory: 0.18,
  gloves: 0.16,
  hat: 0.16,
};

/** 레전 장갑 크리뎀 / 모자 쿨감 — 동일 등급 줄에서 전용 옵션이 뜰 근사 확률 */
export const SPECIALTY_GIVEN_SAME_GRADE: Partial<Record<CubeSlotCategory, number>> = {
  gloves: 0.07,
  hat: 0.055,
};

const WEAPON_SLOTS = new Set(['무기']);
const SECONDARY_SLOTS = new Set(['보조무기', '방패', '포스실드', '소울링']);
const EMBLEM_SLOTS = new Set(['엠블렘']);
const GLOVE_SLOTS = new Set(['장갑']);
const HAT_SLOTS = new Set(['모자']);
const ARMOR_SLOTS = new Set([
  '상의',
  '하의',
  '한벌옷',
  '신발',
  '망토',
  '어깨장식',
  '벨트',
]);
const ACCESSORY_SLOTS = new Set([
  '얼굴장식',
  '눈장식',
  '귀고리',
  '펜던트',
  '펜던트2',
  '반지1',
  '반지2',
  '반지3',
  '반지4',
  '포켓 아이템',
  '기계 심장',
  '뱃지',
  '훈장',
]);

export function cubeSlotCategory(slot: string, part?: string): CubeSlotCategory | null {
  const key = slot.trim();
  const partKey = (part ?? '').trim();
  if (WEAPON_SLOTS.has(key) || partKey === '무기') return 'weapon';
  if (SECONDARY_SLOTS.has(key) || partKey.includes('보조') || partKey === '방패') return 'secondary';
  if (EMBLEM_SLOTS.has(key) || partKey === '엠블렘') return 'emblem';
  if (GLOVE_SLOTS.has(key) || partKey === '장갑') return 'gloves';
  if (HAT_SLOTS.has(key) || partKey === '모자') return 'hat';
  if (ARMOR_SLOTS.has(key) || ARMOR_SLOTS.has(partKey)) return 'armor';
  if (ACCESSORY_SLOTS.has(key) || ACCESSORY_SLOTS.has(partKey)) return 'accessory';
  // part 이름으로 한 번 더
  if (partKey.includes('무기') && !partKey.includes('보조')) return 'weapon';
  return null;
}

export function gradeFromApi(grade: string | null | undefined): PotentialGrade | null {
  switch (grade) {
    case '레어':
      return 'rare';
    case '에픽':
      return 'epic';
    case '유니크':
      return 'unique';
    case '레전드리':
      return 'legendary';
    default:
      return null;
  }
}
