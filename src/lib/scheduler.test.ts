import { describe, expect, it } from 'vitest';
import type { BossEntry } from '../types';
import {
  completedBossKeys,
  culvertProgress,
  entriesEqual,
  entriesFromSchedule,
  epicDungeonProgress,
  weeklyBossProgress,
  type SchedulerState,
} from './scheduler';

function makeState(partial: Partial<SchedulerState>): SchedulerState {
  return {
    date: null,
    weeklyBossClearCount: 0,
    weeklyBossClearLimit: 0,
    bosses: [],
    contents: [],
    ...partial,
  };
}

describe('completedBossKeys', () => {
  it('넥슨 보스명(공백 차이 포함)을 앱 보스 id로 매핑한다', () => {
    const keys = completedBossKeys(
      makeState({
        bosses: [
          // 넥슨은 "블러디퀸"(공백 없음), 앱 데이터는 "블러디 퀸"
          { name: '블러디퀸', difficulty: 'chaos', cycle: 'bossWeekly', complete: true },
          { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
          { name: '검은 마법사', difficulty: 'extreme', cycle: 'bossMonthly', complete: true },
          { name: '스우', difficulty: 'extreme', cycle: 'bossWeekly', complete: false },
        ],
      }),
    );
    expect(keys).toContain('bloody-queen-weekly:chaos');
    expect(keys).toContain('lotus:hard');
    expect(keys).toContain('black-mage:extreme');
    expect(keys).not.toContain('lotus:extreme');
  });

  it('앱에 없는 보스(시즌 보스 등)는 무시한다', () => {
    const keys = completedBossKeys(
      makeState({
        bosses: [
          { name: '시즌 보스 메이린', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
        ],
      }),
    );
    expect(keys.size).toBe(0);
  });
});

describe('entriesFromSchedule', () => {
  const state = makeState({
    bosses: [
      { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
      { name: '데미안', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
      { name: '검은 마법사', difficulty: 'extreme', cycle: 'bossMonthly', complete: true },
      { name: '루시드', difficulty: 'easy', cycle: 'bossWeekly', complete: false },
    ],
  });

  it('처치한 주간/월간 보스가 난이도까지 정확히 선택된다', () => {
    const next = entriesFromSchedule([], state);
    expect(next).toEqual([
      { bossId: 'lotus', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'damien', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'black-mage', difficulty: 'extreme', partySize: 1, clearsPerWeek: 7 },
    ]);
  });

  it('기존 파티 인원은 유지되고, 미처치 보스와 옛 일일 보스 항목은 제거된다', () => {
    const current: BossEntry[] = [
      // 과거 저장 데이터의 일일 보스(현재 미지원) → 제거
      { bossId: 'zakum', difficulty: 'normal', partySize: 1, clearsPerWeek: 7 },
      // 이전에 노멀 2인으로 설정했던 스우 → 처치 내역(하드)로 바뀌되 파티 인원 유지
      { bossId: 'lotus', difficulty: 'normal', partySize: 2, clearsPerWeek: 7 },
      // 처치하지 않은 주간 보스는 선택 해제된다
      { bossId: 'will', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
    ];
    const next = entriesFromSchedule(current, state);
    expect(next.some((e) => e.bossId === 'zakum')).toBe(false);
    expect(next).toContainEqual({
      bossId: 'lotus',
      difficulty: 'hard',
      partySize: 2,
      clearsPerWeek: 7,
    });
    expect(next.some((e) => e.bossId === 'will')).toBe(false);
  });

  it('주차 리셋으로 entries가 비어도 partyPrefs의 인원이 다시 적용된다', () => {
    // 목요일 리셋 후 entries는 비었지만, 이전에 저장한 선호(스우 2인)는 남아 있다
    const next = entriesFromSchedule([], state, { lotus: 2, damien: 3 });
    expect(next).toContainEqual({
      bossId: 'lotus',
      difficulty: 'hard',
      partySize: 2,
      clearsPerWeek: 7,
    });
    expect(next).toContainEqual({
      bossId: 'damien',
      difficulty: 'hard',
      partySize: 3,
      clearsPerWeek: 7,
    });
  });

  it('entriesEqual은 순서와 무관하게 동일 설정을 판별한다', () => {
    const a: BossEntry[] = [
      { bossId: 'lotus', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
      { bossId: 'damien', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
    ];
    const b = [...a].reverse().map((e) => ({ ...e }));
    expect(entriesEqual(a, b)).toBe(true);
    expect(entriesEqual(a, [a[0]])).toBe(false);
    expect(entriesEqual(a, [a[0], { ...a[1], partySize: 2 }])).toBe(false);
  });
});

describe('weeklyBossProgress', () => {
  it('보스별 complete 플래그에서 처치 수를 직접 센다 (넥슨 카운터 오차 대비)', () => {
    const p = weeklyBossProgress(
      makeState({
        // 넥슨 카운터는 1로 오지만 실제 플래그는 2마리 처치
        weeklyBossClearCount: 1,
        weeklyBossClearLimit: 12,
        bosses: [
          { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
          { name: '데미안', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
          { name: '윌', difficulty: 'hard', cycle: 'bossWeekly', complete: false },
          // 월간 보스는 주간 카운트에서 제외
          { name: '검은 마법사', difficulty: 'hard', cycle: 'bossMonthly', complete: true },
        ],
      }),
    );
    expect(p).toEqual({ done: 2, total: 12, complete: false });
  });

  it('같은 보스가 여러 난이도로 완료돼도 1마리로 센다', () => {
    const p = weeklyBossProgress(
      makeState({
        weeklyBossClearLimit: 12,
        bosses: [
          { name: '스우', difficulty: 'normal', cycle: 'bossWeekly', complete: true },
          { name: '스우', difficulty: 'hard', cycle: 'bossWeekly', complete: true },
        ],
      }),
    );
    expect(p.done).toBe(1);
  });

  it('한도가 0으로 내려오면 기본 12를 사용한다', () => {
    const p = weeklyBossProgress(
      makeState({ weeklyBossClearCount: 0, weeklyBossClearLimit: 0 }),
    );
    expect(p.total).toBe(12);
  });
});

describe('culvertProgress', () => {
  it('지하 수로 참여 시 완료 처리한다', () => {
    const p = culvertProgress(
      makeState({
        contents: [{ name: '[길드] 지하 수로', nowCount: 1, maxCount: 0, registered: true }],
      }),
    );
    expect(p.complete).toBe(true);
  });

  it('참여 기록이 없으면 미완료다', () => {
    const p = culvertProgress(
      makeState({
        contents: [{ name: '[길드] 지하 수로', nowCount: 0, maxCount: 0, registered: true }],
      }),
    );
    expect(p.complete).toBe(false);
  });
});

describe('epicDungeonProgress', () => {
  it('등록된 던전의 클리어만 집계한다 (던전당 1회, 주 3회)', () => {
    const p = epicDungeonProgress(
      makeState({
        contents: [
          { name: '에픽 던전 : 하이마운틴', nowCount: 1, maxCount: 0, registered: true },
          { name: '에픽 던전 : 앵글러 컴퍼니', nowCount: 0, maxCount: 0, registered: true },
          // 미등록 항목의 now_count는 신뢰할 수 없어 제외된다
          { name: '에픽 던전 : 악몽선경', nowCount: 5, maxCount: 0, registered: false },
        ],
      }),
    );
    expect(p).toEqual({ done: 1, total: 3, complete: false });
  });
});
