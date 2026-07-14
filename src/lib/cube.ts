/**
 * 큐브 기대값 분석 (목표 유효 n줄까지).
 *
 * - 줄별 동일 등급 확률: 넥슨 공개 표
 * - 동일 등급에서 유효일 확률: 카테고리 근사 상수
 * - P(유효 줄 수 ≥ 목표) → 기대 횟수 1/P
 * - 이미 목표 이상이면 expectedTries = 0
 */

import {
  CUBE_TYPES,
  SAME_GRADE_LINE_P,
  SPECIALTY_GIVEN_SAME_GRADE,
  USEFUL_GIVEN_SAME_GRADE,
  cubeSlotCategory,
  gradeFromApi,
  type CubeId,
  type CubeSlotCategory,
  type CubeType,
  type PotentialGrade,
} from '../data/cubeData';
import type { JobProfile } from '../data/flameData';

export interface CubeItemInput {
  slot: string;
  part?: string;
  name: string;
  icon: string;
  potentialGrade: string | null;
  additionalGrade: string | null;
  potential: (string | null)[];
  additional: (string | null)[];
}

export interface CubeAnalysis {
  slot: string;
  name: string;
  icon: string;
  category: CubeSlotCategory | null;
  supported: boolean;
  note?: string;
  /** 현재 유효 줄 수 (본잠 또는 에디) */
  usefulLines: number;
  /** 목표 유효 줄 수 (장갑/모자 전용은 1로 고정될 수 있음) */
  targetLines: number;
  /** 목표 달성 여부 */
  done: boolean;
  /** 1회로 목표 이상일 확률 */
  pReach: number;
  /** 기대 재설정 횟수 (완료면 0, 불가능이면 Infinity) */
  expectedTries: number;
  /** 현재 유효 옵션 요약 */
  usefulLabels: string[];
}

export type LineKind =
  | 'att_pct'
  | 'boss'
  | 'ied'
  | 'main_stat_pct'
  | 'all_stat_pct'
  | 'hp_pct'
  | 'crit_dmg'
  | 'cooldown'
  | 'other';

export interface ParsedLine {
  text: string;
  kind: LineKind;
  useful: boolean;
  label: string;
}

const STAT_PCT: Record<'str' | 'dex' | 'int' | 'luk', RegExp> = {
  str: /STR\s*:\s*\+(\d+)%|STR\s*\+(\d+)%/i,
  dex: /DEX\s*:\s*\+(\d+)%|DEX\s*\+(\d+)%/i,
  int: /INT\s*:\s*\+(\d+)%|INT\s*\+(\d+)%/i,
  luk: /LUK\s*:\s*\+(\d+)%|LUK\s*\+(\d+)%/i,
};

/** 잠재 옵션 한 줄을 파싱해 유효 여부 판정 */
export function parsePotentialLine(
  text: string | null | undefined,
  category: CubeSlotCategory,
  profile: JobProfile,
): ParsedLine | null {
  if (!text?.trim()) return null;
  const t = text.trim();

  if (/크리티컬\s*데미지|크리티컬\s*데미지\s*\+/.test(t)) {
    const useful = category === 'gloves';
    return { text: t, kind: 'crit_dmg', useful, label: '크뎀' };
  }
  if (/재사용\s*대기시간|쿨타임|모든\s*스킬의\s*재사용/.test(t)) {
    const useful = category === 'hat';
    return { text: t, kind: 'cooldown', useful, label: '쿨감' };
  }
  if (/몬스터\s*방어율\s*무시/.test(t)) {
    const useful =
      category === 'weapon' || category === 'secondary' || category === 'emblem';
    return { text: t, kind: 'ied', useful, label: '방무' };
  }
  if (/보스\s*몬스터.*데미지|보스\s*몬스터\s*공격\s*시/.test(t)) {
    const useful = category === 'weapon' || category === 'secondary';
    return { text: t, kind: 'boss', useful, label: '보공' };
  }
  if (/공격력\s*\+(\d+)%/.test(t) || /마력\s*\+(\d+)%/.test(t)) {
    const isMagic = /마력\s*\+(\d+)%/.test(t);
    const combat =
      category === 'weapon' || category === 'secondary' || category === 'emblem';
    const useful =
      combat &&
      (profile.attackType === 'magic' ? isMagic : !isMagic);
    return {
      text: t,
      kind: 'att_pct',
      useful,
      label: isMagic ? '마력%' : '공%',
    };
  }
  if (/올스탯\s*:\s*\+(\d+)%|올스탯\s*\+(\d+)%|모든\s*스탯\s*\+(\d+)%/.test(t)) {
    const useful =
      !profile.useHp &&
      (category === 'armor' || category === 'accessory' || category === 'gloves' || category === 'hat');
    return { text: t, kind: 'all_stat_pct', useful, label: '올스탯%' };
  }
  if (/최대\s*HP\s*\+(\d+)%|MaxHP\s*\+(\d+)%/i.test(t)) {
    const useful =
      profile.useHp &&
      (category === 'armor' || category === 'accessory' || category === 'gloves' || category === 'hat');
    return { text: t, kind: 'hp_pct', useful, label: 'HP%' };
  }

  for (const key of profile.main) {
    if (STAT_PCT[key].test(t)) {
      const useful =
        category === 'armor' ||
        category === 'accessory' ||
        category === 'gloves' ||
        category === 'hat';
      return {
        text: t,
        kind: 'main_stat_pct',
        useful,
        label: `${key.toUpperCase()}%`,
      };
    }
  }

  return { text: t, kind: 'other', useful: false, label: '기타' };
}

