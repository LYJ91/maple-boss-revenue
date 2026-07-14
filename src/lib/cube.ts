/**
 * 큐브 기대값 분석 (목표 유효 n줄까지).
 *
 * 옵션·줄 등급 확률: mesu.live 스냅샷 (공식 공개 확률 기반).
 * P(줄이 유효) = P(현재등급)×유효비율(현재풀) + P(하향등급)×유효비율(하향풀)
 */

import mesuTables from '../data/mesuCubeOptions.json';
import {
  CUBE_TYPES,
  GRADE_API_KEY,
  cubeSlotCategory,
  gradeFromApi,
  lowerPotentialGrade,
  mesuEquipKey,
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
  usefulLines: number;
  targetLines: number;
  done: boolean;
  pReach: number;
  expectedTries: number;
  usefulLabels: string[];
}

export type LineKind =
  | 'att_pct'
  | 'att_flat'
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

type MesuOption = { name: string; probability: number };
type MesuGradeLine = {
  currentGradeProb: number;
  lowerGradeProb: number | null;
  line: number;
};

type MesuRoot = {
  methods: Record<string, Record<string, Record<string, MesuOption[]>>>;
  optionGrades: Record<string, Record<string, MesuGradeLine[]>>;
};

const MESU = mesuTables as MesuRoot;

const STAT_PCT: Record<'str' | 'dex' | 'int' | 'luk', RegExp> = {
  str: /STR\s*:\s*\+(\d+)%|STR\s*\+(\d+)%/i,
  dex: /DEX\s*:\s*\+(\d+)%|DEX\s*\+(\d+)%/i,
  int: /INT\s*:\s*\+(\d+)%|INT\s*\+(\d+)%/i,
  luk: /LUK\s*:\s*\+(\d+)%|LUK\s*\+(\d+)%/i,
};

const ARMORISH: CubeSlotCategory[] = ['armor', 'accessory', 'gloves', 'hat'];

function wantsMagic(profile: JobProfile): boolean {
  return profile.attackType === 'magic';
}

function matchesAttackType(isMagic: boolean, profile: JobProfile): boolean {
  return wantsMagic(profile) ? isMagic : !isMagic;
}

