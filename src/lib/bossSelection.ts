import {
  BOSS_MAP,
  clampPartySize,
  RULES,
} from '../data/crystalData';
import type { BossEntry, Character, Difficulty } from '../types';

/** 선택된 주간 보스 수 (UI와 12개 제한이 같은 기준을 사용) */
export function weeklySelectionCount(character: Character): number {
  return character.entries.filter(
    (entry) => BOSS_MAP.get(entry.bossId)?.reset === 'weekly',
  ).length;
}

/** 같은 난이도 재클릭=해제, 다른 난이도 클릭=교체인 순수 선택 로직 */
export function toggleBossSelection(
  character: Character,
  bossId: string,
  difficulty: Difficulty,
): Character {
  const existing = character.entries.find((entry) => entry.bossId === bossId);
  if (existing?.difficulty === difficulty) {
    return {
      ...character,
      entries: character.entries.filter((entry) => entry.bossId !== bossId),
    };
  }

  const boss = BOSS_MAP.get(bossId);
  if (!boss) return character;
  const requestedPartySize =
    character.partyPrefs?.[bossId] ?? existing?.partySize ?? 1;
  const entry: BossEntry = {
    bossId,
    difficulty,
    partySize: clampPartySize(boss, difficulty, requestedPartySize),
    clearsPerWeek:
      existing?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
  };
  const entries = existing
    ? character.entries.map((current) =>
        current.bossId === bossId ? entry : current,
      )
    : [...character.entries, entry];
  return { ...character, entries };
}
