/**
 * 이번 주 주간 보스 확정.
 * - API complete=true 는 이번 주에 추가한다.
 * - 같은 주의 API 미완료/축약으로는 이미 켠 주간 보스를 끄지 않는다.
 * - 주차가 바뀌면 주간 선택은 API 완료만 남기고, 지난 주는 weeklyByWeek에 둔다.
 */

import type {
  BossEntry,
  Character,
  Difficulty,
  WeeklyDecision,
} from "../types";
import { BOSSES, BOSS_MAP, clampPartySize, RULES } from "../data/crystalData";
import {
  bossKey,
  completedBossKeys,
  schedulerReliability,
  type SchedulerState,
} from "./scheduler";
import { shiftWeek } from "./week";

/** 현재 주 포함 최근 몇 주를 캐릭터 상태에 남길지 */
export const WEEKLY_ARCHIVE_WEEKS = 4;

export function isWeeklyEntry(entry: BossEntry): boolean {
  return BOSS_MAP.get(entry.bossId)?.reset === "weekly";
}

export function weeklyEntriesOf(character: Character): BossEntry[] {
  return character.entries.filter(isWeeklyEntry);
}

/** 지난 주 잔상은 집계/표시에서 뺀다. 주차 스탬프가 없으면 레거시로 유지한다. */
export function dropStaleWeekly(
  character: Character,
  week: string,
): Character {
  if (
    character.weeklyConfirmedWeek == null ||
    character.weeklyConfirmedWeek === week
  ) {
    return character;
  }
  const entries = character.entries.filter((entry) => !isWeeklyEntry(entry));
  if (entries.length === character.entries.length) return character;
  return { ...character, entries };
}

export function isSameWeeklyWeek(character: Character, week: string): boolean {
  return (
    character.weeklyConfirmedWeek == null ||
    character.weeklyConfirmedWeek === week
  );
}

function difficultyIndex(bossId: string, difficulty: Difficulty): number {
  const boss = BOSS_MAP.get(bossId);
  if (!boss) return -1;
  return boss.variants.findIndex((variant) => variant.difficulty === difficulty);
}

export function weeklyEntriesFromState(
  state: SchedulerState,
  character: Character,
): BossEntry[] {
  const cleared = completedBossKeys(state);
  const prevByBoss = new Map(
    character.entries.map((entry) => [entry.bossId, entry]),
  );
  const auto: BossEntry[] = [];
  for (const boss of BOSSES) {
    if (boss.reset !== "weekly") continue;
    let matched: Difficulty | null = null;
    for (const variant of boss.variants) {
      if (cleared.has(bossKey(boss.id, variant.difficulty))) {
        matched = variant.difficulty;
      }
    }
    if (!matched) continue;
    const prev = prevByBoss.get(boss.id);
    const requested = character.partyPrefs?.[boss.id] ?? prev?.partySize ?? 1;
    auto.push({
      bossId: boss.id,
      difficulty: matched,
      partySize: clampPartySize(boss, matched, requested),
      clearsPerWeek: prev?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
    });
  }
  return auto;
}

export function mergeWeeklyEntries(
  kept: BossEntry[],
  incoming: BossEntry[],
): BossEntry[] {
  const byId = new Map(kept.map((entry) => [entry.bossId, entry]));
  for (const entry of incoming) {
    const current = byId.get(entry.bossId);
    if (!current) {
      byId.set(entry.bossId, entry);
      continue;
    }
    if (
      difficultyIndex(entry.bossId, entry.difficulty) >
      difficultyIndex(entry.bossId, current.difficulty)
    ) {
      byId.set(entry.bossId, {
        ...entry,
        partySize: current.partySize,
        clearsPerWeek: current.clearsPerWeek,
      });
    }
  }
  return BOSSES.filter((boss) => boss.reset === "weekly")
    .map((boss) => byId.get(boss.id))
    .filter((entry): entry is BossEntry => Boolean(entry));
}

export function rememberWeekly(
  archives: Record<string, BossEntry[]> | undefined,
  week: string,
  entries: BossEntry[],
  currentWeek = week,
): Record<string, BossEntry[]> {
  const next = { ...(archives ?? {}), [week]: entries };
  const minWeek = shiftWeek(currentWeek, -(WEEKLY_ARCHIVE_WEEKS - 1));
  return Object.fromEntries(
    Object.entries(next).filter(([key]) => key >= minWeek),
  );
}