/** 잠재 옵션 한 줄을 파싱해 유효 여부 판정 */
export function parsePotentialLine(
  text: string | null | undefined,
  category: CubeSlotCategory,
  profile: JobProfile,
  specialtyOnly = false,
  potKind: 'main' | 'additional' = 'main',
): ParsedLine | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  const addi = potKind === 'additional';

  if (/크리티컬\s*데미지/.test(t)) {
    const useful = category === 'gloves';
    return { text: t, kind: 'crit_dmg', useful, label: '크뎀' };
  }
  if (/재사용\s*대기시간|쿨타임|모든\s*스킬의\s*재사용/.test(t)) {
    const useful = category === 'hat';
    return { text: t, kind: 'cooldown', useful, label: '쿨감' };
  }
  if (/몬스터\s*방어율\s*무시/.test(t)) {
    const useful =
      !specialtyOnly &&
      (category === 'weapon' || category === 'secondary' || category === 'emblem');
    return { text: t, kind: 'ied', useful, label: '방무' };
  }
  if (/보스\s*몬스터.*데미지|보스\s*몬스터\s*공격\s*시/.test(t)) {
    const useful =
      !specialtyOnly && (category === 'weapon' || category === 'secondary');
    return { text: t, kind: 'boss', useful, label: '보공' };
  }

  // 퍼센트 공/마 (평공 +32 등은 아래 flat에서 처리)
  if (/공격력\s*:?\s*\+(\d+)\s*%/.test(t) || /마력\s*:?\s*\+(\d+)\s*%/.test(t)) {
    const isMagic = /마력\s*:?\s*\+(\d+)\s*%/.test(t);
    const combat =
      category === 'weapon' || category === 'secondary' || category === 'emblem';
    // 에디셔널: 전 부위 직업 공%/마력% 유효 / 본잠: 전투 슬롯만
    const useful =
      !specialtyOnly &&
      matchesAttackType(isMagic, profile) &&
      (addi || combat);
    return {
      text: t,
      kind: 'att_pct',
      useful,
      label: isMagic ? '마력%' : '공%',
    };
  }

  // 에디셔널 방어구·장신: 평공/평마도 유효 (예: 상의 공격력 : +11)
  if (addi && !specialtyOnly && ARMORISH.includes(category)) {
    const attFlat = /^공격력\s*:?\s*\+(\d+)\s*$/.test(t);
    const magFlat = /^마력\s*:?\s*\+(\d+)\s*$/.test(t);
    if (attFlat || magFlat) {
      const useful = matchesAttackType(magFlat, profile);
      return {
        text: t,
        kind: 'att_flat',
        useful,
        label: magFlat ? '마력' : '공격력',
      };
    }
  }

  if (/올스탯\s*:?\s*\+(\d+)%|모든\s*스탯\s*\+(\d+)%/.test(t)) {
    // 에디셔널: 전 부위 올스탯% 유효 / 본잠: 방어·장신 계열만
    const useful =
      !specialtyOnly &&
      !profile.useHp &&
      (addi || ARMORISH.includes(category));
    return { text: t, kind: 'all_stat_pct', useful, label: '올스탯%' };
  }
  if (/최대\s*HP\s*:?\s*\+(\d+)%|MaxHP\s*:?\s*\+(\d+)%/i.test(t)) {
    const useful =
      !specialtyOnly &&
      profile.useHp &&
      (addi || ARMORISH.includes(category));
    return { text: t, kind: 'hp_pct', useful, label: 'HP%' };
  }

  for (const key of profile.main) {
    if (STAT_PCT[key].test(t)) {
      const useful = !specialtyOnly && ARMORISH.includes(category);
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
  potKind: 'main' | 'additional' = 'main',
): { count: number; labels: string[] } {
  const labels: string[] = [];
  let count = 0;
  for (const line of lines) {
    const parsed = parsePotentialLine(line, category, profile, false, potKind);
    if (parsed?.useful) {
      count += 1;
      labels.push(parsed.label);
    }
  }
  return { count, labels };
}

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

/** 옵션 풀에서 유효 옵션 확률 합 */
export function usefulRateInPool(
  pool: MesuOption[] | undefined,
  category: CubeSlotCategory,
  profile: JobProfile,
  specialty: boolean,
  potKind: 'main' | 'additional' = 'main',
): number {
  if (!pool?.length) return 0;
  let sum = 0;
  for (const opt of pool) {
    const parsed = parsePotentialLine(
      opt.name,
      category,
      profile,
      specialty,
      potKind,
    );
    if (!parsed?.useful) continue;
    if (specialty) {
      if (category === 'gloves' && parsed.kind !== 'crit_dmg') continue;
      if (category === 'hat' && parsed.kind !== 'cooldown') continue;
    }
    sum += opt.probability;
  }
  return sum;
}

/**
 * mesu 줄 등급 확률 + 옵션표로 줄별 유효 확률.
 * 하향 등급(유니크 장비의 에픽 줄 등)도 반영.
 */
export function lineUsefulProbabilities(
  cubeId: CubeId,
  grade: PotentialGrade,
  equipKey: string,
  category: CubeSlotCategory,
  profile: JobProfile,
  specialty: boolean,
  potKind: 'main' | 'additional' = 'main',
): [number, number, number] {
  const gradeKey = GRADE_API_KEY[grade];
  const lines = MESU.optionGrades[cubeId]?.[gradeKey];
  const methodTables = MESU.methods[cubeId]?.[equipKey];
  if (!lines?.length || !methodTables) return [0, 0, 0];

  const lower = lowerPotentialGrade(grade);
  const currentPool = methodTables[gradeKey];
  const lowerPool = lower ? methodTables[GRADE_API_KEY[lower]] : undefined;
  const pUsefulCurrent = usefulRateInPool(
    currentPool,
    category,
    profile,
    specialty,
    potKind,
  );
  const pUsefulLower = usefulRateInPool(
    lowerPool,
    category,
    profile,
    specialty,
    potKind,
  );

  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const row = lines.find((l) => l.line === i + 1) ?? lines[i];
    if (!row) continue;
    const pCur = row.currentGradeProb;
    const pLow = row.lowerGradeProb ?? 0;
    out[i] = pCur * pUsefulCurrent + pLow * pUsefulLower;
  }
  return out;
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
    if (a.done !== b.done) return a.done ? 1 : -1;
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
  const equipKey = mesuEquipKey(item.slot, item.part);
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

  if (!category || !equipKey) {
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

  if (!MESU.methods[cube.id]?.[equipKey]?.[GRADE_API_KEY[grade]]) {
    return { ...base, supported: false, note: '옵션 확률 표 없음' };
  }

  const lines = cube.potKind === 'main' ? item.potential : item.additional;
  const specialty = usesSpecialtyTarget(category, cube);
  const effectiveTarget = specialty ? 1 : Math.min(3, Math.max(1, targetLines));

  const { count, labels } = specialty
    ? countSpecialty(lines, category, profile)
    : countUsefulLines(lines, category, profile, cube.potKind);

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

  const linePs = lineUsefulProbabilities(
    cube.id,
    grade,
    equipKey,
    category,
    profile,
    specialty,
    cube.potKind,
  );
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
    const parsed = parsePotentialLine(line, category, profile, true);
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
