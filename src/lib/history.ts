/**
 * 주간 수익 기록.
 * 보스수익 탭에서 계산될 때마다 "이번 주(목요일 리셋 기준)" 기록을 갱신해 저장한다.
 * 주가 넘어가면 새 주차 키로 기록이 시작되고 지난 주 기록은 그대로 남는다.
 */

import { weekKey } from './week';

const STORAGE_KEY = 'maple-boss-revenue:history:v1';
/** 보관할 최대 주차 수 (약 1년) */
const MAX_WEEKS = 52;

export interface WeekRecord {
  /** 주차 키 = 해당 주 목요일 날짜 (YYYY-MM-DD) */
  week: string;
  /** 판매 제한 반영 후 주간 수익 (메소) */
  revenue: number;
  /** 판매로 집계된 결정 수 */
  crystals: number;
  /** 월간 보스 수익 (메소, 해당 주 시점 기준) */
  monthlyBossRevenue: number;
  /** 집계에 포함된 캐릭터 수 */
  characterCount: number;
  /** 마지막 갱신 시각 (ISO) */
  updatedAt: string;
}

export function loadHistory(): WeekRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WeekRecord[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((r) => typeof r.week === 'string' && typeof r.revenue === 'number')
          .sort((a, b) => b.week.localeCompare(a.week));
      }
    }
  } catch {
    // 손상된 기록은 무시
  }
  return [];
}

function save(records: WeekRecord[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_WEEKS)),
    );
  } catch {
    // 저장 실패는 치명적이지 않음
  }
}

/** 이번 주 기록을 갱신(없으면 생성)하고 전체 기록을 최신순으로 반환한다 */
export function recordCurrentWeek(
  data: Omit<WeekRecord, 'week' | 'updatedAt'>,
  now: Date = new Date(),
): WeekRecord[] {
  const week = weekKey('thu', now);
  const records = loadHistory().filter((r) => r.week !== week);
  records.unshift({ ...data, week, updatedAt: now.toISOString() });
  records.sort((a, b) => b.week.localeCompare(a.week));
  save(records);
  return records;
}

/** 주차 키(목요일 날짜) → "M/D(목) ~ M/D(수)" 범위 라벨 */
export function weekRangeLabel(week: string): string {
  const [y, m, d] = week.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const fmt = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;
  return `${fmt(start)}(목) ~ ${fmt(end)}(수)`;
}
