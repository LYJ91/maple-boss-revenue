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

  it('월간 보스 수동 선택은 해당 달로 확정한다', () => {
    const character = toggleBossSelection(
      emptyCharacter(),
      'black-mage',
      'hard',
      '2026-09',
    );
    expect(character.monthlyConfirmedMonth).toBe('2026-09');
    expect(character.entries).toContainEqual({
      bossId: 'black-mage',
      difficulty: 'hard',
      partySize: 1,
      clearsPerWeek: 7,
    });
  });

  it('주간 보스 수동 선택은 해당 주차로 확정한다', () => {
    const character = toggleBossSelection(
      emptyCharacter(),
      'lotus',
      'hard',
      undefined,
      '2026-09-10',
    );
    expect(character.weeklyConfirmedWeek).toBe('2026-09-10');
    expect(character.entries).toContainEqual({
      bossId: 'lotus',
      difficulty: 'hard',
      partySize: 1,
      clearsPerWeek: 7,
    });
  });

  it('새 주차에서 주간 보스를 누르면 지난 주 주간 선택은 버린다', () => {
    const previous: Character = {
      ...emptyCharacter(),
      weeklyConfirmedWeek: '2026-09-03',
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
        {
          bossId: 'black-mage',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    };
    const next = toggleBossSelection(
      previous,
      'lotus',
      'hard',
      undefined,
      '2026-09-10',
    );
    expect(next.weeklyConfirmedWeek).toBe('2026-09-10');
    expect(next.entries.map((entry) => entry.bossId).sort()).toEqual([
      'black-mage',
      'lotus',
    ]);
    expect(next.weeklyByWeek?.['2026-09-03']?.map((entry) => entry.bossId)).toEqual(
      ['will'],
    );
    expect(next.weeklyByWeek?.['2026-09-10']?.map((entry) => entry.bossId)).toEqual(
      ['lotus'],
    );
  });

  it('주간 보스를 직접 끄면 그 주에 제외로 기억한다', () => {
    const selected = toggleBossSelection(
      emptyCharacter(),
      'lotus',
      'hard',
      undefined,
      '2026-09-10',
    );
    const cleared = toggleBossSelection(
      selected,
      'lotus',
      'hard',
      undefined,
      '2026-09-10',
    );
    expect(cleared.entries).toEqual([]);
    expect(cleared.weeklyDecisions?.['2026-09-10']).toEqual({
      lotus: 'excluded',
    });
  });

  it('다시 켜면 제외 기억이 사라진다', () => {
    let character = toggleBossSelection(
      emptyCharacter(),
      'lotus',
      'hard',
      undefined,
      '2026-09-10',
    );
    character = toggleBossSelection(
      character,
      'lotus',
      'hard',
      undefined,
      '2026-09-10',
    );
    character = toggleBossSelection(
      character,
      'lotus',
      'hard',
      undefined,
      '2026-09-10',
    );
    expect(character.weeklyDecisions?.['2026-09-10']).toEqual({});
    expect(character.entries.map((entry) => entry.bossId)).toEqual(['lotus']);
  });
});
