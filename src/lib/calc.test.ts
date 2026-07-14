import { describe, expect, it } from 'vitest';
import type { Character } from '../types';
import { BOSS_MAP, RULES } from '../data/crystalData';
import { computeAccount, crystalValue, priceAt } from './calc';

const TODAY = '2026-07-06';

function makeCharacter(id: string, entries: Character['entries']): Character {
  return { id, name: id, entries };
}

describe('priceAt', () => {
  it('발효일 이전에는 기존 가격을 반환한다 (검은 마법사 7/1 적용)', () => {
    const bm = BOSS_MAP.get('black-mage')!;
    const hard = bm.variants.find((v) => v.difficulty === 'hard')!;
    expect(priceAt(hard, '2026-06-30')).toBe(700_000_000);
    expect(priceAt(hard, '2026-07-01')).toBe(665_000_000);
    expect(priceAt(hard, TODAY)).toBe(665_000_000);
  });

  it('6/18 조정 가격이 적용된다', () => {
    const kaling = BOSS_MAP.get('kaling')!;
    const hard = kaling.variants.find((v) => v.difficulty === 'hard')!;
    expect(priceAt(hard, TODAY)).toBe(1_739_000_000);
  });
});

describe('crystalValue', () => {
  it('파티 인원수로 1/n 분배하고 소수점을 버린다', () => {
    expect(crystalValue(551_000, 6)).toBe(91_833); // 551000 / 6 = 91833.33...
    expect(crystalValue(551_000, 1)).toBe(551_000);
    expect(crystalValue(100, 3)).toBe(33);
  });
});

