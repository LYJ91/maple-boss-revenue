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
  it('일일 보스는 주간 격파 횟수만큼 집계된다', () => {
    const c = makeCharacter('a', [
      { bossId: 'zakum', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 },
    ]);
    const s = computeAccount([c], BOSS_MAP, TODAY);
    expect(s.weeklyRevenue).toBe(349_000 * 7);
    expect(s.weeklyCrystalCount).toBe(7);
    expect(s.monthlyRevenue).toBe(349_000 * 7 * RULES.weeksPerMonth);
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

  it('같은 계정×월드에서 90개 초과 시 가격 높은 순 90개만 집계된다', () => {
    // 캐릭터 13개는 최대치(12) 초과라 규칙상 불가 → 13캐릭터로 일일 7개씩 = 91개 상황을
    // 2캐릭터로 재현: 일일 보스 7종 × 7회 = 49개씩 → 98개 (90개 초과)
    const dailySeven: Character['entries'] = [
      'zakum',
      'papulatus',
      'magnus',
      'hilla',
      'horntail',
      'von-leon',
      'arkarium',
    ].map((bossId) => ({
      bossId,
      difficulty: 'easy',
      partySize: 1,
      clearsPerWeek: 7,
    }));
    // 힐라는 이지가 없으므로 노멀로 교체
    dailySeven[3] = { ...dailySeven[3], difficulty: 'normal' };

    const c1 = makeCharacter('a', dailySeven);
    const c2 = makeCharacter('b', dailySeven.map((e) => ({ ...e })));
    const s = computeAccount([c1, c2], BOSS_MAP, TODAY);

    expect(s.weeklyCrystalTotal).toBe(98);
    expect(s.weeklyCrystalCount).toBe(90);
    // 가장 싼 자쿰 이지(114,000) 결정 8개가 제외되어야 한다
    expect(s.weeklyLostToWorldCap).toBe(114_000 * 8);
    expect(s.weeklyRevenue).toBe(s.weeklyRevenueUncapped - 114_000 * 8);
  });

  it('90개 제한은 계정×월드별로 따로 적용된다', () => {
    const dailySeven: Character['entries'] = [
      'zakum',
      'papulatus',
      'magnus',
      'hilla',
      'horntail',
      'von-leon',
      'arkarium',
    ].map((bossId) => ({
      bossId,
      difficulty: 'easy',
      partySize: 1,
      clearsPerWeek: 7,
    }));
    dailySeven[3] = { ...dailySeven[3], difficulty: 'normal' };

    // 같은 월드지만 서로 다른 계정에서 불러온 캐릭터 → 49+49=98개여도 제한에 걸리지 않는다
    const c1: Character = {
      ...makeCharacter('a', dailySeven),
      meta: { world: '루나', accountId: 'acc-1' },
    };
    const c2: Character = {
      ...makeCharacter('b', dailySeven.map((e) => ({ ...e }))),
      meta: { world: '루나', accountId: 'acc-2' },
    };
    const s = computeAccount([c1, c2], BOSS_MAP, TODAY);

    expect(s.weeklyCrystalTotal).toBe(98);
    expect(s.weeklyCrystalCount).toBe(98);
    expect(s.weeklyLostToWorldCap).toBe(0);
    expect(s.capGroups).toBe(2);
    expect(s.weeklyRevenue).toBe(s.weeklyRevenueUncapped);

    // 같은 계정의 다른 월드도 각각 90개 제한을 가진다
    const c3: Character = {
      ...makeCharacter('c', dailySeven.map((e) => ({ ...e }))),
      meta: { world: '루나', accountId: 'acc-1' },
    };
    const c4: Character = {
      ...makeCharacter('d', dailySeven.map((e) => ({ ...e }))),
      meta: { world: '스카니아', accountId: 'acc-1' },
    };
    const s2 = computeAccount([c1, c3, c4], BOSS_MAP, TODAY);
    // 루나(acc-1) 98개 → 90개로 캡, 스카니아(acc-1) 49개는 그대로
    expect(s2.weeklyCrystalCount).toBe(90 + 49);
    expect(s2.weeklyLostToWorldCap).toBe(114_000 * 8);
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

  it('존재하지 않는 보스/난이도 항목은 무시된다 (데이터 갱신 대비)', () => {
    const c = makeCharacter('a', [
      { bossId: 'removed-boss', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'cygnus', difficulty: 'easy', partySize: 1, clearsPerWeek: 7 }, // 삭제된 난이도
      { bossId: 'cygnus', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 },
    ]);
    const s = computeAccount([c], BOSS_MAP, TODAY);
    expect(s.weeklyRevenue).toBe(1_360_000 * 7);
  });
});
