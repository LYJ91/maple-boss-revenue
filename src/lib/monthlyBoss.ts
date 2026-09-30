/**
 * 이번 달 월간 보스 확정.
 * - complete=true 는 완료의 직접 증거로 이번 달에 고정한다.
 * - 축약/빈 응답의 complete=false 로는 이번 달 확정을 지우지 않는다.
 * - 지난달 잔상은 새 달이 되면 집계에서 뺀다.
 */

import type { BossEntry, Character } from "../types";
import { BOSS_MAP, clampPartySize, RULES } from "../data/crystalData";
import {
  bossKey,
  completedBossKeys,
  fetchScheduler,
  schedulerReliability,
  type SchedulerState,
} from "./scheduler";
import { applyWeeklySchedule } from "./weeklyBoss";
import { monthKey, nexonLookbackDates } from "./week";

export { monthKey };

export function isMonthlyEntry(entry: BossEntry): boolean {
  return BOSS_MAP.get(entry.bossId)?.reset === "monthly";
}

export function monthlyEntriesOf(character: Character): BossEntry[] {
  return character.entries.filter(isMonthlyEntry);
}

export function dropUnconfirmedMonthly(
  character: Character,
  month: string,
): Character {
  if (character.monthlyConfirmedMonth === month) return character;
  const entries = character.entries.filter((entry) => !isMonthlyEntry(entry));
  if (entries.length === character.entries.length) return character;
  return { ...character, entries };
}

export function hasCompletedMonthly(state: SchedulerState): boolean {
  return state.bosses.some((boss) => boss.cycle === "bossMonthly" && boss.complete);
}

export function needsMonthlyHistory(state: SchedulerState): boolean {
  return !hasCompletedMonthly(state) && !schedulerReliability(state).monthlyBosses;
}

export function monthlyEntriesFromState(
  state: SchedulerState,
  character: Character,
): BossEntry[] {
  const cleared = completedBossKeys(state);
  const prevByBoss = new Map(character.entries.map((entry) => [entry.bossId, entry]));
  const auto: BossEntry[] = [];
  for (const boss of BOSS_MAP.values()) {
    if (boss.reset !== "monthly") continue;
    let matched: BossEntry["difficulty"] | null = null;
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

/** 라이브 스케줄러를 주간/월간에 반영. 주간은 주차, 월간은 이번 달 확정을 우선한다. */
export function applyLiveSchedule(
  character: Character,
  state: SchedulerState,
  month: string,
  week: string,
): Character {
  const weeklyApplied = applyWeeklySchedule(character, state, week);
  const merged: Character = { ...character, ...weeklyApplied };
  const weeklyAndOther = merged.entries.filter(
    (entry) => !isMonthlyEntry(entry),
  );
  const evidence = monthlyEntriesFromState(state, merged);

  if (evidence.length > 0) {
    return {
      ...merged,
      entries: [...weeklyAndOther, ...evidence],
      monthlyConfirmedMonth: month,
    };
  }
  if (merged.monthlyConfirmedMonth === month) {
    return {
      ...merged,
      entries: [...weeklyAndOther, ...monthlyEntriesOf(merged)],
    };
  }
  return {
    ...merged,
    entries: weeklyAndOther,
  };
}

/** 과거 일자 응답에서 찾은 월간 완료만 반영. 주간 선택은 건드리지 않는다. */
export function applyMonthlyEvidence(
  character: Character,
  state: SchedulerState,
  month: string,
): Character {
  const evidence = monthlyEntriesFromState(state, character);
  if (evidence.length === 0) return character;
  return {
    ...character,
    entries: [
      ...character.entries.filter((entry) => !isMonthlyEntry(entry)),
      ...evidence,
    ],
    monthlyConfirmedMonth: month,
  };
}

export async function findMonthlyEvidenceThisMonth(
  ocid: string,
  accountId: string,
  month: string,
  todayISO: string,
  fetchState: typeof fetchScheduler = fetchScheduler,
): Promise<SchedulerState | null> {
  for (const date of nexonLookbackDates(todayISO)) {
    if (!date.startsWith(month)) continue;
    const state = await fetchState(ocid, accountId, {
      date,
      force: true,
    });
    if (hasCompletedMonthly(state)) return state;
  }
  return null;
}

export function monthlySyncStatusFor(
  character: Character,
  month: string,
  hasSchedule: boolean,
): "manual" | "ready" | "checking" {
  const { ocid, accountId } = character.meta ?? {};
  if (!ocid || !accountId) return "manual";
  if (character.monthlyConfirmedMonth === month) return "ready";
  if (!hasSchedule && character.monthlyScanMonth !== month) return "checking";
  return "ready";
}
