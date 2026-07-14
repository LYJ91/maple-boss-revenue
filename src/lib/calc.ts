import type { Boss, BossEntry, BossVariant, Character } from '../types';
import { RULES } from '../data/crystalData';

/** 조회 시점(dateISO) 기준으로 적용 중인 결정석 가격을 반환 */
export function priceAt(variant: BossVariant, dateISO: string): number {
  let current: { price: number; since: string } | undefined;
  for (const point of variant.prices) {
    if (point.since <= dateISO && (!current || point.since > current.since)) {
      current = point;
    }
  }
  // 모든 가격이 미래 발효라면(비정상 데이터) 가장 이른 가격을 사용
  return (current ?? variant.prices[0]).price;
}

/** 파티 인원수에 따른 1인당 결정석 가격 (1/n, 소수점 버림) */
export function crystalValue(price: number, partySize: number): number {
  return Math.floor(price / Math.max(1, partySize));
}

export interface CharacterSummary {
  id: string;
  /** 캐릭터당 12개 제한 반영, 월드 90개 제한 반영 전 주간 수익 */
  weeklyRevenue: number;
  /** 판매로 집계된 주간 결정 수 (주간 보스 최대 12개) */
  weeklyCrystalCount: number;
  /** 선택된 주간 보스 수 */
  weeklyBossSelected: number;
  /** 12개 제한으로 실제 집계된 주간 보스 수 */
  weeklyBossCounted: number;
  /** 12개 제한으로 잘려나간 주간 보스 결정 가치 합 */
  weeklyLostToCharLimit: number;
  /** 월간 보스 수익 (월 1회) */
  monthlyBossRevenue: number;
}

/** 90개 판매 제한 그룹(계정×월드)별 현황 */
export interface CapGroupSummary {
  /** 불러온 계정 id (수동 추가 캐릭터는 빈 문자열) */
  accountId: string;
  /** 월드명 (알 수 없으면 빈 문자열) */
  world: string;
  /** 판매 가능 풀 결정 수 (캐릭터당 12개 제한 반영, 90개 제한 반영 전) */
  produced: number;
  /** 90개 제한 반영 후 판매 집계 결정 수 */
  sold: number;
}

export interface AccountSummary {
  /** 모든 제한 반영 후 주간 수익 */
  weeklyRevenue: number;
  /** 90개 제한 반영 전 주간 수익 (캐릭터당 12개 제한은 반영) */
  weeklyRevenueUncapped: number;
  /** 판매로 집계된 결정 수 (계정×월드별 90개 상한 반영) */
  weeklyCrystalCount: number;
  /** 제한 없이 생산되는 결정 수 */
  weeklyCrystalTotal: number;
  /** 90개 제한으로 잘려나간 가치 합 */
  weeklyLostToWorldCap: number;
  /** 90개 제한이 각각 적용된 계정×월드 그룹 수 */
  capGroups: number;
  /** 그룹별 판매 현황 (결정 수 많은 순) */
  groups: CapGroupSummary[];
  /** 월간 보스 수익 합 */
  monthlyBossRevenue: number;
  /** 주간 수익 × weeksPerMonth + 월간 보스 수익 */
  monthlyRevenue: number;
  characters: CharacterSummary[];
}

interface CrystalInstance {
  value: number;
}

function resolveEntry(
  bossMap: ReadonlyMap<string, Boss>,
  entry: BossEntry,
  dateISO: string,
): { boss: Boss; value: number } | null {
  const boss = bossMap.get(entry.bossId);
  if (!boss) return null;
  const variant = boss.variants.find((v) => v.difficulty === entry.difficulty);
  if (!variant) return null;
  const price = priceAt(variant, dateISO);
  return { boss, value: crystalValue(price, entry.partySize) };
}

interface CapGroup {
  accountId: string;
  world: string;
  crystals: CrystalInstance[];
}

/**
 * 90개 판매 제한이 적용되는 그룹 키.
 * 게임 규칙상 결정석 판매 제한은 "넥슨 계정 × 월드"당 주 90개다.
 * 계정 정보가 없는(수동 추가) 캐릭터는 같은 월드끼리 한 계정으로 간주한다.
 */
function sellCapGroupKey(character: Character): string {
  return `${character.meta?.accountId ?? ''}:${character.meta?.world ?? ''}`;
}

