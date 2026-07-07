import { describe, expect, it } from 'vitest';
import { weekKey } from './week';

describe('weekKey', () => {
  // 2026-07-07은 화요일
  const tue = new Date(2026, 6, 7, 12, 0, 0);

  it('목요일 리셋: 화요일 기준으로 직전 목요일을 반환한다', () => {
    expect(weekKey('thu', tue)).toBe('2026-07-02');
  });

  it('월요일 리셋: 화요일 기준으로 직전 월요일을 반환한다', () => {
    expect(weekKey('mon', tue)).toBe('2026-07-06');
  });

  it('리셋 요일 당일은 자기 자신을 반환한다', () => {
    const thu = new Date(2026, 6, 2, 0, 0, 0);
    expect(weekKey('thu', thu)).toBe('2026-07-02');
    const mon = new Date(2026, 6, 6, 23, 59, 59);
    expect(weekKey('mon', mon)).toBe('2026-07-06');
  });

  it('리셋 직전(수요일 밤)과 직후(목요일 0시)는 주차가 달라진다', () => {
    const wedNight = new Date(2026, 6, 8, 23, 59, 59);
    const thuMidnight = new Date(2026, 6, 9, 0, 0, 0);
    expect(weekKey('thu', wedNight)).toBe('2026-07-02');
    expect(weekKey('thu', thuMidnight)).toBe('2026-07-09');
  });

  it('월 경계를 넘어도 올바른 날짜를 계산한다', () => {
    // 2026-08-01은 토요일 → 직전 목요일 7/30, 직전 월요일 7/27
    const sat = new Date(2026, 7, 1, 10, 0, 0);
    expect(weekKey('thu', sat)).toBe('2026-07-30');
    expect(weekKey('mon', sat)).toBe('2026-07-27');
  });
});
