import { describe, expect, it } from 'vitest';
import {
  completedBossKeys,
  culvertProgress,
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

describe('weeklyBossProgress', () => {
  it('처치 수와 한도를 반환한다', () => {
    const p = weeklyBossProgress(
      makeState({ weeklyBossClearCount: 5, weeklyBossClearLimit: 12 }),
    );
    expect(p).toEqual({ done: 5, total: 12, complete: false });
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
