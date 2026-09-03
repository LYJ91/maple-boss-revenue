import { describe, expect, it } from 'vitest';
import { BOSS_MAP, BOSSES } from '../data/crystalData';
import type { Character } from '../types';
import { computeAccount } from './calc';
import {
  toggleBossSelection,
  weeklySelectionCount,
} from './bossSelection';

function emptyCharacter(): Character {
  return { id: 'c1', name: '테스트', entries: [] };
}

describe('toggleBossSelection', () => {
  it('12개 선택이 즉시 집계되고 같은 난이도를 다시 누르면 11개로 해제된다', () => {
    const targets = BOSSES.filter((boss) => boss.reset === 'weekly')
      .slice(0, 12)
      .map((boss) => ({
        bossId: boss.id,
        difficulty: boss.variants[0].difficulty,
      }));
    let character = emptyCharacter();
    for (const target of targets) {
      character = toggleBossSelection(
        character,
        target.bossId,
        target.difficulty,
      );
    }

    expect(weeklySelectionCount(character)).toBe(12);
    const summary = computeAccount(
      [character],
      BOSS_MAP,
      '2026-09-03',
    ).characters[0];
    expect(summary.weeklyBossSelected).toBe(12);
    expect(summary.weeklyCrystalCount).toBe(12);

    character = toggleBossSelection(
      character,
      targets[0].bossId,
      targets[0].difficulty,
    );
    expect(weeklySelectionCount(character)).toBe(11);
    expect(
      character.entries.some((entry) => entry.bossId === targets[0].bossId),
    ).toBe(false);
  });

  it('난이도 변경은 보스 수를 늘리지 않고 파티 선호를 유지한다', () => {
    let character: Character = {
      ...emptyCharacter(),
      partyPrefs: { lotus: 2 },
    };
    character = toggleBossSelection(character, 'lotus', 'normal');
    character = toggleBossSelection(character, 'lotus', 'hard');

    expect(weeklySelectionCount(character)).toBe(1);
    expect(character.entries).toContainEqual({
      bossId: 'lotus',
      difficulty: 'hard',
      partySize: 2,
      clearsPerWeek: 7,
    });
  });
});
