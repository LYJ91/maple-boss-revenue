import { describe, expect, it } from "vitest";
import type { BossEntry, Character } from "../types";
import {
  adoptApiSelection,
  conflictKeys,
  conflictOf,
  detectWeeklyConflicts,
  keepManualSelection,
  verifyWeekly,
} from "./bossConflict";
import type { SchedulerState } from "./scheduler";
import { getWeeklyArchive, weeklySelectionCount } from "./weeklyBoss";

const WEEK = "2026-09-17";

function entry(bossId: string, difficulty: string): BossEntry {
  return {
    bossId,
    difficulty: difficulty as BossEntry["difficulty"],
    partySize: 1,
    clearsPerWeek: 7,
  };
}

function character(partial: Partial<Character> = {}): Character {
  return {
    id: "c1",
    name: "꿀꾸리레테",
    entries: [],
    meta: { ocid: "ocid1", accountId: "acc1" },
    weeklyConfirmedWeek: WEEK,
    weeklyByWeek: {
      [WEEK]: [entry("lotus", "hard"), entry("will", "hard")],
    },
    ...partial,
  };
}

function state(partial: Partial<SchedulerState> = {}): SchedulerState {
  return {
    date: null,
    weeklyBossClearCount: 0,
    weeklyBossClearLimit: 12,
    bosses: [],
    contents: [],
    ...partial,
  };
}

/** 주간 보스 행이 있는 정상 응답 (스우만 처치) */
const lotusOnly = state({
  weeklyBossClearCount: 12,
  bosses: [
    { name: "스우", difficulty: "hard", cycle: "bossWeekly", complete: true },
    { name: "윌", difficulty: "hard", cycle: "bossWeekly", complete: false },
  ],
});

/** 카운터만 12이고 보스별 플래그는 전부 미처치인 응답 (월드 이전 사례) */
const flagsEmpty = state({
  weeklyBossClearCount: 12,
  bosses: [
    { name: "스우", difficulty: "hard", cycle: "bossWeekly", complete: false },
    { name: "윌", difficulty: "hard", cycle: "bossWeekly", complete: false },
  ],
});

/** 월간 2행만 내려오는 축약 응답 */
const truncated = state({
  bosses: [
    {
      name: "검은 마법사",
      difficulty: "hard",
      cycle: "bossMonthly",
      complete: false,
    },
  ],
});

describe("conflictOf", () => {
  it("내 선택에만 있는 보스를 충돌로 잡는다", () => {
    const conflict = conflictOf(character(), lotusOnly, WEEK);
    expect(conflict).not.toBeNull();
    expect(conflict!.manualOnly.map((e) => e.bossId)).toEqual(["will"]);
    expect(conflict!.apiCount).toBe(1);
    expect(conflict!.selectedCount).toBe(2);
  });

  it("API가 처치로 준 보스는 묻지 않는다", () => {
    const onlyLotus = character({
      weeklyByWeek: { [WEEK]: [entry("lotus", "hard")] },
    });
    expect(conflictOf(onlyLotus, lotusOnly, WEEK)).toBeNull();
  });

  it("API 난이도가 달라도 같은 보스면 묻지 않는다", () => {
    const normalLotus = character({
      weeklyByWeek: { [WEEK]: [entry("lotus", "normal")] },
    });
    expect(conflictOf(normalLotus, lotusOnly, WEEK)).toBeNull();
  });

  it("축약 응답은 판정하지 않는다", () => {
    expect(conflictOf(character(), truncated, WEEK)).toBeNull();
    expect(conflictOf(character(), undefined, WEEK)).toBeNull();
  });

  it("이미 '내 선택 유지'로 결정한 보스는 다시 묻지 않는다", () => {
    const decided = character({
      weeklyDecisions: { [WEEK]: { will: "manual" } },
    });
    expect(conflictOf(decided, lotusOnly, WEEK)).toBeNull();
  });

  it("12개를 넘으면 축약 응답이어도 알린다", () => {
    const many = character({
      weeklyByWeek: {
        [WEEK]: [
          "lotus",
          "damien",
          "guardian-angel-slime",
          "lucid",
          "will",
          "dusk",
          "dunkel",
          "verus-hilla",
          "seren",
          "kalos",
          "adversary",
          "kaling",
          "bellona",
        ].map((bossId) => entry(bossId, "normal")),
      },
    });
    const conflict = conflictOf(many, truncated, WEEK);
    expect(conflict?.overLimit).toBe(true);
    expect(conflict?.selectedCount).toBe(13);

    // 확인한 뒤에는 같은 주에 다시 뜨지 않는다
    const acknowledged = keepManualSelection(many, WEEK, conflict!);
    expect(conflictOf(acknowledged, truncated, WEEK)).toBeNull();
  });
});

