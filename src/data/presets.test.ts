import { describe, expect, it } from 'vitest';
import { BOSS_MAP, RULES, clampPartySize } from './crystalData';
import { BOSS_PRESETS } from './presets';
import { crystalValue, priceAt } from '../lib/calc';

const THURSDAY = '2026-09-17';

function has(
  id: string,
  bossId: string,
  difficulty: string,
  partySize = 1,
): boolean {
  const preset = BOSS_PRESETS.find((p) => p.id === id)!;
  return preset.entries.some(
    (e) =>
      e.bossId === bossId &&
      e.difficulty === difficulty &&
      e.partySize === partySize,
  );
}

function revenue(id: string, dateISO: string): number {
  const preset = BOSS_PRESETS.find((p) => p.id === id)!;
  return preset.entries.reduce((sum, { bossId, difficulty, partySize }) => {
    const variant = BOSS_MAP.get(bossId)!.variants.find(
      (v) => v.difficulty === difficulty,
    )!;
    return sum + crystalValue(priceAt(variant, dateISO), partySize);
  }, 0);
}

describe('BOSS_PRESETS 무결성', () => {
  it('모든 프리셋 항목이 실존하는 주간 보스/난이도/인원을 가리킨다', () => {
    for (const preset of BOSS_PRESETS) {
      for (const { bossId, difficulty, partySize } of preset.entries) {
        const boss = BOSS_MAP.get(bossId);
        expect(boss, `${preset.name}: ${bossId} 없음`).toBeDefined();
        expect(boss!.reset, `${preset.name}: ${bossId}는 주간 보스가 아님`).toBe(
          'weekly',
        );
        expect(
          boss!.variants.some((v) => v.difficulty === difficulty),
          `${preset.name}: ${bossId}에 ${difficulty} 난이도 없음`,
        ).toBe(true);
        expect(partySize, `${preset.name}: ${bossId} 인원`).toBeGreaterThan(0);
        expect(clampPartySize(boss!, difficulty, partySize)).toBe(partySize);
      }
    }
  });

  it('프리셋은 12보스 판매 제한을 초과하지 않고, 보스가 중복되지 않는다', () => {
    for (const preset of BOSS_PRESETS) {
      expect(preset.entries.length, preset.name).toBe(
        RULES.weeklyBossSellLimitPerCharacter,
      );
      const ids = preset.entries.map((e) => e.bossId);
      expect(new Set(ids).size, `${preset.name}: 보스 중복`).toBe(ids.length);
    }
  });

  it('상위 프리셋일수록 주간 결정석 합계가 커진다 (2026-09-17 가격)', () => {
    const order = [
      'ibel',
      'nokal',
      'nohyung-3',
      'nojeok',
      'nohyung-2',
      'exlotus-2',
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        revenue(order[i], THURSDAY),
        `${order[i]}가 ${order[i - 1]}보다 수익이 낮음`,
      ).toBeGreaterThan(revenue(order[i - 1], THURSDAY));
    }
  });

  it('이벨: 하데미~하세 + 이칼 이적자 이카 이벨, 전부 1인, 총 12', () => {
    const preset = BOSS_PRESETS.find((p) => p.id === 'ibel')!;
    expect(preset.entries).toHaveLength(12);
    expect(has('ibel', 'damien', 'hard')).toBe(true);
    expect(has('ibel', 'guardian-angel-slime', 'chaos')).toBe(true);
    expect(has('ibel', 'lucid', 'hard')).toBe(true);
    expect(has('ibel', 'will', 'hard')).toBe(true);
    expect(has('ibel', 'dusk', 'chaos')).toBe(true);
    expect(has('ibel', 'verus-hilla', 'hard')).toBe(true);
    expect(has('ibel', 'dunkel', 'hard')).toBe(true);
    expect(has('ibel', 'seren', 'hard')).toBe(true);
    expect(has('ibel', 'kalos', 'easy')).toBe(true);
    expect(has('ibel', 'adversary', 'easy')).toBe(true);
    expect(has('ibel', 'kaling', 'easy')).toBe(true);
    expect(has('ibel', 'bellona', 'easy')).toBe(true);
    expect(preset.entries.every((e) => e.partySize === 1)).toBe(true);
  });

  it('노칼: 이벨에서 칼로스만 노멀 승급, 전부 1인', () => {
    expect(has('nokal', 'kalos', 'normal')).toBe(true);
    expect(has('nokal', 'kalos', 'easy')).toBe(false);
    expect(has('nokal', 'bellona', 'easy')).toBe(true);
    expect(has('nokal', 'guardian-angel-slime', 'chaos')).toBe(true);
    expect(
      BOSS_PRESETS.find((p) => p.id === 'nokal')!.entries.every(
        (e) => e.partySize === 1,
      ),
    ).toBe(true);
  });

  it('노흉 3인: 카가엔슬 제외, 노흉 3인, 나머지는 노칼과 동일', () => {
    const preset = BOSS_PRESETS.find((p) => p.id === 'nohyung-3')!;
    expect(preset.entries).toHaveLength(12);
    expect(preset.entries.some((e) => e.bossId === 'guardian-angel-slime')).toBe(
      false,
    );
    expect(has('nohyung-3', 'damien', 'hard')).toBe(true);
    expect(has('nohyung-3', 'lucid', 'hard')).toBe(true);
    expect(has('nohyung-3', 'will', 'hard')).toBe(true);
    expect(has('nohyung-3', 'dusk', 'chaos')).toBe(true);
    expect(has('nohyung-3', 'verus-hilla', 'hard')).toBe(true);
    expect(has('nohyung-3', 'dunkel', 'hard')).toBe(true);
    expect(has('nohyung-3', 'seren', 'hard')).toBe(true);
    expect(has('nohyung-3', 'kalos', 'normal')).toBe(true);
    expect(has('nohyung-3', 'adversary', 'easy')).toBe(true);
    expect(has('nohyung-3', 'kaling', 'easy')).toBe(true);
    expect(has('nohyung-3', 'bellona', 'easy')).toBe(true);
    expect(has('nohyung-3', 'brilliant-star', 'normal', 3)).toBe(true);
  });

  it('노적: 노흉 3인에서 대적자만 노멀 승급, 노흉은 3인 유지', () => {
    expect(has('nojeok', 'adversary', 'normal')).toBe(true);
    expect(has('nojeok', 'adversary', 'easy')).toBe(false);
    expect(has('nojeok', 'brilliant-star', 'normal', 3)).toBe(true);
    expect(has('nojeok', 'kalos', 'normal')).toBe(true);
    expect(has('nojeok', 'bellona', 'easy')).toBe(true);
  });

  it('노흉 2인: 노적과 보스 구성은 같고 노흉만 2인', () => {
    const nojeok = BOSS_PRESETS.find((p) => p.id === 'nojeok')!;
    const nohyung2 = BOSS_PRESETS.find((p) => p.id === 'nohyung-2')!;
    expect(nohyung2.entries.map((e) => `${e.bossId}:${e.difficulty}`).sort()).toEqual(
      nojeok.entries.map((e) => `${e.bossId}:${e.difficulty}`).sort(),
    );
    expect(has('nohyung-2', 'brilliant-star', 'normal', 2)).toBe(true);
    expect(has('nohyung-2', 'brilliant-star', 'normal', 3)).toBe(false);
    expect(has('nohyung-2', 'adversary', 'normal')).toBe(true);
  });

  it('익스우 2인: 하데미 제외, 익스우 2인 + 노흉 2인, 총 12', () => {
    const preset = BOSS_PRESETS.find((p) => p.id === 'exlotus-2')!;
    expect(preset.entries).toHaveLength(12);
    expect(preset.entries.some((e) => e.bossId === 'damien')).toBe(false);
    expect(has('exlotus-2', 'lotus', 'extreme', 2)).toBe(true);
    expect(has('exlotus-2', 'lucid', 'hard')).toBe(true);
    expect(has('exlotus-2', 'will', 'hard')).toBe(true);
    expect(has('exlotus-2', 'dusk', 'chaos')).toBe(true);
    expect(has('exlotus-2', 'verus-hilla', 'hard')).toBe(true);
    expect(has('exlotus-2', 'dunkel', 'hard')).toBe(true);
    expect(has('exlotus-2', 'seren', 'hard')).toBe(true);
    expect(has('exlotus-2', 'kalos', 'normal')).toBe(true);
    expect(has('exlotus-2', 'adversary', 'normal')).toBe(true);
    expect(has('exlotus-2', 'kaling', 'easy')).toBe(true);
    expect(has('exlotus-2', 'bellona', 'easy')).toBe(true);
    expect(has('exlotus-2', 'brilliant-star', 'normal', 2)).toBe(true);
  });

  it('2026-09-17 1인분 합계가 구성표와 같다', () => {
    expect(revenue('ibel', THURSDAY)).toBe(2_023_500_000);
    expect(revenue('nokal', THURSDAY)).toBe(2_264_500_000);
    expect(revenue('nohyung-3', THURSDAY)).toBe(2_390_866_666);
    expect(revenue('nojeok', THURSDAY)).toBe(2_661_866_666);
    expect(revenue('nohyung-2', THURSDAY)).toBe(2_760_700_000);
    expect(revenue('exlotus-2', THURSDAY)).toBe(2_986_800_000);
  });
});