export function countUsefulLines(
  lines: (string | null)[],
  category: CubeSlotCategory,
  profile: JobProfile,
): { count: number; labels: string[] } {
  const labels: string[] = [];
  let count = 0;
  for (const line of lines) {
    const parsed = parsePotentialLine(line, category, profile);
    if (parsed?.useful) {
      count += 1;
      labels.push(parsed.label);
    }
  }
  return { count, labels };
}

/** 장갑/모자 레전: 전용 옵션 1줄이면 목표 충족 */
export function usesSpecialtyTarget(
  category: CubeSlotCategory,
  cube: CubeType,
): boolean {
  return (
    cube.targetGrade === 'legendary' &&
    cube.potKind === 'main' &&
    (category === 'gloves' || category === 'hat')
  );
}

/**
 * 한 줄이 유효일 확률 = P(동일 등급) × P(유효|동일 등급)
 */
export function lineUsefulProbabilities(
  cubeId: CubeId,
  grade: PotentialGrade,
  category: CubeSlotCategory,
  specialty: boolean,
): [number, number, number] {
  const same = SAME_GRADE_LINE_P[cubeId]?.[grade];
  if (!same) return [0, 0, 0];
  const usefulRate = specialty
    ? (SPECIALTY_GIVEN_SAME_GRADE[category] ?? 0.05)
    : (USEFUL_GIVEN_SAME_GRADE[category] ?? 0.2);
  return [same[0] * usefulRate, same[1] * usefulRate, same[2] * usefulRate];
}

/** 독립 가정 하에 P(유효 줄 수 ≥ target) */
export function probabilityReachTarget(
  linePs: [number, number, number],
  target: number,
): number {
  if (target <= 0) return 1;
  if (target > 3) return 0;
  let total = 0;
  for (let mask = 0; mask < 8; mask++) {
    let useful = 0;
    let p = 1;
    for (let i = 0; i < 3; i++) {
      const hit = (mask >> i) & 1;
      if (hit) {
        useful += 1;
        p *= linePs[i];
      } else {
        p *= 1 - linePs[i];
      }
    }
    if (useful >= target) total += p;
  }
  return Math.min(1, Math.max(0, total));
}

export function analyzeCubes(
  items: CubeItemInput[],
  profile: JobProfile,
  cube: CubeType,
  targetLines: number,
): CubeAnalysis[] {
  const results = items.map((item) => analyzeOne(item, profile, cube, targetLines));
  return results.sort((a, b) => {
    if (a.supported !== b.supported) return a.supported ? -1 : 1;
    if (a.done !== b.done) return a.done ? 1 : -1; // 미완료 우선
    return a.expectedTries - b.expectedTries;
  });
}

function analyzeOne(
  item: CubeItemInput,
  profile: JobProfile,
  cube: CubeType,
  targetLines: number,
): CubeAnalysis {
  const category = cubeSlotCategory(item.slot, item.part);
  const base = {
    slot: item.slot,
    name: item.name,
    icon: item.icon,
    category,
    usefulLines: 0,
    targetLines,
    done: false,
    pReach: 0,
    expectedTries: Infinity as number,
    usefulLabels: [] as string[],
  };

  if (!category) {
    return { ...base, supported: false, note: '분석 대상 슬롯이 아님' };
  }

  const gradeStr = cube.potKind === 'main' ? item.potentialGrade : item.additionalGrade;
  const grade = gradeFromApi(gradeStr);
  if (grade !== cube.targetGrade) {
    const need =
      cube.targetGrade === 'unique'
        ? '유니크'
        : cube.targetGrade === 'legendary'
          ? '레전드리'
          : '에픽';
    const kind = cube.potKind === 'main' ? '본잠' : '에디';
    return {
      ...base,
      supported: false,
      note: `${kind} ${need}만 분석 (${gradeStr ?? '없음'})`,
    };
  }

  const lines = cube.potKind === 'main' ? item.potential : item.additional;
  const specialty = usesSpecialtyTarget(category, cube);
  const effectiveTarget = specialty ? 1 : Math.min(3, Math.max(1, targetLines));

  const { count, labels } = specialty
    ? countSpecialty(lines, category, profile)
    : countUsefulLines(lines, category, profile);

  const done = count >= effectiveTarget;
  if (done) {
    return {
      ...base,
      supported: true,
      usefulLines: count,
      targetLines: effectiveTarget,
      done: true,
      pReach: 1,
      expectedTries: 0,
      usefulLabels: labels,
    };
  }

  const linePs = lineUsefulProbabilities(cube.id, grade, category, specialty);
  const pReach = probabilityReachTarget(linePs, effectiveTarget);
  const expectedTries = pReach > 0 ? 1 / pReach : Infinity;

  return {
    ...base,
    supported: true,
    usefulLines: count,
    targetLines: effectiveTarget,
    done: false,
    pReach,
    expectedTries,
    usefulLabels: labels,
  };
}

function countSpecialty(
  lines: (string | null)[],
  category: CubeSlotCategory,
  profile: JobProfile,
): { count: number; labels: string[] } {
  const labels: string[] = [];
  let count = 0;
  for (const line of lines) {
    const parsed = parsePotentialLine(line, category, profile);
    if (!parsed?.useful) continue;
    if (category === 'gloves' && parsed.kind === 'crit_dmg') {
      count += 1;
      labels.push(parsed.label);
    } else if (category === 'hat' && parsed.kind === 'cooldown') {
      count += 1;
      labels.push(parsed.label);
    }
  }
  return { count, labels };
}

export function cubeById(id: CubeId): CubeType {
  return CUBE_TYPES.find((c) => c.id === id)!;
}
