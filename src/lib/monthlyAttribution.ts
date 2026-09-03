import type { WeekRecord } from './history';

/**
 * 주간 기록에 저장된 월간 보스 누적 스냅샷을 실제 증가분으로 바꾼다.
 *
 * 주차 키의 달(목요일 기준)을 월 버킷으로 사용한다. 같은 달에 같은 누적값이
 * 반복돼도 최초 증가분만 잡고, 일시적으로 값이 줄었다 복구돼도 중복 집계하지 않는다.
 */
export function monthlyBossDeltaByWeek(
  records: WeekRecord[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  const maxSeenByMonth = new Map<string, number>();
  const oldestFirst = [...records].sort((a, b) => a.week.localeCompare(b.week));

  for (const record of oldestFirst) {
    const month = record.week.slice(0, 7);
    const previousMax = maxSeenByMonth.get(month) ?? 0;
    const snapshot = Math.max(0, record.monthlyBossRevenue ?? 0);
    result.set(record.week, Math.max(0, snapshot - previousMax));
    maxSeenByMonth.set(month, Math.max(previousMax, snapshot));
  }

  return result;
}

export function attributedWeekRevenue(
  record: WeekRecord,
  monthlyDelta: ReadonlyMap<string, number>,
  includeMonthly: boolean,
): number {
  return (
    record.revenue +
    (includeMonthly ? (monthlyDelta.get(record.week) ?? 0) : 0)
  );
}
