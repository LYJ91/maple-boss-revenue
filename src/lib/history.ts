/**
 * 주간 수익 기록.
 * - 이번 주: 사이트 접속 시 실시간 스케줄러로 계속 갱신 (finalized=false)
 * - 지난 주: API로 한 번 확정하면 finalized=true 로 잠그고 재조회하지 않음
 */

import { weekKey } from "./week";
import { notifyHistory } from "./sync";

const STORAGE_KEY = "maple-boss-revenue:history:v1";
/** 보관할 최대 주차 수 (약 1년) */
const MAX_WEEKS = 52;

export interface WeekRecord {
  /** 주차 키 = 해당 주 목요일 날짜 (YYYY-MM-DD) */
  week: string;
  /** 판매 제한 반영 후 주간 수익 (메소) */
  revenue: number;
  /** 판매로 집계된 결정 수 */
  crystals: number;
  /**
   * 해당 주 시점의 월간 보스 누적 수익 스냅샷.
   * 주간 수익이 아니므로 표시/통계에서는 월별 증가분으로 환산한다.
   */
  monthlyBossRevenue: number;
  /** 집계에 포함된 캐릭터 수 */
  characterCount: number;
  /** 마지막 갱신 시각 (ISO) */
  updatedAt: string;
  /**
   * true면 API(또는 창 만료 시 마지막 스냅샷)로 확정된 지난 주.
   * 이후 같은 주차는 스케줄러를 다시 호출하지 않는다.
   */
  finalized?: boolean;
  /** 복구 창이 지나 데이터를 채우지 못한 주차 (통계에서는 제외) */
  unrecoverable?: boolean;
}

export function loadHistory(): WeekRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WeekRecord[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (r) => typeof r.week === "string" && typeof r.revenue === "number",
          )
          .sort((a, b) => b.week.localeCompare(a.week));
      }
    }
  } catch {
    // 손상된 기록은 무시
  }
  return [];
}

export function writeHistoryCache(records: WeekRecord[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_WEEKS)),
    );
  } catch {
    // 저장 실패는 치명적이지 않음
  }
}

function persist(records: WeekRecord[], changed: WeekRecord): WeekRecord[] {
  const sorted = [...records]
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, MAX_WEEKS);
  writeHistoryCache(sorted);
  notifyHistory(changed);
  return sorted;
}

/** 통계/표시용 — 복구 실패 더미는 제외 */
export function visibleHistory(records: WeekRecord[]): WeekRecord[] {
  return records.filter((r) => !r.unrecoverable);
}

/** 주차가 이미 API 확정(또는 복구 불가 처리)되었는지 */
export function isWeekChecked(record: WeekRecord | undefined): boolean {
  return Boolean(record?.finalized || record?.unrecoverable);
}

/** 임의 주차 기록을 갱신(없으면 생성)하고 전체 기록을 최신순으로 반환 */
export function upsertWeekRecord(
  data: WeekRecord,
  existing: WeekRecord[] = loadHistory(),
): WeekRecord[] {
  const records = existing.filter((r) => r.week !== data.week);
  records.unshift(data);
  return persist(records, data);
}

/**
 * 이번 주 기록을 갱신한다.
 * 이미 finalized된 다른 주차는 건드리지 않으며, 이번 주는 항상 finalized=false.
 */
export function recordCurrentWeek(
  data: Omit<WeekRecord, "week" | "updatedAt" | "finalized" | "unrecoverable">,
  now: Date = new Date(),
): WeekRecord[] {
  const week = weekKey("thu", now);
  return upsertWeekRecord({
    ...data,
    week,
    updatedAt: now.toISOString(),
    finalized: false,
    unrecoverable: false,
  });
}

/** 주차 키(목요일 날짜) → "M/D(목) ~ M/D(수)" 범위 라벨 */
export function weekRangeLabel(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const fmt = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
  return `${fmt(start)}(목) ~ ${fmt(end)}(수)`;
}
