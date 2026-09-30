import { describe, expect, it } from "vitest";
import type { Character } from "../types";
import { pushMergedCalculator } from "./calculatorSync";
import type { AppState } from "./storage";

function state(partySize: number, level: number): AppState {
  const character: Character = {
    id: "c1",
    name: "테스트",
    meta: { level },
    entries: [
      { bossId: "lotus", difficulty: "hard", partySize, clearsPerWeek: 7 },
    ],
    partyPrefs: { lotus: partySize },
  };
  return { characters: [character], selectedId: "c1" };
}

describe("pushMergedCalculator", () => {
  it("409가 나면 다시 받은 원격 인원과 로컬 레벨을 합쳐 재시도한다", async () => {
    const base = state(1, 200);
    const local = state(1, 210);
    const firstRemote = state(4, 200);
    const secondRemote = state(5, 200);
    const puts: AppState[] = [];
    let reads = 0;
    const outcome = await pushMergedCalculator({
      base,
      local,
      remote: { revision: 6, state: firstRemote },
      getRemote: async () => {
        reads += 1;
        return { revision: 7, state: secondRemote };
      },
      put: async (next, revision) => {
        puts.push(next);
        if (revision === 6) {
          throw Object.assign(new Error("conflict"), { status: 409 });
        }
        return { revision: revision + 1 };
      },
    });

    expect(reads).toBe(1);
    expect(puts).toHaveLength(2);
    expect(puts[0].characters[0].entries[0].partySize).toBe(4);
    expect(puts[0].characters[0].meta?.level).toBe(210);
    expect(puts[1].characters[0].entries[0].partySize).toBe(5);
    expect(puts[1].characters[0].meta?.level).toBe(210);
    expect(outcome.pushed).toBe(true);
    expect(outcome.revision).toBe(8);
    expect(outcome.state.characters[0].entries[0].partySize).toBe(5);
  });

  it("병합 결과가 원격과 같으면 PUT하지 않는다", async () => {
    let puts = 0;
    const remote = state(4, 200);
    const outcome = await pushMergedCalculator({
      base: state(1, 200),
      local: state(1, 200),
      remote: { revision: 3, state: remote },
      getRemote: async () => {
        throw new Error("조회하지 않아야 한다");
      },
      put: async () => {
        puts += 1;
        return { revision: 4 };
      },
    });
    expect(puts).toBe(0);
    expect(outcome.pushed).toBe(false);
    expect(outcome.revision).toBe(3);
    expect(outcome.state.characters[0].entries[0].partySize).toBe(4);
  });
});