/**
 * 계정 전체 수익 계산.
 * - 주간 보스: 캐릭터당 가격 높은 순 12개까지만 판매 집계
 * - 전체 결정: 계정×월드당 주 90개까지 가격 높은 순으로 판매 집계
 * - 월간 보스: 월 1회, 주간 판매 제한 계산에서는 제외 (요약에 별도 합산)
 * - 일일 보스는 다루지 않는다. 과거 저장 데이터의 일일 보스 항목은
 *   보스 데이터에 없으므로 resolveEntry에서 무시된다.
 */
export function computeAccount(
  characters: Character[],
  bossMap: ReadonlyMap<string, Boss>,
  dateISO: string,
): AccountSummary {
  const characterSummaries: CharacterSummary[] = [];
  const soldByGroup = new Map<string, CapGroup>();
  let weeklyCrystalTotal = 0;
  let monthlyBossRevenue = 0;

  for (const character of characters) {
    const groupKey = sellCapGroupKey(character);
    let group = soldByGroup.get(groupKey);
    if (!group) {
      group = {
        accountId: character.meta?.accountId ?? '',
        world: character.meta?.world ?? '',
        crystals: [],
      };
      soldByGroup.set(groupKey, group);
    }
    const soldCrystals = group.crystals;

    const weeklyValues: number[] = [];
    let charMonthly = 0;

    for (const entry of character.entries) {
      const resolved = resolveEntry(bossMap, entry, dateISO);
      if (!resolved) continue; // 데이터 갱신으로 사라진 보스/난이도는 무시
      const { boss, value } = resolved;

      if (boss.reset === 'weekly') {
        weeklyValues.push(value);
      } else if (boss.reset === 'monthly') {
        charMonthly += value;
      }
    }

    weeklyValues.sort((a, b) => b - a);
    const counted = weeklyValues.slice(0, RULES.weeklyBossSellLimitPerCharacter);
    const dropped = weeklyValues.slice(RULES.weeklyBossSellLimitPerCharacter);
    const countedSum = counted.reduce((s, v) => s + v, 0);
    for (const value of counted) soldCrystals.push({ value });

    weeklyCrystalTotal += weeklyValues.length;
    monthlyBossRevenue += charMonthly;

    characterSummaries.push({
      id: character.id,
      weeklyRevenue: countedSum,
      weeklyCrystalCount: counted.length,
      weeklyBossSelected: weeklyValues.length,
      weeklyBossCounted: counted.length,
      weeklyLostToCharLimit: dropped.reduce((s, v) => s + v, 0),
      monthlyBossRevenue: charMonthly,
    });
  }

  // 90개 판매 제한은 계정×월드 그룹별로 각각 적용한다
  let weeklyRevenueUncapped = 0;
  let weeklyRevenue = 0;
  let weeklyCrystalCount = 0;
  const groups: CapGroupSummary[] = [];
  for (const group of soldByGroup.values()) {
    const soldCrystals = group.crystals;
    const groupSum = soldCrystals.reduce((s, c) => s + c.value, 0);
    weeklyRevenueUncapped += groupSum;
    let sold = soldCrystals.length;
    if (soldCrystals.length > RULES.worldWeeklySellLimit) {
      const sorted = [...soldCrystals].sort((a, b) => b.value - a.value);
      weeklyRevenue += sorted
        .slice(0, RULES.worldWeeklySellLimit)
        .reduce((s, c) => s + c.value, 0);
      sold = RULES.worldWeeklySellLimit;
    } else {
      weeklyRevenue += groupSum;
    }
    weeklyCrystalCount += sold;
    groups.push({
      accountId: group.accountId,
      world: group.world,
      produced: soldCrystals.length,
      sold,
    });
  }
  groups.sort((a, b) => b.produced - a.produced);

  return {
    weeklyRevenue,
    weeklyRevenueUncapped,
    weeklyCrystalCount,
    weeklyCrystalTotal,
    weeklyLostToWorldCap: weeklyRevenueUncapped - weeklyRevenue,
    capGroups: Math.max(1, soldByGroup.size),
    groups,
    monthlyBossRevenue,
    monthlyRevenue: weeklyRevenue * RULES.weeksPerMonth + monthlyBossRevenue,
    characters: characterSummaries,
  };
}