describe('computeAccount', () => {
  it('주간 보스는 주 1회 결정 1개로 집계된다', () => {
    const c = makeCharacter('a', [
      { bossId: 'lotus', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
    ]);
    const s = computeAccount([c], BOSS_MAP, TODAY);
    expect(s.weeklyRevenue).toBe(51_500_000);
    expect(s.weeklyCrystalCount).toBe(1);
    expect(s.monthlyRevenue).toBe(51_500_000 * RULES.weeksPerMonth);
  });

  it('주간 보스는 캐릭터당 12개까지만 집계된다 (가격 높은 순)', () => {
    // 주간 보스 13개 선택: 가장 싼 카오스 자쿰(8,080,000)이 제외되어야 한다
    const weekly13: Character['entries'] = [
      'zakum-weekly',
      'bloody-queen-weekly',
      'von-bon-weekly',
      'pierre-weekly',
      'magnus-weekly',
      'vellum-weekly',
      'papulatus-weekly',
    ].map((bossId) => ({
      bossId,
      difficulty: 'chaos' as const,
      partySize: 1,
      clearsPerWeek: 7,
    }));
    weekly13[4] = { ...weekly13[4], difficulty: 'hard' }; // 매그너스는 하드만 존재
    weekly13.push(
      { bossId: 'lotus', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'damien', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'guardian-angel-slime', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'lucid', difficulty: 'easy', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'will', difficulty: 'easy', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'dusk', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 },
    );
    expect(weekly13).toHaveLength(13);

    const s = computeAccount([makeCharacter('a', weekly13)], BOSS_MAP, TODAY);
    const char = s.characters[0];
    expect(char.weeklyBossSelected).toBe(13);
    expect(char.weeklyBossCounted).toBe(12);
    expect(char.weeklyLostToCharLimit).toBe(8_080_000); // 가장 싼 결정 제외
    expect(s.weeklyCrystalCount).toBe(12);

    const total =
      8_080_000 + 8_140_000 + 8_150_000 + 8_170_000 + 8_560_000 + 9_280_000 +
      13_100_000 + 16_700_000 + 17_500_000 + 25_500_000 + 29_800_000 +
      32_300_000 + 44_000_000;
    expect(s.weeklyRevenue).toBe(total - 8_080_000);
  });

  /** 주간 보스 12종 구성 (가장 싼 결정은 카오스 자쿰 8,080,000) */
  const weekly12: Character['entries'] = [
    { bossId: 'zakum-weekly', difficulty: 'chaos' },
    { bossId: 'bloody-queen-weekly', difficulty: 'chaos' },
    { bossId: 'von-bon-weekly', difficulty: 'chaos' },
    { bossId: 'pierre-weekly', difficulty: 'chaos' },
    { bossId: 'magnus-weekly', difficulty: 'hard' },
    { bossId: 'vellum-weekly', difficulty: 'chaos' },
    { bossId: 'papulatus-weekly', difficulty: 'chaos' },
    { bossId: 'lotus', difficulty: 'normal' },
    { bossId: 'damien', difficulty: 'normal' },
    { bossId: 'guardian-angel-slime', difficulty: 'normal' },
    { bossId: 'lucid', difficulty: 'easy' },
    { bossId: 'will', difficulty: 'easy' },
  ].map((e) => ({ ...e, partySize: 1, clearsPerWeek: 7 })) as Character['entries'];

  const cloneWeekly12 = () => weekly12.map((e) => ({ ...e }));

  it('같은 계정×월드에서 90개 초과 시 가격 높은 순 90개만 집계된다', () => {
    // 12보스 × 8캐릭터 = 96개 (90개 초과)
    const chars = Array.from({ length: 8 }, (_, i) =>
      makeCharacter(`c${i}`, cloneWeekly12()),
    );
    const s = computeAccount(chars, BOSS_MAP, TODAY);

    expect(s.weeklyCrystalTotal).toBe(96);
    expect(s.weeklyCrystalCount).toBe(90);
    // 가장 싼 카오스 자쿰(8,080,000) 결정 6개가 제외되어야 한다
    expect(s.weeklyLostToWorldCap).toBe(8_080_000 * 6);
    expect(s.weeklyRevenue).toBe(s.weeklyRevenueUncapped - 8_080_000 * 6);
  });

  it('90개 제한은 계정×월드별로 따로 적용된다', () => {
    // 같은 월드지만 서로 다른 계정 4캐릭터씩 → 48+48=96개여도 제한에 걸리지 않는다
    const acc1 = Array.from({ length: 4 }, (_, i): Character => ({
      ...makeCharacter(`a${i}`, cloneWeekly12()),
      meta: { world: '루나', accountId: 'acc-1' },
    }));
    const acc2 = Array.from({ length: 4 }, (_, i): Character => ({
      ...makeCharacter(`b${i}`, cloneWeekly12()),
      meta: { world: '루나', accountId: 'acc-2' },
    }));
    const s = computeAccount([...acc1, ...acc2], BOSS_MAP, TODAY);

    expect(s.weeklyCrystalTotal).toBe(96);
    expect(s.weeklyCrystalCount).toBe(96);
    expect(s.weeklyLostToWorldCap).toBe(0);
    expect(s.capGroups).toBe(2);
    expect(s.weeklyRevenue).toBe(s.weeklyRevenueUncapped);
    expect(s.groups).toEqual([
      { accountId: 'acc-1', world: '루나', produced: 48, sold: 48 },
      { accountId: 'acc-2', world: '루나', produced: 48, sold: 48 },
    ]);

    // 같은 계정의 다른 월드도 각각 90개 제한을 가진다
    const acc1More = Array.from({ length: 4 }, (_, i): Character => ({
      ...makeCharacter(`e${i}`, cloneWeekly12()),
      meta: { world: '루나', accountId: 'acc-1' },
    }));
    const scania = Array.from({ length: 4 }, (_, i): Character => ({
      ...makeCharacter(`s${i}`, cloneWeekly12()),
      meta: { world: '스카니아', accountId: 'acc-1' },
    }));
    // 루나(acc-1) 96개 → 90개로 캡, 스카니아(acc-1) 48개는 그대로
    const s2 = computeAccount([...acc1, ...acc1More, ...scania], BOSS_MAP, TODAY);
    expect(s2.weeklyCrystalCount).toBe(90 + 48);
    expect(s2.weeklyLostToWorldCap).toBe(8_080_000 * 6);
  });

  it('월간 보스는 주간 수익에 포함되지 않고 월간 수익에 합산된다', () => {
    const c = makeCharacter('a', [
      { bossId: 'black-mage', difficulty: 'hard', partySize: 2, clearsPerWeek: 7 },
      { bossId: 'lotus', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
    ]);
    const s = computeAccount([c], BOSS_MAP, TODAY);
    expect(s.weeklyRevenue).toBe(51_500_000);
    expect(s.monthlyBossRevenue).toBe(Math.floor(665_000_000 / 2));
    expect(s.monthlyRevenue).toBe(
      51_500_000 * RULES.weeksPerMonth + Math.floor(665_000_000 / 2),
    );
  });

  it('존재하지 않는 보스/난이도 항목은 무시된다 (과거 일일 보스 저장분 포함)', () => {
    const c = makeCharacter('a', [
      { bossId: 'removed-boss', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'zakum', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 }, // 삭제된 일일 보스
      { bossId: 'lucid', difficulty: 'extreme', partySize: 1, clearsPerWeek: 7 }, // 없는 난이도
      { bossId: 'lotus', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
    ]);
    const s = computeAccount([c], BOSS_MAP, TODAY);
    expect(s.weeklyRevenue).toBe(51_500_000);
    expect(s.weeklyCrystalCount).toBe(1);
  });
});
