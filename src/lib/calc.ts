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
  /** 판매로 집계된 주간 결정 수 (일일 격파 수 + 주간 보스 최대 12개) */
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

export interface AccountSummary {
  /** 모든 제한 반영 후 주간 수익 */
  weeklyRevenue: number;
  /** 월드 90개 제한 반영 전 주간 수익 (캐릭터당 12개 제한은 반영) */
  weeklyRevenueUncapped: number;
  /** 판매로 집계된 결정 수 (90개 상한) */
  weeklyCrystalCount: number;
  /** 제한 없이 생산되는 결정 수 */
  weeklyCrystalTotal: number;
  /** 90개 제한으로 잘려나간 가치 합 */
  weeklyLostToWorldCap: number;
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

/**
 * 계정 전체 수익 계산.
 * - 일일 보스: 주간 격파 횟수(1~7)만큼 결정 생산
 * - 주간 보스: 캐릭터당 가격 높은 순 12개까지만 판매 집계
 * - 전체 결정: 월드당 주 90개까지 가격 높은 순으로 판매 집계
 * - 월간 보스: 월 1회, 주간 판매 제한 계산에서는 제외 (요약에 별도 합산)
 */
export function computeAccount(
  characters: Character[],
  bossMap: ReadonlyMap<string, Boss>,
  dateISO: string,
): AccountSummary {
  const characterSummaries: CharacterSummary[] = [];
  const soldCrystals: CrystalInstance[] = [];
  let weeklyCrystalTotal = 0;
  let monthlyBossRevenue = 0;

  for (const character of characters) {
    let dailyRevenue = 0;
    let dailyCrystals = 0;
    const weeklyValues: number[] = [];
    let charMonthly = 0;

    for (const entry of character.entries) {
      const resolved = resolveEntry(bossMap, entry, dateISO);
      if (!resolved) continue; // 데이터 갱신으로 사라진 보스/난이도는 무시
      const { boss, value } = resolved;

      if (boss.reset === 'daily') {
        const clears = Math.min(
          Math.max(1, entry.clearsPerWeek),
          RULES.maxDailyClearsPerWeek,
        );
        dailyRevenue += value * clears;
        dailyCrystals += clears;
        for (let i = 0; i < clears; i++) soldCrystals.push({ value });
      } else if (boss.reset === 'weekly') {
        weeklyValues.push(value);
      } else {
        charMonthly += value;
      }
    }

    weeklyValues.sort((a, b) => b - a);
    const counted = weeklyValues.slice(0, RULES.weeklyBossSellLimitPerCharacter);
    const dropped = weeklyValues.slice(RULES.weeklyBossSellLimitPerCharacter);
    const countedSum = counted.reduce((s, v) => s + v, 0);
    for (const value of counted) soldCrystals.push({ value });

    weeklyCrystalTotal += dailyCrystals + weeklyValues.length;
    monthlyBossRevenue += charMonthly;

    characterSummaries.push({
      id: character.id,
      weeklyRevenue: dailyRevenue + countedSum,
      weeklyCrystalCount: dailyCrystals + counted.length,
      weeklyBossSelected: weeklyValues.length,
      weeklyBossCounted: counted.length,
      weeklyLostToCharLimit: dropped.reduce((s, v) => s + v, 0),
      monthlyBossRevenue: charMonthly,
    });
  }

  const weeklyRevenueUncapped = soldCrystals.reduce((s, c) => s + c.value, 0);

  let weeklyRevenue = weeklyRevenueUncapped;
  let weeklyCrystalCount = soldCrystals.length;
  if (soldCrystals.length > RULES.worldWeeklySellLimit) {
    const sorted = [...soldCrystals].sort((a, b) => b.value - a.value);
    weeklyRevenue = sorted
      .slice(0, RULES.worldWeeklySellLimit)
      .reduce((s, c) => s + c.value, 0);
    weeklyCrystalCount = RULES.worldWeeklySellLimit;
  }

  return {
    weeklyRevenue,
    weeklyRevenueUncapped,
    weeklyCrystalCount,
    weeklyCrystalTotal,
    weeklyLostToWorldCap: weeklyRevenueUncapped - weeklyRevenue,
    monthlyBossRevenue,
    monthlyRevenue: weeklyRevenue * RULES.weeksPerMonth + monthlyBossRevenue,
    characters: characterSummaries,
  };
}
