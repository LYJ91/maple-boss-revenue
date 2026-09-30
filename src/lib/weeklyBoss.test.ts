import { describe, expect, it } from 'vitest';
import type { Character } from '../types';
import { applyLiveSchedule } from './monthlyBoss';
import {
  applyWeeklySchedule,
  dropStaleWeekly,
  weeklyEntriesFromState,
} from './weeklyBoss';
import type { SchedulerState } from './scheduler';

const WEEK = '2026-09-10';
const NEXT_WEEK = '2026-09-17';

function character(partial: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    name: '테스트',
    entries: [],
    partyPrefs: { lotus: 2, will: 3 },
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

const emptyFlags = state({
  weeklyBossClearCount: 12,
  bosses: [
    { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: false },
    { name: '윌', difficulty: 'hard', cycle: 'bossWeekly', complete: false },
    {
      name: '검은 마법사',
      difficulty: 'hard',
      cycle: 'bossMonthly',
      complete: false,
    },
  ],
});

const lotusHard = state({
  bosses: [
    { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
    { name: '윌', difficulty: 'hard', cycle: 'bossWeekly', complete: false },
  ],
});

const lotusExtreme = state({
  bosses: [
    { name: '스우', difficulty: 'extreme', cycle: 'bossWeekly', complete: true },
    { name: '윌', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
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

describe('weeklyEntriesFromState', () => {
  it('complete=true 인 주간 보스만 고르고 파티 선호를 적용한다', () => {
    expect(weeklyEntriesFromState(lotusHard, character())).toEqual([
      {
        bossId: 'lotus',
        difficulty: 'hard',
        partySize: 2,
        clearsPerWeek: 7,
      },
    ]);
  });
});

describe('applyWeeklySchedule', () => {
  it('같은 주에서 API 미완료는 수동 선택을 지우지 않는다', () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyWeeklySchedule(current, emptyFlags, WEEK);
    expect(next.weeklyConfirmedWeek).toBe(WEEK);
    expect(next.entries).toContainEqual({
      bossId: 'will',
      difficulty: 'hard',
      partySize: 3,
      clearsPerWeek: 7,
    });
    expect(next.entries.some((entry) => entry.bossId === 'lotus')).toBe(false);
  });

  it('같은 주에서 API 완료는 추가하고 기존 선택은 유지한다', () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyWeeklySchedule(current, lotusHard, WEEK);
    expect(next.entries.map((entry) => entry.bossId).sort()).toEqual([
      'lotus',
      'will',
    ]);
    expect(next.entries).toContainEqual({
      bossId: 'lotus',
      difficulty: 'hard',
      partySize: 2,
      clearsPerWeek: 7,
    });
  });

  it('같은 주에서 API가 더 높은 난이도면 승급하고 파티 인원은 유지한다', () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      entries: [
        {
          bossId: 'lotus',
          difficulty: 'hard',
          partySize: 2,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyWeeklySchedule(current, lotusExtreme, WEEK);
    expect(next.entries).toContainEqual({
      bossId: 'lotus',
      difficulty: 'extreme',
      partySize: 2,
      clearsPerWeek: 7,
    });
    expect(next.entries).toContainEqual({
      bossId: 'will',
      difficulty: 'hard',
      partySize: 3,
      clearsPerWeek: 7,
    });
  });

  it('주차 스탬프가 없으면 기존 선택을 이번 주로 이어받고 API를 합친다', () => {
    const current = character({
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyWeeklySchedule(current, emptyFlags, WEEK);
    expect(next.weeklyConfirmedWeek).toBe(WEEK);
    expect(next.entries.some((entry) => entry.bossId === 'will')).toBe(true);
  });

  it('새 주차의 정상 응답은 주간 선택을 API 완료만 남긴다', () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyWeeklySchedule(current, lotusHard, NEXT_WEEK);
    expect(next.weeklyConfirmedWeek).toBe(NEXT_WEEK);
    expect(next.entries.map((entry) => entry.bossId)).toEqual(['lotus']);
    expect(next.weeklyByWeek?.[WEEK]).toEqual([
      {
        bossId: 'will',
        difficulty: 'hard',
        partySize: 3,
        clearsPerWeek: 7,
      },
    ]);
    expect(next.weeklyByWeek?.[NEXT_WEEK].map((entry) => entry.bossId)).toEqual([
      'lotus',
    ]);
  });

  it('축약 응답은 주차와 주간 선택을 건드리지 않는다', () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyWeeklySchedule(current, truncated, NEXT_WEEK);
    expect(next.weeklyConfirmedWeek).toBe(WEEK);
    expect(next.entries).toEqual(current.entries);
  });
});

describe('dropStaleWeekly', () => {
  it('지난 주 주간 선택은 집계에서 빼고 스탬프 없는 레거시는 남긴다', () => {
    const stamped = character({
      weeklyConfirmedWeek: WEEK,
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
        {
          bossId: 'black-mage',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    });
    expect(
      dropStaleWeekly(stamped, NEXT_WEEK).entries.map((entry) => entry.bossId),
    ).toEqual(['black-mage']);

    const legacy = character({
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
      ],
    });
    expect(dropStaleWeekly(legacy, NEXT_WEEK).entries).toEqual(legacy.entries);
  });
});

describe('제외 결정', () => {
  it("직접 끈 보스는 API가 처치로 줘도 다시 켜지지 않는다", () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      weeklyDecisions: { [WEEK]: { lotus: 'excluded' } },
      entries: [],
    });
    const next = applyWeeklySchedule(current, lotusHard, WEEK);
    expect(next.entries.some((entry) => entry.bossId === 'lotus')).toBe(false);
  });

  it("제외하지 않은 보스는 그대로 추가된다", () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      weeklyDecisions: { [WEEK]: { will: 'excluded' } },
      entries: [],
    });
    const next = applyWeeklySchedule(current, lotusExtreme, WEEK);
    expect(next.entries.map((entry) => entry.bossId)).toEqual(['lotus']);
  });
});

describe('applyLiveSchedule weekly merge', () => {
  it('월간 확정과 주간 수동 선택을 함께 유지한다', () => {
    const current = character({
      weeklyConfirmedWeek: WEEK,
      monthlyConfirmedMonth: '2026-09',
      entries: [
        {
          bossId: 'will',
          difficulty: 'hard',
          partySize: 3,
          clearsPerWeek: 7,
        },
        {
          bossId: 'black-mage',
          difficulty: 'hard',
          partySize: 1,
          clearsPerWeek: 7,
        },
      ],
    });
    const next = applyLiveSchedule(current, emptyFlags, '2026-09', WEEK);
    expect(next.entries.some((entry) => entry.bossId === 'will')).toBe(true);
    expect(next.entries.some((entry) => entry.bossId === 'black-mage')).toBe(
      true,
    );
  });
});
