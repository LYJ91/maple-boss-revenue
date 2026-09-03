/**
 * 지난 주 수익을 스케줄러 과거 조회로 확정한다.
 * - finalized/unrecoverable 주는 API를 다시 호출하지 않음
 * - 파티 인원은 캐릭터에 저장된 partyPrefs / entries를 사용
 */

import type { Character } from "../types";
import { BOSS_MAP } from "../data/crystalData";
import { computeAccount } from "./calc";
import {
  isWeekChecked,
  loadHistory,
  upsertWeekRecord,
  type WeekRecord,
} from "./history";
import {
  entriesFromSchedule,
  fetchScheduler,
  schedulerReliability,
  type SchedulerState,
} from "./scheduler";
import { canQueryNexonDate, shiftWeek, weekEndDate, weekKey } from "./week";

/** 한 번에 확인할 최대 과거 주차 수 (14일 창 안에서 보통 1~2주) */
const MAX_PAST_WEEKS = 2;

export interface FinalizeResult {
  records: WeekRecord[];
  finalizedWeeks: string[];
}

function linkedCharacters(characters: Character[]): Character[] {
  return characters.filter((c) => c.meta?.ocid && c.meta.accountId);
}

function summaryFromSchedules(
  characters: Character[],
  schedules: Map<string, SchedulerState>,
  dateISO: string,
) {
  if (
    [...schedules.values()].some(
      (schedule) => !schedulerReliability(schedule).weeklyBosses,
    )
  ) {
    return null;
  }
  const projected = characters.map((character) => {
    const state = schedules.get(character.id);
    if (!state) return character;
    return {
      ...character,
      entries: entriesFromSchedule(
        character.entries,
        state,
        character.partyPrefs ?? {},
      ),
    };
  });
  return computeAccount(projected, BOSS_MAP, dateISO);
}

async function fetchWeekSchedules(
  characters: Character[],
  date?: string,
): Promise<Map<string, SchedulerState> | null> {
  const linked = linkedCharacters(characters);
  if (linked.length === 0) return new Map();
  try {
    const pairs = await Promise.all(
      linked.map(async (character) => {
        const state = await fetchScheduler(
          character.meta!.ocid!,
          character.meta!.accountId!,
          date ? { date, force: true } : { force: true },
        );
        return [character.id, state] as const;
      }),
    );
    return new Map(pairs);
  } catch {
    // 일시 오류는 다음 접속에서 재시도
    return null;
  }
}

/**
 * 미확정 지난 주를 최대 MAX_PAST_WEEKS개까지 처리한다.
 * 현재 캐릭터 목록(entries의 파티 인원 포함)을 기준으로 수익을 계산한다.
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
    // 이번 주 라이브 갱신과 경합하지 않도록 매번 최신 캐시를 읽는다
    records = loadHistory();
    const week = shiftWeek(currentWeek, -i);
    const existing = records.find((r) => r.week === week);
    if (isWeekChecked(existing)) continue;

    const snapshotDate = weekEndDate(week);
    if (!canQueryNexonDate(snapshotDate, now)) {
      if (existing) {
        records = upsertWeekRecord({
          ...existing,
          updatedAt: now.toISOString(),
          finalized: true,
          unrecoverable: false,
        });
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
    if (!schedules) break;

    const summary = summaryFromSchedules(characters, schedules, snapshotDate);
    if (!summary) break;
    records = upsertWeekRecord({
      week,
      revenue: summary.weeklyRevenue,
      crystals: summary.weeklyCrystalCount,
      // 월간 누적 스냅샷. 표시/통계 단계에서 월별 증가분으로 환산한다.
      monthlyBossRevenue: summary.monthlyBossRevenue,
      characterCount: characters.length,
      updatedAt: now.toISOString(),
      finalized: true,
      unrecoverable: false,
    });
    finalizedWeeks.push(week);
  }

  return { records: loadHistory(), finalizedWeeks };
}