export function getWeeklyArchive(
  character: Character,
  week: string,
): BossEntry[] {
  const stored = character.weeklyByWeek?.[week];
  if (stored) return stored;
  if (character.weeklyConfirmedWeek === week) return weeklyEntriesOf(character);
  return [];
}

/**
 * 그 주의 확정된 주간 보스 수.
 * 보스수익의 수익 계산과 체크리스트의 n/12가 모두 이 값을 쓴다.
 */
export function weeklySelectionCount(
  character: Character,
  week: string,
): number {
  return getWeeklyArchive(character, week).length;
}

export function weeklyDecisionsOf(
  character: Character,
  week: string,
): Record<string, WeeklyDecision> {
  return character.weeklyDecisions?.[week] ?? {};
}

/** 결정을 그 주에 기록한다. 보관 주차 밖의 결정은 함께 정리한다. */
export function withWeeklyDecisions(
  character: Character,
  week: string,
  decisions: Record<string, WeeklyDecision>,
  currentWeek = week,
): Character {
  const merged = {
    ...(character.weeklyDecisions ?? {}),
    [week]: { ...weeklyDecisionsOf(character, week), ...decisions },
  };
  const minWeek = shiftWeek(currentWeek, -(WEEKLY_ARCHIVE_WEEKS - 1));
  return {
    ...character,
    weeklyDecisions: Object.fromEntries(
      Object.entries(merged).filter(([key]) => key >= minWeek),
    ),
  };
}

export function withWeeklyArchive(
  character: Character,
  week: string,
  weekly = weeklyEntriesOf(character),
): Character {
  return {
    ...character,
    weeklyConfirmedWeek: week,
    weeklyByWeek: rememberWeekly(character.weeklyByWeek, week, weekly, week),
  };
}

/**
 * 그 주의 주간 선택을 지정한 목록으로 바꾼다.
 * 현재 확정 주차면 화면에 쓰이는 entries도 함께 맞춘다.
 */
export function setWeeklySelection(
  character: Character,
  week: string,
  weekly: BossEntry[],
): Character {
  const isCurrent =
    character.weeklyConfirmedWeek == null ||
    character.weeklyConfirmedWeek === week;
  const entries = isCurrent
    ? [
        ...character.entries.filter((entry) => !isWeeklyEntry(entry)),
        ...weekly,
      ]
    : character.entries;
  return {
    ...character,
    entries,
    ...(isCurrent ? { weeklyConfirmedWeek: week } : {}),
    weeklyByWeek: rememberWeekly(character.weeklyByWeek, week, weekly, week),
  };
}

/** 라이브 스케줄러를 이번 주 주간 선택에 반영한다. */
export function applyWeeklySchedule(
  character: Character,
  state: SchedulerState,
  week: string,
): Pick<Character, "entries" | "weeklyConfirmedWeek" | "weeklyByWeek"> {
  const nonWeekly = character.entries.filter((entry) => !isWeeklyEntry(entry));
  const currentWeekly = weeklyEntriesOf(character);
  let archives = character.weeklyByWeek;

  if (
    character.weeklyConfirmedWeek &&
    character.weeklyConfirmedWeek !== week
  ) {
    archives = rememberWeekly(
      archives,
      character.weeklyConfirmedWeek,
      currentWeekly,
      week,
    );
  }

  if (!schedulerReliability(state).weeklyBosses) {
    const stamp = character.weeklyConfirmedWeek;
    return {
      entries: [...nonWeekly, ...currentWeekly],
      weeklyConfirmedWeek: stamp,
      weeklyByWeek: stamp
        ? rememberWeekly(archives, stamp, currentWeekly, stamp)
        : archives,
    };
  }

  // 사용자가 직접 끈 보스는 API가 처치로 줘도 다시 켜지 않는다.
  const decisions = weeklyDecisionsOf(character, week);
  const apiWeekly = weeklyEntriesFromState(state, {
    ...character,
    entries: currentWeekly,
  }).filter((entry) => decisions[entry.bossId] !== "excluded");
  const weekly = isSameWeeklyWeek(character, week)
    ? mergeWeeklyEntries(currentWeekly, apiWeekly)
    : apiWeekly;

  return {
    entries: [...nonWeekly, ...weekly],
    weeklyConfirmedWeek: week,
    weeklyByWeek: rememberWeekly(archives, week, weekly, week),
  };
}
