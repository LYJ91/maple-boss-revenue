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

  it("이 기기가 지워도 다른 기기가 고친 캐릭터는 남는다", () => {
    const base = state([
      character({ id: "c1", name: "A", meta: { level: 200 }, entries: [] }),
    ]);
    const local = state([]);
    const remote = state([
      character({ id: "c1", name: "A", meta: { level: 210 }, entries: [] }),
    ]);
    expect(mergeCalculatorState(base, local, remote).characters).toEqual(
      remote.characters,
    );
  });

  it("다른 기기가 캐릭터를 지워도 이 기기가 고친 캐릭터는 남는다", () => {
    const base = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const local = state([
      character({ entries: [entry("lotus", 3)], partyPrefs: { lotus: 3 } }),
    ]);
    const remote = state([]);
    expect(mergeCalculatorState(base, local, remote).characters[0].entries[0].partySize).toBe(3);
  });

  it("반대쪽이 그대로면 지운 캐릭터와 보스는 삭제된다", () => {
    const base = state([
      character({
        id: "c1",
        entries: [entry("lotus", 2), entry("damien", 2)],
        partyPrefs: { lotus: 2, damien: 2 },
      }),
      character({ id: "c2", name: "다른", entries: [] }),
    ]);
    const local = state([
      character({
        id: "c1",
        entries: [entry("lotus", 2)],
        partyPrefs: { lotus: 2, damien: 2 },
      }),
    ]);
    const remote = state([
      character({
        id: "c1",
        entries: [entry("lotus", 2), entry("damien", 2)],
        partyPrefs: { lotus: 2, damien: 2 },
      }),
      character({ id: "c2", name: "다른", entries: [] }),
    ]);
    const droppedBoss = mergeCalculatorState(base, local, remote);
    expect(droppedBoss.characters.map((item) => item.id)).toEqual(["c1"]);
    expect(droppedBoss.characters[0].entries.map((item) => item.bossId)).toEqual([
      "lotus",
    ]);

    const droppedCharacter = mergeCalculatorState(base, remote, local);
    expect(droppedCharacter.characters.map((item) => item.id)).toEqual(["c1"]);
  });

  it("기준이 없으면 로컬에만 있는 보스와 캐릭터를 유지한다", () => {
    const local = state([
      character({
        id: "c1",
        entries: [entry("lotus", 2), entry("will", 3)],
        partyPrefs: { lotus: 2, will: 3 },
      }),
      character({ id: "c2", name: "로컬만", entries: [entry("damien", 2)] }),
    ]);
    const remote = state([
      character({
        id: "c1",
        entries: [entry("lotus", 4)],
        partyPrefs: { lotus: 4 },
      }),
    ]);
    const merged = mergeCalculatorState(null, local, remote);
    expect(merged.characters.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(merged.characters[0].entries.map((item) => item.bossId)).toEqual([
      "lotus",
      "will",
    ]);
    expect(merged.characters[0].entries[0].partySize).toBe(2);
    expect(merged.characters[0].partyPrefs?.will).toBe(3);
  });

  it("기준이 없으면 1이 아닌 파티 인원을 남긴다", () => {
    const one = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const four = state([
      character({ entries: [entry("lotus", 4)], partyPrefs: { lotus: 4 } }),
    ]);
    const three = state([
      character({ entries: [entry("lotus", 3)], partyPrefs: { lotus: 3 } }),
    ]);
    expect(mergeCalculatorState(null, one, four).characters[0].entries[0].partySize).toBe(4);
    expect(mergeCalculatorState(null, one, four).characters[0].partyPrefs?.lotus).toBe(4);
    expect(mergeCalculatorState(null, four, one).characters[0].entries[0].partySize).toBe(4);
    expect(mergeCalculatorState(null, three, four).characters[0].entries[0].partySize).toBe(3);
    expect(mergeCalculatorState(null, four, four).characters[0].entries[0].partySize).toBe(4);
  });

  it("기준이 생긴 뒤 사용자가 1로 바꾼 인원은 유지한다", () => {
    const base = state([
      character({ entries: [entry("lotus", 4)], partyPrefs: { lotus: 4 } }),
    ]);
    const local = state([
      character({ entries: [entry("lotus", 1)], partyPrefs: { lotus: 1 } }),
    ]);
    const remote = state([
      character({ entries: [entry("lotus", 4)], partyPrefs: { lotus: 4 } }),
    ]);
    const merged = mergeCalculatorState(base, local, remote);
    expect(merged.characters[0].entries[0].partySize).toBe(1);
    expect(merged.characters[0].partyPrefs?.lotus).toBe(1);
  });
});
