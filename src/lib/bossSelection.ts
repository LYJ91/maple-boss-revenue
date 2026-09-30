import {
  BOSS_MAP,
  clampPartySize,
  RULES,
} from '../data/crystalData';
import type { BossEntry, Character, Difficulty } from '../types';
import {
  isWeeklyEntry,
  rememberWeekly,
  weeklyDecisionsOf,
  weeklyEntriesOf,
  withWeeklyArchive,
  withWeeklyDecisions,
} from './weeklyBoss';

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
  month?: string,
  week?: string,
): Character {
  const boss = BOSS_MAP.get(bossId);
  const staleWeekly =
    boss?.reset === "weekly" &&
    week != null &&
    character.weeklyConfirmedWeek != null &&
    character.weeklyConfirmedWeek !== week;
  const base = staleWeekly
    ? {
        ...character,
        entries: character.entries.filter((entry) => !isWeeklyEntry(entry)),
        weeklyByWeek: rememberWeekly(
          character.weeklyByWeek,
          character.weeklyConfirmedWeek!,
          weeklyEntriesOf(character),
          week,
        ),
      }
    : character;
  const existing = base.entries.find((entry) => entry.bossId === bossId);
  const stampMonthly =
    boss?.reset === "monthly" && month
      ? { monthlyConfirmedMonth: month }
      : {};
  const stampWeekly =
    boss?.reset === "weekly" && week
      ? { weeklyConfirmedWeek: week }
      : {};

  if (existing?.difficulty === difficulty) {
    const next = {
      ...base,
      ...stampMonthly,
      ...stampWeekly,
      entries: base.entries.filter((entry) => entry.bossId !== bossId),
    };
    if (!week || boss?.reset !== "weekly") return next;
    // 직접 끈 보스는 API가 처치로 줘도 다시 켜지지 않도록 기억한다.
    return withWeeklyArchive(
      withWeeklyDecisions(next, week, { [bossId]: "excluded" }),
      week,
    );
  }

  if (!boss) return character;
  const requestedPartySize =
    base.partyPrefs?.[bossId] ?? existing?.partySize ?? 1;
  const entry: BossEntry = {
    bossId,
    difficulty,
    partySize: clampPartySize(boss, difficulty, requestedPartySize),
    clearsPerWeek:
      existing?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
  };
  const entries = existing
    ? base.entries.map((current) =>
        current.bossId === bossId ? entry : current,
      )
    : [...base.entries, entry];
  const next = { ...base, ...stampMonthly, ...stampWeekly, entries };
  if (!week || boss.reset !== "weekly") return next;
  // 다시 켠 보스는 이전 '제외' 결정을 취소한다. API와의 차이는 비교 창에서 묻는다.
  const cleared = weeklyDecisionsOf(next, week);
  const { [bossId]: _removed, ...rest } = cleared;
  return withWeeklyArchive(
    { ...next, weeklyDecisions: { ...next.weeklyDecisions, [week]: rest } },
    week,
  );
}
