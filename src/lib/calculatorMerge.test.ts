import { describe, expect, it } from "vitest";
import type { BossEntry, Character, Difficulty } from "../types";
import { mergeCalculatorState } from "./calculatorMerge";
import type { AppState } from "./storage";

function entry(
  bossId: string,
  partySize: number,
  difficulty: Difficulty = "hard",
): BossEntry {
  return { bossId, difficulty, partySize, clearsPerWeek: 7 };
}

function character(patch: Partial<Character> & { id?: string } = {}): Character {
  return {
    id: patch.id ?? "c1",
    name: patch.name ?? "테스트",
    entries: patch.entries ?? [],
    ...patch,
  };
}

function state(
  characters: Character[],
  selectedId: string | null = characters[0]?.id ?? null,
): AppState {
  return { characters, selectedId };
}

describe("mergeCalculatorState", () => {
  it("로컬이 인원을 안 바꿨고 원격만 바꿨으면 원격 인원을 유지한다", () => {
    const base = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const local = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const remote = state([
      character({ entries: [entry("lotus", 4)], partyPrefs: { lotus: 4 } }),
    ]);
    const merged = mergeCalculatorState(base, local, remote);
    expect(merged.characters[0].entries[0].partySize).toBe(4);
    expect(merged.characters[0].partyPrefs).toEqual({ lotus: 4 });
  });

  it("로컬만 인원을 바꿨으면 로컬 인원을 유지한다", () => {
    const base = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const local = state([
      character({ entries: [entry("lotus", 3)], partyPrefs: { lotus: 3 } }),
    ]);
    const remote = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const merged = mergeCalculatorState(base, local, remote);
    expect(merged.characters[0].entries[0].partySize).toBe(3);
    expect(merged.characters[0].partyPrefs).toEqual({ lotus: 3 });
  });

  it("로컬은 레벨만, 원격은 인원만 바꿨으면 둘 다 유지한다", () => {
    const base = state([
      character({
        meta: { level: 200 },
        entries: [entry("lotus", 1)],
        partyPrefs: { lotus: 1 },
      }),
    ]);
    const local = state([
      character({
        meta: { level: 210 },
        entries: [entry("lotus", 1)],
        partyPrefs: { lotus: 1 },
      }),
    ]);
    const remote = state([
      character({
        meta: { level: 200 },
        entries: [entry("lotus", 4)],
        partyPrefs: { lotus: 4 },
      }),
    ]);
    const merged = mergeCalculatorState(base, local, remote);
    expect(merged.characters[0].meta?.level).toBe(210);
    expect(merged.characters[0].entries[0].partySize).toBe(4);
    expect(merged.characters[0].partyPrefs?.lotus).toBe(4);
  });

  it("새 주차로 갈아끼운 로컬 선택도 원격 인원을 유지한다", () => {
    const base = state([
      character({
        entries: [entry("lotus", 1)],
        partyPrefs: { lotus: 1 },
        weeklyConfirmedWeek: "2026-09-17",
        weeklyByWeek: { "2026-09-17": [entry("lotus", 1)] },
      } as unknown as Character),
    ]);
    const local = state([
      character({
        entries: [entry("lotus", 1)],
        partyPrefs: { lotus: 1 },
        weeklyConfirmedWeek: "2026-09-24",
        weeklyByWeek: {
          "2026-09-17": [entry("lotus", 1)],
          "2026-09-24": [entry("lotus", 1)],
        },
      } as unknown as Character),
    ]);
    const remote = state([
      character({
        entries: [entry("lotus", 4)],
        partyPrefs: { lotus: 4 },
        weeklyConfirmedWeek: "2026-09-17",
        weeklyByWeek: { "2026-09-17": [entry("lotus", 4)] },
      } as unknown as Character),
    ]);
    const merged = mergeCalculatorState(base, local, remote);
    const next = merged.characters[0] as Character & {
      weeklyConfirmedWeek?: string;
      weeklyByWeek?: Record<string, BossEntry[]>;
    };
    expect(next.entries[0].partySize).toBe(4);
    expect(next.partyPrefs?.lotus).toBe(4);
    expect(next.weeklyConfirmedWeek).toBe("2026-09-24");
    expect(next.weeklyByWeek?.["2026-09-24"]?.[0].partySize).toBe(4);
    expect(next.weeklyByWeek?.["2026-09-17"]?.[0].partySize).toBe(4);
  });

  it("로컬이 보스를 추가하면 유지되고 원격 인원은 유지된다", () => {
    const base = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const local = state([
      character({
        entries: [entry("lotus", 1), entry("damien", 2)],
        partyPrefs: { lotus: 1, damien: 2 },
      }),
    ]);
    const remote = state([
      character({ entries: [entry("lotus", 4)], partyPrefs: { lotus: 4 } }),
    ]);
    const merged = mergeCalculatorState(base, local, remote);
    expect(merged.characters[0].entries).toEqual([
      entry("lotus", 4),
      entry("damien", 2),
    ]);
  });

  it("partyPrefs가 없던 문서는 이관 자체를 로컬 변경으로 보지 않는다", () => {
    const base = state([character({ entries: [entry("lotus", 2)] })]);
    const local = state([character({ entries: [entry("lotus", 2)] })]);
    const remote = state([
      character({ entries: [entry("lotus", 4)], partyPrefs: { lotus: 4 } }),
    ]);
    const merged = mergeCalculatorState(base, local, remote);
    expect(merged.characters[0].entries[0].partySize).toBe(4);
    expect(merged.characters[0].partyPrefs).toEqual({ lotus: 4 });
  });

  it("이 기기가 지운 캐릭터는 다른 기기가 고쳐도 되살리지 않는다", () => {
    const base = state([
      character({ id: "c1", name: "A", meta: { level: 200 }, entries: [] }),
    ]);
    const local = state([]);
    const remote = state([
      character({ id: "c1", name: "A", meta: { level: 210 }, entries: [] }),
    ]);
    expect(mergeCalculatorState(base, local, remote).characters).toEqual([]);
  });

  it("다른 기기가 지운 캐릭터는 이 기기가 고쳐도 되살리지 않는다", () => {
    const base = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const local = state([
      character({ entries: [entry("lotus", 3)], partyPrefs: { lotus: 3 } }),
    ]);
    const remote = state([]);
    expect(mergeCalculatorState(base, local, remote).characters).toEqual([]);
  });
});
