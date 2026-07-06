import { describe, expect, it } from 'vitest';
import { formatMeso } from './format';

describe('formatMeso', () => {
  it('만 단위 미만', () => {
    expect(formatMeso(0)).toBe('0');
    expect(formatMeso(9999)).toBe('9,999');
  });

  it('만/억 단위', () => {
    expect(formatMeso(114_000)).toBe('11만 4,000');
    expect(formatMeso(1_360_000)).toBe('136만');
    expect(formatMeso(574_000_000)).toBe('5억 7,400만');
    expect(formatMeso(8_740_000_000)).toBe('87억 4,000만');
  });

  it('조 단위', () => {
    expect(formatMeso(1_234_500_000_000)).toBe('1조 2,345억');
    expect(formatMeso(12_345_678_901_234)).toBe('12조 3,456억 7,890만 1,234');
  });

  it('음수', () => {
    expect(formatMeso(-551_000)).toBe('-55만 1,000');
  });
});
