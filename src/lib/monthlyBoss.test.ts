import { describe, expect, it, vi } from 'vitest';
import { BOSS_MAP } from '../data/crystalData';
import type { Character } from '../types';
import { computeAccount } from './calc';
import {
  applyLiveSchedule,
  applyMonthlyEvidence,
  dropUnconfirmedMonthly,
  findMonthlyEvidenceThisMonth,
  hasCompletedMonthly,
  monthKey,
  monthlySyncStatusFor,
  needsMonthlyHistory,
} from './monthlyBoss';
import type { SchedulerState } from './scheduler';

function character(partial: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    name: '테스트',
    entries: [],
    partyPrefs: { 'black-mage': 2 },
    meta: { ocid: 'ocid1', accountId: 'acc1' },
    ...partial,
  };
}

function state(partial: Partial<SchedulerState>): SchedulerState {
  return {
    date: null,
    weeklyBossClearCount: 0,
    weeklyBossClearLimit: 12,
    bosses: [],
    contents: [],
    ...partial,
  };
}

const septemberFalse = state({
  bosses: [
    { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
    {
      name: '검은 마법사',
      difficulty: 'hard',
      cycle: 'bossMonthly',
      complete: false,
    },
    {
      name: '검은 마법사',
      difficulty: 'extreme',
      cycle: 'bossMonthly',
      complete: false,
    },
  ],
});

const septemberHard = state({
  bosses: [
    { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
    {
      name: '검은 마법사',
      difficulty: 'hard',
      cycle: 'bossMonthly',
      complete: true,
    },
  ],
});

const truncated = state({
  bosses: [
    {
      name: '검은 마법사',
      difficulty: 'hard',
      cycle: 'bossMonthly',
      complete: false,
    },
    {
      name: '검은 마법사',
      difficulty: 'extreme',
      cycle: 'bossMonthly',
      complete: false,
    },
  ],
});

describe('monthKey', () => {
  it('날짜에서 달만 뽑는다', () => {
    expect(monthKey('2026-09-08')).toBe('2026-09');
  });
});

describe('applyLiveSchedule', () => {
  it('이번 달 complete=true 는 월간 1/1로 확정한다', () => {
    const next = applyLiveSchedule(
      character(),
      septemberHard,
      '2026-09',
      '2026-09-03',
    );
    expect(next.monthlyConfirmedMonth).toBe('2026-09');
    expect(next.entries).toContainEqual({
      bossId: 'black-mage',
      difficulty: 'hard',
      partySize: 2,
      clearsPerWeek: 7,
    });
    expect(next.entries.some((entry) => entry.bossId === 'lotus')).toBe(true);
  });

  it('이번 달 정상 응답의 미완료는 지난달 잔상을 제거한다', () => {
    const leftover = character({
      monthlyConfirmedMonth: '2026-08',
      entries: [
        {
          bossId: 'black-mage',
          difficulty: 'extreme',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyLiveSchedule(
      leftover,
      septemberFalse,
      '2026-09',
      '2026-09-03',
    );
    expect(next.monthlyConfirmedMonth).toBe('2026-08');
    expect(next.entries.some((entry) => entry.bossId === 'black-mage')).toBe(
      false,
    );
  });

  it('이번 달 확정 후에는 축약 미완료로 지우지 않는다', () => {
    const confirmed = character({
      monthlyConfirmedMonth: '2026-09',
      entries: [
        {
          bossId: 'lotus',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
        {
          bossId: 'black-mage',
          difficulty: 'hard',
          partySize: 2,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyLiveSchedule(
      confirmed,
      truncated,
      '2026-09',
      '2026-09-03',
    );
    expect(next.entries).toContainEqual({
      bossId: 'black-mage',
      difficulty: 'hard',
      partySize: 2,
      clearsPerWeek: 7,
    });
  });

  it('이번 달 확정 후에는 정상 응답의 false도 완료를 유지한다', () => {
    const confirmed = character({
      monthlyConfirmedMonth: '2026-09',
      entries: [
        {
          bossId: 'black-mage',
          difficulty: 'hard',
          partySize: 2,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyLiveSchedule(
      confirmed,
      septemberFalse,
      '2026-09',
      '2026-09-03',
    );
    expect(next.entries.some((entry) => entry.bossId === 'black-mage')).toBe(
      true,
    );
    expect(next.entries.some((entry) => entry.bossId === 'lotus')).toBe(true);
  });
});

describe('account monthly count', () => {
  it('이번 달 확정된 캐릭터만 월간 n/m에 포함한다', () => {
    const cleared = character({
      id: 'cleared',
      monthlyConfirmedMonth: '2026-09',
      entries: [
        {
          bossId: 'black-mage',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    });
    const leftover = character({
      id: 'leftover',
      monthlyConfirmedMonth: '2026-08',
      entries: [
        {
          bossId: 'black-mage',
          difficulty: 'extreme',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    });
    const empty = character({ id: 'empty' });
    const summary = computeAccount(
      [cleared, leftover, empty].map((item) =>
        dropUnconfirmedMonthly(item, '2026-09'),
      ),
      BOSS_MAP,
      '2026-09-08',
    );
    expect(summary.monthlyBossSelected).toBe(1);
    expect(summary.monthlyBossTotal).toBe(3);
  });
});

describe('dropUnconfirmedMonthly', () => {
  it('이번 달 미확정 월간 entry는 집계에서 뺀다', () => {
    const leftover = character({
      entries: [
        {
          bossId: 'black-mage',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    });
    expect(
      dropUnconfirmedMonthly(leftover, '2026-09').entries,
    ).toEqual([]);
  });
});

describe('monthly helpers', () => {
  it('축약 응답은 과거 조회가 필요하다', () => {
    expect(hasCompletedMonthly(truncated)).toBe(false);
    expect(needsMonthlyHistory(truncated)).toBe(true);
    expect(needsMonthlyHistory(septemberFalse)).toBe(false);
  });

  it('연동 캐릭터는 스케줄 전이면 확인 중, 확정되면 ready', () => {
    expect(monthlySyncStatusFor(character(), '2026-09', false)).toBe(
      'checking',
    );
    expect(
      monthlySyncStatusFor(
        character({ monthlyConfirmedMonth: '2026-09' }),
        '2026-09',
        false,
      ),
    ).toBe('ready');
    expect(monthlySyncStatusFor(character(), '2026-09', true)).toBe('ready');
  });
});

describe('applyMonthlyEvidence', () => {
  it('과거 일자 완료는 주간 선택을 유지한 채 월간만 확정한다', () => {
    const current = character({
      entries: [
        {
          bossId: 'lotus',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyMonthlyEvidence(current, septemberHard, '2026-09');
    expect(next.monthlyConfirmedMonth).toBe('2026-09');
    expect(next.entries.map((entry) => entry.bossId).sort()).toEqual([
      'black-mage',
      'lotus',
    ]);
  });
});

describe('findMonthlyEvidenceThisMonth', () => {
  it('이번 달 과거 일자에서 complete=true를 찾으면 그 응답을 반환한다', async () => {
    const fetchState = vi.fn().mockResolvedValue(septemberHard);
    const found = await findMonthlyEvidenceThisMonth(
      'ocid1',
      'acc1',
      '2026-09',
      '2026-09-08',
      fetchState,
    );
    expect(found).not.toBeNull();
    expect(fetchState).toHaveBeenCalled();
    expect(fetchState.mock.calls[0][2]).toEqual({
      date: '2026-09-07',
      force: true,
    });
  });

  it('이번 달 일자에 완료가 없으면 null이다', async () => {
    const fetchState = vi.fn().mockResolvedValue(septemberFalse);
    const found = await findMonthlyEvidenceThisMonth(
      'ocid1',
      'acc1',
      '2026-09',
      '2026-09-08',
      fetchState,
    );
    expect(found).toBeNull();
  });
});
