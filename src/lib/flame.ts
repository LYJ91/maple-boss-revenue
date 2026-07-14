/**
 * 추가옵션(환생의 불꽃) 기대값 분석.
 *
 * 각 장비에 대해:
 * 1) 현재 추옵을 직업 기준 환산 주스탯 점수로 변환
 * 2) 불꽃 1회 사용 시 나올 수 있는 모든 결과(옵션 4종 조합 × 단계)의 점수 분포를 전수 계산
 * 3) 현재보다 좋아질 확률 p → 기대 재설정 횟수 1/p
 *
 * 보스 전리품 장비(추옵 4개 고정, 단계 +2) 기준. 일반 장비는 라인 수 확률이
 * 비공개라 지원하지 않는다.
 */
import {
  ANALYZABLE_SLOTS,
  FLAME_LINE_COUNT,
  effectScore,
  optionEffect,
  optionPool,
  type FlameEffect,
  type FlameType,
  type JobProfile,
} from '../data/flameData';

/** 넥슨 API item_add_option → FlameEffect */
export function parseAddOption(raw: Record<string, unknown> | null | undefined): FlameEffect {
  const n = (key: string) => {
    const v = raw?.[key];
    const num = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
    return Number.isFinite(num) ? num : 0;
  };
  return {
    str: n('str'),
    dex: n('dex'),
    int: n('int'),
    luk: n('luk'),
    maxHp: n('max_hp'),
    maxMp: n('max_mp'),
    attack: n('attack_power'),
    magic: n('magic_power'),
    armor: n('armor'),
    speed: n('speed'),
    jump: n('jump'),
    bossDamagePct: n('boss_damage'),
    damagePct: n('damage'),
    allStatPct: n('all_stat'),
    levelReduce: n('equipment_level_decrease'),
  };
}

const hasAnyOption = (e: FlameEffect): boolean =>
  Object.values(e).some((v) => (v ?? 0) > 0);

/** 분석 입력 (EquipmentTab의 Equip에서 필요한 부분만) */
export interface FlameItemInput {
  slot: string;
  name: string;
  icon: string;
  addOption: Record<string, unknown> | null | undefined;
  baseOption: Record<string, unknown> | null | undefined;
}

export interface FlameAnalysis {
  slot: string;
  name: string;
  icon: string;
  itemLevel: number;
  isWeapon: boolean;
  supported: boolean;
  /** 미지원 사유 등 */
  note?: string;
  currentScore: number;
  /** 불꽃 1회로 현재보다 좋아질 확률 (0~1) */
  pImprove: number;
  /** 기대 재설정 횟수 = 1/p (개선 불가능하면 Infinity) */
  expectedTries: number;
  /** 이 장비에서 나올 수 있는 최고 점수 */
  maxScore: number;
}

interface TierScore {
  p: number;
  score: number;
}

/**
 * 불꽃 1회 시행에서 "현재 점수보다 커질 확률"과 최고 점수를 전수 계산.
 * 옵션 4종 조합 C(19,4)=3876 × 단계 조합을 모두 순회한다.
 */
