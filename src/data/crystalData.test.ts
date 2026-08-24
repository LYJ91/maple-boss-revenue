import { describe, expect, it } from 'vitest';
import {
  BOSS_MAP,
  BOSSES,
  clampPartySize,
  maxPartySizeFor,
} from './crystalData';

describe('벨로나 데이터', () => {
  it('출시 난이도·결정 가격·표시 순서가 정확하다', () => {
    const bellona = BOSS_MAP.get('bellona')!;
    expect(bellona.name).toBe('벨로나');
    expect(bellona.reset).toBe('weekly');
    expect(bellona.maxPartySize).toBe(3);
    expect(
      bellona.variants.map((variant) => ({
        difficulty: variant.difficulty,
        price: variant.prices[0].price,
        since: variant.prices[0].since,
      })),
    ).toEqual([
      { difficulty: 'easy', price: 440_000_000, since: '2026-08-20' },
      { difficulty: 'normal', price: 850_000_000, since: '2026-08-20' },
      { difficulty: 'hard', price: 2_950_000_000, since: '2026-08-20' },
    ]);

    const ids = BOSSES.map((boss) => boss.id);
    expect(ids.indexOf('kaling')).toBeLessThan(ids.indexOf('bellona'));
    expect(ids.indexOf('bellona')).toBeLessThan(
      ids.indexOf('brilliant-star'),
    );
  });
});

describe('난이도별 파티 상한', () => {
  it('3인 보스와 익스트림 스우의 실제 상한을 반환한다', () => {
    for (const id of [
      'adversary',
      'bellona',
      'brilliant-star',
      'limbo',
      'baldrix',
      'jupiter',
    ]) {
      const boss = BOSS_MAP.get(id)!;
      for (const variant of boss.variants) {
        expect(maxPartySizeFor(boss, variant.difficulty), id).toBe(3);
      }
    }

    const lotus = BOSS_MAP.get('lotus')!;
    expect(maxPartySizeFor(lotus, 'normal')).toBe(6);
    expect(maxPartySizeFor(lotus, 'hard')).toBe(6);
    expect(maxPartySizeFor(lotus, 'extreme')).toBe(2);
  });

  it('기존 초과 저장값과 비정상 값을 유효 범위로 보정한다', () => {
    const bellona = BOSS_MAP.get('bellona')!;
    expect(clampPartySize(bellona, 'hard', 6)).toBe(3);
    expect(clampPartySize(bellona, 'hard', 0)).toBe(1);
    expect(clampPartySize(bellona, 'hard', Number.NaN)).toBe(1);
  });
});
