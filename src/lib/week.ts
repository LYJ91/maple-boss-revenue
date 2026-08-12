/**
 * 주간 리셋 주차 계산.
 * 메이플 주간 콘텐츠는 리셋 요일이 둘로 나뉜다:
 * - 목요일 0시: 주간 보스, 에픽 던전 등
 * - 월요일 0시: 길드 콘텐츠(지하수로 등)
 * 체크 상태는 "해당 주차의 리셋 날짜(YYYY-MM-DD)"를 키로 저장하고,
 * 현재 주차 키와 다르면 리셋된 것으로 간주한다.
 */

import type { ResetDay } from "../types";

const DAY_INDEX: Record<ResetDay, number> = { mon: 1, thu: 4 };

export const RESET_DAY_LABEL: Record<ResetDay, string> = {
  mon: "주간(월)",
  thu: "주간(목)",
};

/** 기준 시각(now)이 속한 주차의 리셋 날짜를 YYYY-MM-DD로 반환 (로컬 기준) */
export function weekKey(resetDay: ResetDay, now: Date = new Date()): string {
  const target = DAY_INDEX[resetDay];
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (d.getDay() - target + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

/** YYYY-MM-DD → 로컬 Date(자정) */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${day}`;
}

/** 주차 키(목요일)의 마지막 날 = 수요일 */
export function weekEndDate(week: string): string {
  const d = parseISODate(week);
  d.setDate(d.getDate() + 6);
  return toISODate(d);
}

/** n주 전 목요일 키 */
export function shiftWeek(week: string, weeks: number): string {
  const d = parseISODate(week);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}

/** 넥슨 스케줄러 과거 조회 가능 여부 (실측: 최대 13일 전) */
export const NEXON_HISTORY_LOOKBACK_DAYS = 13;

export function daysBeforeToday(iso: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = parseISODate(iso);
  return Math.round((today.getTime() - target.getTime()) / 86_400_000);
}

export function canQueryNexonDate(
  iso: string,
  now: Date = new Date(),
): boolean {
  const age = daysBeforeToday(iso, now);
  return age >= 1 && age <= NEXON_HISTORY_LOOKBACK_DAYS;
}
