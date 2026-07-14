import { beforeEach, describe, expect, it } from 'vitest';
import { loadHistory, recordCurrentWeek, weekRangeLabel } from './history';

// node 환경용 localStorage 스텁
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

const data = {
  revenue: 1_000_000,
  crystals: 12,
  monthlyBossRevenue: 0,
  characterCount: 3,
};

describe('recordCurrentWeek', () => {
  it('같은 주는 덮어쓰고, 다른 주는 별도 기록으로 남긴다', () => {
    // 2026-07-14(화) → 주차 키 2026-07-09(목)
    recordCurrentWeek(data, new Date(2026, 6, 14));
    recordCurrentWeek({ ...data, revenue: 2_000_000 }, new Date(2026, 6, 15));
    // 다음 주 목요일
    recordCurrentWeek({ ...data, revenue: 500_000 }, new Date(2026, 6, 16));

    const records = loadHistory();
    expect(records).toHaveLength(2);
    expect(records[0].week).toBe('2026-07-16');
    expect(records[0].revenue).toBe(500_000);
    expect(records[1].week).toBe('2026-07-09');
    expect(records[1].revenue).toBe(2_000_000); // 같은 주 마지막 값으로 갱신
  });
});

describe('weekRangeLabel', () => {
  it('목요일 시작 ~ 수요일 종료 범위를 표시한다', () => {
    expect(weekRangeLabel('2026-07-09')).toBe('7/9(목) ~ 7/15(수)');
    // 월말을 넘어가는 주
    expect(weekRangeLabel('2026-07-30')).toBe('7/30(목) ~ 8/5(수)');
  });
});