describe("detectWeeklyConflicts", () => {
  it("연동되지 않은 캐릭터는 제외한다", () => {
    const manual = character({ id: "manual", meta: undefined });
    const linked = character();
    const conflicts = detectWeeklyConflicts(
      [manual, linked],
      { ocid1: lotusOnly },
      WEEK,
    );
    expect(conflicts.map((c) => c.characterId)).toEqual(["c1"]);
  });
});

describe("verifyWeekly (화면 표시용 대조)", () => {
  it("8개만 처치했는데 12개를 골랐으면 미확인 수를 그대로 알려준다", () => {
    const twelve = character({
      weeklyByWeek: {
        [WEEK]: [entry("lotus", "hard"), entry("will", "hard")],
      },
    });
    const result = verifyWeekly(twelve, lotusOnly, WEEK);
    expect(result.reliable).toBe(true);
    expect(result.selectedCount).toBe(2);
    expect(result.apiCount).toBe(1);
    expect(result.unverified.map((e) => e.bossId)).toEqual(["will"]);
  });

  it("'내 선택 유지'로 결정한 뒤에도 미확인 사실은 그대로 보인다", () => {
    const decided = character({
      weeklyDecisions: { [WEEK]: { will: "manual" } },
    });
    // 비교 창은 더 묻지 않지만
    expect(conflictOf(decided, lotusOnly, WEEK)).toBeNull();
    // 숫자 옆 표시는 유지된다
    expect(verifyWeekly(decided, lotusOnly, WEEK).unverified).toHaveLength(1);
  });

  it("축약 응답이면 대조 불가로 표시한다", () => {
    const result = verifyWeekly(character(), truncated, WEEK);
    expect(result.reliable).toBe(false);
    expect(result.unverified).toEqual([]);
  });
});

describe("conflictKeys", () => {
  it("충돌을 보스 단위로 식별해 새 차이만 다시 알릴 수 있게 한다", () => {
    const conflict = conflictOf(character(), flagsEmpty, WEEK)!;
    expect(conflictKeys([conflict])).toEqual(["c1:lotus", "c1:will"]);
  });
});

describe("결정 반영", () => {
  it("'내 선택 유지'는 선택을 그대로 두고 결정만 기록한다", () => {
    const current = character();
    const conflict = conflictOf(current, flagsEmpty, WEEK)!;
    const next = keepManualSelection(current, WEEK, conflict);

    expect(weeklySelectionCount(next, WEEK)).toBe(2);
    expect(next.weeklyDecisions?.[WEEK]).toEqual({
      lotus: "manual",
      will: "manual",
    });
    expect(conflictOf(next, flagsEmpty, WEEK)).toBeNull();
  });

  it("'API로 맞춤'은 내 선택에만 있던 보스를 그 주에서 뺀다", () => {
    const current = character();
    const conflict = conflictOf(current, lotusOnly, WEEK)!;
    const next = adoptApiSelection(current, WEEK, conflict);

    expect(getWeeklyArchive(next, WEEK).map((e) => e.bossId)).toEqual([
      "lotus",
    ]);
    expect(next.entries.map((e) => e.bossId)).toEqual(["lotus"]);
    expect(next.weeklyDecisions?.[WEEK]).toEqual({ will: "excluded" });
  });

  it("'API로 맞춤' 후에는 다시 묻지 않는다", () => {
    const current = character();
    const conflict = conflictOf(current, lotusOnly, WEEK)!;
    const next = adoptApiSelection(current, WEEK, conflict);
    expect(conflictOf(next, lotusOnly, WEEK)).toBeNull();
  });
});
