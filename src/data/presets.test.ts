import { describe, expect, it } from 'vitest';
import { BOSS_MAP, RULES } from './crystalData';
import { BOSS_PRESETS } from './presets';
import { priceAt } from '../lib/calc';

describe('BOSS_PRESETS 무결성', () => {
  it('모든 프리셋 항목이 실존하는 주간 보스/난이도를 가리킨다', () => {
    for (const preset of BOSS_PRESETS) {
      for (const { bossId, difficulty } of preset.entries) {
        const boss = BOSS_MAP.get(bossId);
        expect(boss, `${preset.name}: ${bossId} 없음`).toBeDefined();
        expect(boss!.reset, `${preset.name}: ${bossId}는 주간 보스가 아님`).toBe('weekly');
        expect(
          boss!.variants.some((v) => v.difficulty === difficulty),
          `${preset.name}: ${bossId}에 ${difficulty} 난이도 없음`,
        ).toBe(true);
      }
    }
  });

  it('프리셋은 12보스 판매 제한을 초과하지 않고, 보스가 중복되지 않는다', () => {
    for (const preset of BOSS_PRESETS) {
      expect(preset.entries.length, preset.name).toBeLessThanOrEqual(
        RULES.weeklyBossSellLimitPerCharacter,
      );
      const ids = preset.entries.map((e) => e.bossId);
      expect(new Set(ids).size, `${preset.name}: 보스 중복`).toBe(ids.length);
    }
  });

  it('상위 프리셋일수록 주간 결정석 합계가 커진다 (구성 검증)', () => {
    const revenue = (id: string) => {
      const preset = BOSS_PRESETS.find((p) => p.id === id)!;
      return preset.entries.reduce((sum, { bossId, difficulty }) => {
        const variant = BOSS_MAP.get(bossId)!.variants.find(
          (v) => v.difficulty === difficulty,
        )!;
        return sum + priceAt(variant, '2026-07-06');
      }, 0);
    };

    // 스펙 진행 순서상 인접 단계 간 수익 증가 확인
    const order = ['geommitsol', 'nose-ikal', 'ijeokja', 'hase-ikal', 'ika', 'nokal-ika'];
    for (let i = 1; i < order.length; i++) {
      expect(
        revenue(order[i]),
        `${order[i]}가 ${order[i - 1]}보다 수익이 낮음`,
      ).toBeGreaterThan(revenue(order[i - 1]));
    }
  });

  it('이적자 구성: 이지 대적자 + 이지 칼로스 + 노멀 세렌 + 하위 9보스(총 12)', () => {
    const preset = BOSS_PRESETS.find((p) => p.id === 'ijeokja')!;
    expect(preset.entries).toHaveLength(12);
    const has = (bossId: string, difficulty: string) =>
      preset.entries.some((e) => e.bossId === bossId && e.difficulty === difficulty);
    expect(has('adversary', 'easy')).toBe(true);
    expect(has('kalos', 'easy')).toBe(true);
    expect(has('seren', 'normal')).toBe(true);
    expect(has('papulatus-weekly', 'chaos')).toBe(true);
    expect(has('verus-hilla', 'hard')).toBe(true);
    // 카벨은 제외되어야 한다
    expect(preset.entries.some((e) => e.bossId === 'vellum-weekly')).toBe(false);
  });

  it('하세이칼 구성: 이적자에서 세렌만 하드로 승급 (이지 대적자 포함, 총 12)', () => {
    const preset = BOSS_PRESETS.find((p) => p.id === 'hase-ikal')!;
    expect(preset.entries).toHaveLength(12);
    const has = (bossId: string, difficulty: string) =>
      preset.entries.some((e) => e.bossId === bossId && e.difficulty === difficulty);
    expect(has('seren', 'hard')).toBe(true);
    expect(has('kalos', 'easy')).toBe(true);
    expect(has('adversary', 'easy')).toBe(true);
    expect(has('papulatus-weekly', 'chaos')).toBe(true);
    expect(preset.entries.some((e) => e.bossId === 'vellum-weekly')).toBe(false);
  });

  it('검밑솔 구성은 검밑솔 8보스 + 하위 4보스로 12개다', () => {
    const preset = BOSS_PRESETS.find((p) => p.id === 'geommitsol')!;
    expect(preset.entries).toHaveLength(12);
    const has = (bossId: string, difficulty: string) =>
      preset.entries.some((e) => e.bossId === bossId && e.difficulty === difficulty);
    expect(has('lotus', 'hard')).toBe(true);
    expect(has('damien', 'hard')).toBe(true);
    expect(has('verus-hilla', 'hard')).toBe(true);
    expect(has('guardian-angel-slime', 'chaos')).toBe(true);
    expect(has('papulatus-weekly', 'chaos')).toBe(true);
  });
});
