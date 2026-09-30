/**
 * 지난 주 수익을 확정한다.
 * - 캐릭터의 주차별 스냅샷(weeklyByWeek)을 기준으로 두고
 * - 그 주 수요일 API 완료만 추가한다. API 미완료로는 스냅샷을 지우지 않는다.
 * - 이미 기록된 주간 수익보다 API가 작으면 기존 기록을 잠근다.
 */

import type { Character } from "../types";
import { BOSS_MAP } from "../data/crystalData";
import { computeAccount } from "./calc";
import {
  monthlyEntriesFromState,
  monthlyEntriesOf,
} from "./monthlyBoss";
import {
  isWeekChecked,
  loadHistory,
  upsertWeekRecord,
  type WeekRecord,
} from "./history";
import {
  fetchScheduler,
  schedulerReliability,
  type SchedulerState,
} from "./scheduler";
import { canQueryNexonDate, shiftWeek, weekEndDate, weekKey } from "./week";
import {
  getWeeklyArchive,
  mergeWeeklyEntries,
  weeklyEntriesFromState,
} from "./weeklyBoss";

/** 한 번에 확인할 최대 과거 주차 수 (14일 창 안에서 보통 1~2주) */
const MAX_PAST_WEEKS = 2;

export interface FinalizeResult {
  records: WeekRecord[];
  finalizedWeeks: string[];
}

function linkedCharacters(characters: Character[]): Character[] {
  return characters.filter((c) => c.meta?.ocid && c.meta.accountId);
}

function monthlyForWeek(
  character: Character,
  state: SchedulerState,
): Character["entries"] {
  const evidence = monthlyEntriesFromState(state, character);
  if (evidence.length > 0) return evidence;
  if (schedulerReliability(state).monthlyBosses) return [];
  return monthlyEntriesOf(character);
}

export function projectCharacterForWeek(
  character: Character,
  week: string,
  state: SchedulerState | null,
): Character {
  const archived = getWeeklyArchive(character, week);
  if (!state) {
    return {
      ...character,
      entries: [...archived, ...monthlyEntriesOf(character)],
    };
  }

  const apiWeekly = schedulerReliability(state).weeklyBosses
    ? weeklyEntriesFromState(state, {
        ...character,
        entries: archived,
      })
    : [];
  const weekly = mergeWeeklyEntries(archived, apiWeekly);
  return {
    ...character,
    entries: [...weekly, ...monthlyForWeek(character, state)],
  };
}

function summaryFromSchedules(
  characters: Character[],
  week: string,
  schedules: Map<string, SchedulerState | null>,
  dateISO: string,
) {
  const projected = characters.map((character) =>
    projectCharacterForWeek(
      character,
      week,
      schedules.get(character.id) ?? null,
    ),
  );
  return computeAccount(projected, BOSS_MAP, dateISO);
}

function hasWeeklyEvidence(
  characters: Character[],
  week: string,
  schedules: Map<string, SchedulerState | null>,
): boolean {
  return characters.some((character) => {
    if (getWeeklyArchive(character, week).length > 0) return true;
    const state = schedules.get(character.id);
    return Boolean(state && schedulerReliability(state).weeklyBosses);
  });
}

async function fetchWeekSchedules(
  characters: Character[],
  date?: string,
): Promise<Map<string, SchedulerState | null>> {
  const linked = linkedCharacters(characters);
  const pairs = await Promise.all(
    linked.map(async (character) => {
      try {
        const state = await fetchScheduler(
          character.meta!.ocid!,
          character.meta!.accountId!,
          date ? { date, force: true } : { force: true },
        );
        return [character.id, state] as const;
      } catch {
        return [character.id, null] as const;
      }
    }),
  );
  return new Map(pairs);
}

function lockExisting(
  existing: WeekRecord,
  now: Date,
): WeekRecord {
  return {
    ...existing,
    updatedAt: now.toISOString(),
    finalized: true,
    unrecoverable: false,
  };
}

/**
 * 미확정 지난 주를 최대 MAX_PAST_WEEKS개까지 처리한다.
 * 주차별 스냅샷과 API 완료를 합쳐 수익을 계산한다.
 */
export async function finalizePendingWeeks(
  characters: Character[],
  now: Date = new Date(),
): Promise<FinalizeResult> {
  let records = loadHistory();
  const finalizedWeeks: string[] = [];
  const currentWeek = weekKey("thu", now);
  if (linkedCharacters(characters).length === 0) {
    return { records, finalizedWeeks };
  }

  for (let i = 1; i <= MAX_PAST_WEEKS; i += 1) {
    records = loadHistory();
    const week = shiftWeek(currentWeek, -i);
    const existing = records.find((r) => r.week === week);
    if (isWeekChecked(existing)) continue;

    const snapshotDate = weekEndDate(week);
    if (!canQueryNexonDate(snapshotDate, now)) {
      if (existing) {
        records = upsertWeekRecord(lockExisting(existing, now));
        finalizedWeeks.push(week);
      } else {
        records = upsertWeekRecord({
          week,
          revenue: 0,
          crystals: 0,
          monthlyBossRevenue: 0,
          characterCount: 0,
          updatedAt: now.toISOString(),
          finalized: true,
          unrecoverable: true,
        });
        finalizedWeeks.push(week);
      }
      continue;
    }

    const schedules = await fetchWeekSchedules(characters, snapshotDate);
    const linked = linkedCharacters(characters);
    if (!hasWeeklyEvidence(linked, week, schedules)) {
      if (existing && existing.revenue > 0) {
        records = upsertWeekRecord(lockExisting(existing, now));
        finalizedWeeks.push(week);
        continue;
      }
      break;
    }

    const summary = summaryFromSchedules(
      characters,
      week,
      schedules,
      snapshotDate,
    );
    if (existing && existing.revenue > summary.weeklyRevenue) {
      records = upsertWeekRecord(lockExisting(existing, now));
    } else {
      records = upsertWeekRecord({
        week,
        revenue: summary.weeklyRevenue,
        crystals: summary.weeklyCrystalCount,
        monthlyBossRevenue: summary.monthlyBossRevenue,
        characterCount: characters.length,
        updatedAt: now.toISOString(),
        finalized: true,
        unrecoverable: false,
      });
    }
    finalizedWeeks.push(week);
  }

  return { records: loadHistory(), finalizedWeeks };
}
