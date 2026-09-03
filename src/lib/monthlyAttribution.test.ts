import { describe, expect, it } from 'vitest';
import type { WeekRecord } from './history';
import {
  attributedWeekRevenue,
  monthlyBossDeltaByWeek,
} from './monthlyAttribution';

function rec(week: string, monthlyBossRevenue: number): WeekRecord {
  return {
    week,
    revenue: 10_000_000,
    crystals: 12,
    monthlyBossRevenue,
    characterCount: 1,
    updatedAt: `${week}T00:00:00.000Z`,
  };
}

describe('monthlyBossDeltaByWeek', () => {
  it('같은 달의 반복 누적 스냅샷을 한 번만 집계한다', () => {
    const records = [
      rec('2026-08-20', 665_000_000),
      rec('2026-08-13', 665_000_000),
      rec('2026-08-06', 665_000_000),
    ];
    const deltas = monthlyBossDeltaByWeek(records);
    expect(deltas.get('2026-08-06')).toBe(665_000_000);
    expect(deltas.get('2026-08-13')).toBe(0);
    expect(deltas.get('2026-08-20')).toBe(0);
  });

  it('같은 달에 완료 캐릭터가 늘면 증가분만 집계한다', () => {
    const records = [
      rec('2026-08-06', 665_000_000),
      rec('2026-08-13', 1_330_000_000),
    ];
    const deltas = monthlyBossDeltaByWeek(records);
    expect(deltas.get('2026-08-06')).toBe(665_000_000);
    expect(deltas.get('2026-08-13')).toBe(665_000_000);
  });

  it('월이 바뀌면 새 월의 누적액을 다시 한 번 집계한다', () => {
    const records = [
      rec('2026-08-27', 665_000_000),
      rec('2026-09-03', 665_000_000),
    ];
    const deltas = monthlyBossDeltaByWeek(records);
    expect(deltas.get('2026-08-27')).toBe(665_000_000);
    expect(deltas.get('2026-09-03')).toBe(665_000_000);
  });

  it('일시 감소 후 복구된 스냅샷을 중복 수익으로 보지 않는다', () => {
    const records = [
      rec('2026-08-06', 665_000_000),
      rec('2026-08-13', 0),
      rec('2026-08-20', 665_000_000),
    ];
    const deltas = monthlyBossDeltaByWeek(records);
    expect(deltas.get('2026-08-06')).toBe(665_000_000);
    expect(deltas.get('2026-08-13')).toBe(0);
    expect(deltas.get('2026-08-20')).toBe(0);
  });
});

describe('attributedWeekRevenue', () => {
  it('월간 포함 옵션에서 해당 주 증가분만 더한다', () => {
    const record = rec('2026-08-06', 665_000_000);
    const deltas = monthlyBossDeltaByWeek([record]);
    expect(attributedWeekRevenue(record, deltas, false)).toBe(10_000_000);
    expect(attributedWeekRevenue(record, deltas, true)).toBe(675_000_000);
  });
});
