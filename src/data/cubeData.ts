/**
 * 큐브 종류·슬롯 분류.
 *
 * 옵션별 등장 확률·줄 등급 확률은 mesu.live(공식 표 기반) 스냅샷
 * `mesuCubeOptions.json` 을 사용한다.
 * - 메멘토 실버 = 장인의 큐브
 * - 메멘토 골드 = 명장의 큐브
 * - 블랙 = 잠재능력 재설정/블랙 큐브
 * - 메멘토 브론즈 = 수상한 에디셔널 큐브
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
  potKind: 'main' | 'additional';
  targetGrade: PotentialGrade;
}

export const CUBE_TYPES: CubeType[] = [
  { id: 'silver', label: '메멘토 실버', potKind: 'main', targetGrade: 'unique' },
  { id: 'gold', label: '메멘토 골드', potKind: 'main', targetGrade: 'legendary' },
  { id: 'black', label: '블랙 큐브', potKind: 'main', targetGrade: 'legendary' },
  { id: 'bronze', label: '메멘토 브론즈', potKind: 'additional', targetGrade: 'epic' },
];

export const GRADE_API_KEY: Record<PotentialGrade, string> = {
  rare: 'RARE',
  epic: 'EPIC',
  unique: 'UNIQUE',
  legendary: 'LEGENDARY',
};

/** 잠재 등급의 한 단계 아래 (레어의 아래는 노멀 → 옵션 없음) */
export function lowerPotentialGrade(grade: PotentialGrade): PotentialGrade | null {
  switch (grade) {
    case 'legendary':
      return 'unique';
    case 'unique':
      return 'epic';
    case 'epic':
      return 'rare';
    default:
      return null;
  }
}

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
  if (partKey.includes('무기') && !partKey.includes('보조')) return 'weapon';
  return null;
}

/**
 * 넥슨 슬롯/파트 → mesu.live equip 키.
 * 표에 없는 슬롯(포켓 등)은 null.
 */
export function mesuEquipKey(slot: string, part?: string): string | null {
  const s = slot.trim();
  const p = (part ?? '').trim();
  if (s === '무기' || p === '무기') return '무기';
  if (s === '엠블렘' || p === '엠블렘') return '엠블렘';
  if (s === '방패' || p === '방패') return '방패';
  if (p.includes('포스실드') || p.includes('소울링') || s === '포스실드' || s === '소울링') {
    return '포스실드, 소울링';
  }
  if (s === '보조무기' || p.includes('보조')) return '보조무기(포스실드, 소울링 제외)';
  if (s === '모자' || p === '모자') return '모자';
  if (s === '상의' || p === '상의') return '상의';
  if (s === '한벌옷' || p === '한벌옷') return '한벌옷';
  if (s === '하의' || p === '하의') return '하의';
  if (s === '신발' || p === '신발') return '신발';
  if (s === '장갑' || p === '장갑') return '장갑';
  if (s === '망토' || p === '망토') return '망토';
  if (s === '벨트' || p === '벨트') return '벨트';
  if (s === '어깨장식' || p === '어깨장식') return '어깨장식';
  if (s === '얼굴장식' || p === '얼굴장식') return '얼굴장식';
  if (s === '눈장식' || p === '눈장식') return '눈장식';
  if (s === '귀고리' || p === '귀고리') return '귀고리';
  if (s.startsWith('반지') || p === '반지') return '반지';
  if (s.startsWith('펜던트') || p === '펜던트') return '펜던트';
  if (s === '기계 심장' || p === '기계심장' || p === '기계 심장') return '기계심장';
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