export function improveProbability(
  currentScore: number,
  itemLevel: number,
  isWeapon: boolean,
  baseAttack: number,
  baseMagic: number,
  profile: JobProfile,
  flame: FlameType,
  bossGear = true,
): { pImprove: number; maxScore: number } {
  const pool = optionPool(isWeapon, itemLevel);
  const tierAdd = bossGear ? 2 : 0;

  // 옵션별 (단계 확률, 점수) 사전 계산
  const perOption: TierScore[][] = pool.map((id) =>
    flame.tiers.map(([tier, p]) => ({
      p,
      score: effectScore(
        optionEffect(id, tier + tierAdd, itemLevel, isWeapon, baseAttack, baseMagic),
        profile,
        isWeapon,
      ),
    })),
  );
  const maxPerOption = perOption.map((ts) => Math.max(...ts.map((t) => t.score)));
  const minPerOption = perOption.map((ts) => Math.min(...ts.map((t) => t.score)));

  const n = pool.length;
  const k = FLAME_LINE_COUNT;
  let comboCount = 0;
  let pSum = 0;
  let globalMax = 0;

  // C(n,4) 조합 순회
  for (let a = 0; a < n - 3; a++) {
    for (let b = a + 1; b < n - 2; b++) {
      for (let c = b + 1; c < n - 1; c++) {
        for (let d = c + 1; d < n; d++) {
          comboCount++;
          const idx = [a, b, c, d];
          const comboMax =
            maxPerOption[a] + maxPerOption[b] + maxPerOption[c] + maxPerOption[d];
          if (comboMax > globalMax) globalMax = comboMax;
          if (comboMax <= currentScore) continue; // 이 조합으로는 개선 불가
          const comboMin =
            minPerOption[a] + minPerOption[b] + minPerOption[c] + minPerOption[d];
          if (comboMin > currentScore) {
            pSum += 1; // 어떤 단계가 나와도 개선
            continue;
          }
          // 단계 조합 전수 (검환불 4^4=256, 심환불 3^4=81)
          let pCombo = 0;
          const [t0, t1, t2, t3] = idx.map((i) => perOption[i]);
          for (const x0 of t0) {
            const s0 = x0.score;
            for (const x1 of t1) {
              const s01 = s0 + x1.score;
              for (const x2 of t2) {
                const s012 = s01 + x2.score;
                for (const x3 of t3) {
                  if (s012 + x3.score > currentScore) {
                    pCombo += x0.p * x1.p * x2.p * x3.p;
                  }
                }
              }
            }
          }
          pSum += pCombo;
        }
      }
    }
  }
  void k;

  return { pImprove: pSum / comboCount, maxScore: globalMax };
}

/** 장비 목록 전체 분석 → 기대 횟수 낮은 순 정렬 */
export function analyzeFlames(
  items: FlameItemInput[],
  profile: JobProfile,
  flame: FlameType,
  jobName?: string,
): FlameAnalysis[] {
  const results: FlameAnalysis[] = [];

  for (const item of items) {
    if (!ANALYZABLE_SLOTS.has(item.slot)) continue;

    const isWeapon = item.slot === '무기';
    const base = item.baseOption ?? {};
    const num = (v: unknown) => {
      const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
      return Number.isFinite(x) ? x : 0;
    };
    const itemLevel = num((base as Record<string, unknown>).base_equipment_level);
    const baseAttack = num((base as Record<string, unknown>).attack_power);
    const baseMagic = num((base as Record<string, unknown>).magic_power);
    const current = parseAddOption(item.addOption);

    const common = {
      slot: item.slot,
      name: item.name,
      icon: item.icon,
      itemLevel,
      isWeapon,
    };

    // 추옵이 하나도 없는 장비: 불꽃 사용 불가 장비(시드링 등)이거나 미부여 상태.
    // 구분할 수 없으므로 분석 목록에서 제외한다.
    if (!hasAnyOption(current)) {
      results.push({
        ...common,
        supported: false,
        note: '추가옵션 없음 (불꽃 사용 불가 장비이거나 미부여)',
        currentScore: 0,
        pImprove: 0,
        expectedTries: Infinity,
        maxScore: 0,
      });
      continue;
    }

    if (isWeapon && jobName?.trim() === '제로') {
      results.push({
        ...common,
        supported: false,
        note: '제로 무기는 추옵 체계가 달라 미지원',
        currentScore: 0,
        pImprove: 0,
        expectedTries: Infinity,
        maxScore: 0,
      });
      continue;
    }

    if (itemLevel < 60) {
      results.push({
        ...common,
        supported: false,
        note: '60레벨 미만 장비는 분석 제외',
        currentScore: 0,
        pImprove: 0,
        expectedTries: Infinity,
        maxScore: 0,
      });
      continue;
    }

    const currentScore = effectScore(current, profile, isWeapon);
    const { pImprove, maxScore } = improveProbability(
      currentScore,
      itemLevel,
      isWeapon,
      baseAttack,
      baseMagic,
      profile,
      flame,
    );

    results.push({
      ...common,
      supported: true,
      currentScore,
      pImprove,
      expectedTries: pImprove > 0 ? 1 / pImprove : Infinity,
      maxScore,
    });
  }

  return results.sort((x, y) => {
    if (x.supported !== y.supported) return x.supported ? -1 : 1;
    return x.expectedTries - y.expectedTries;
  });
}
