import { describe, expect, it } from "vitest";
import type { Character, TodoCharacter } from "../types";
import type { AppState } from "./storage";
import type { LoadedTodoState } from "./todoStorage";
import { unifyCharacters } from "./unifyState";

function todoState(partial: Partial<LoadedTodoState> = {}): LoadedTodoState {
  return {
    items: [
      { id: "weekly-boss", label: "주간보스", resetDay: "thu", builtin: true },
      { id: "suro", label: "수로", resetDay: "mon", builtin: true },
    ],
    checks: {},
    accounts: [],
    disabledItems: {},
    ...partial,
  };
}

function legacyChar(partial: Partial<TodoCharacter> = {}): TodoCharacter {
  return {
    id: "tc-1",
    name: "꿀꾸리레테",
    meta: { ocid: "ocid-lete", world: "루나", accountId: "acc1" },
    disabledItemIds: [],
    ...partial,
  };
}

function calcChar(partial: Partial<Character> = {}): Character {
  return {
    id: "calc-1",
    name: "꿀꾸리레테",
    entries: [],
    meta: { ocid: "ocid-lete", world: "루나" },
    ...partial,
  };
}

describe("unifyCharacters", () => {
  it("같은 캐릭터의 체크 키를 보스수익 캐릭터 id로 옮긴다", () => {
    const calculator: AppState = {
      characters: [calcChar()],
      selectedId: "calc-1",
    };
    const todo = todoState({
      legacyCharacters: [legacyChar({ disabledItemIds: ["suro"] })],
      checks: { "weekly-boss:tc-1": "2026-09-17" },
      disabledItems: { "tc-1": ["suro"] },
    });

    const result = unifyCharacters(calculator, todo);

    expect(result.changed).toBe(true);
    expect(result.calculator.characters).toHaveLength(1);
    expect(result.todo.checks).toEqual({ "weekly-boss:calc-1": "2026-09-17" });
    expect(result.todo.disabledItems).toEqual({ "calc-1": ["suro"] });
    expect("legacyCharacters" in result.todo).toBe(false);
  });

  it("ocid가 없으면 이름으로 같은 캐릭터를 찾는다", () => {
    const calculator: AppState = {
      characters: [calcChar({ id: "calc-9", meta: undefined })],
      selectedId: null,
    };
    const todo = todoState({
      legacyCharacters: [legacyChar({ meta: undefined })],
      checks: { "suro:tc-1": "2026-09-14" },
    });

    const result = unifyCharacters(calculator, todo);

    expect(result.calculator.characters).toHaveLength(1);
    expect(result.todo.checks).toEqual({ "suro:calc-9": "2026-09-14" });
  });

  it("체크리스트에만 있던 캐릭터는 보스수익 목록으로 옮긴다", () => {
    const calculator: AppState = { characters: [], selectedId: null };
    const todo = todoState({
      legacyCharacters: [legacyChar()],
      checks: { "weekly-boss:tc-1": "2026-09-17" },
    });

    const result = unifyCharacters(calculator, todo);

    expect(result.calculator.characters).toHaveLength(1);
    const created = result.calculator.characters[0];
    expect(created.name).toBe("꿀꾸리레테");
    expect(created.meta?.ocid).toBe("ocid-lete");
    expect(result.calculator.selectedId).toBe(created.id);
    expect(result.todo.checks).toEqual({
      [`weekly-boss:${created.id}`]: "2026-09-17",
    });
  });

  it("체크리스트 메타(ocid·계정)를 보스수익 캐릭터에 보강한다", () => {
    const calculator: AppState = {
      characters: [calcChar({ meta: { world: "루나" } })],
      selectedId: "calc-1",
    };
    const todo = todoState({ legacyCharacters: [legacyChar()] });

    const result = unifyCharacters(calculator, todo);

    expect(result.calculator.characters[0].meta).toMatchObject({
      ocid: "ocid-lete",
      accountId: "acc1",
    });
  });

  it("이미 통합된 상태는 그대로 둔다", () => {
    const calculator: AppState = {
      characters: [calcChar()],
      selectedId: "calc-1",
    };
    const todo = todoState({ checks: { "suro:calc-1": "2026-09-14" } });

    const result = unifyCharacters(calculator, todo);

    expect(result.changed).toBe(false);
    expect(result.calculator).toBe(calculator);
    expect(result.todo.checks).toEqual({ "suro:calc-1": "2026-09-14" });
  });

  it("실제 저장분 형태(8명 전원 ocid 일치, 체크 없음)를 그대로 이관한다", () => {
    const names = [
      "꿀꾸링불독",
      "꿀꾸링썬콜",
      "꿀꾸리렌",
      "꿀꾸리레테",
      "꿀꾸릿보마",
      "7살캡틴",
      "8살렌",
      "1살아크",
    ];
    const calculator: AppState = {
      characters: names.map((name, i) =>
        calcChar({
          id: `calc-${i}`,
          name,
          meta: { ocid: `ocid-${i}`, world: "루나" },
        }),
      ),
      selectedId: "calc-0",
    };
    const todo = todoState({
      legacyCharacters: names.map((name, i) =>
        legacyChar({
          id: `tc-${i}`,
          name,
          meta: { ocid: `ocid-${i}`, accountId: "acc1" },
          disabledItemIds: name === "꿀꾸링썬콜" ? ["suro"] : [],
        }),
      ),
    });

    const result = unifyCharacters(calculator, todo);

    expect(result.calculator.characters).toHaveLength(8);
    expect(result.calculator.characters.map((c) => c.name)).toEqual(names);
    expect(result.todo.disabledItems).toEqual({ "calc-1": ["suro"] });
  });

  it("옮길 캐릭터가 없으면 체크를 건드리지 않는다", () => {
    const calculator: AppState = { characters: [], selectedId: null };
    const todo = todoState({
      legacyCharacters: [],
      checks: { "suro:gone": "2026-09-14" },
    });

    const result = unifyCharacters(calculator, todo);

    expect(result.todo.checks).toEqual({ "suro:gone": "2026-09-14" });
    expect("legacyCharacters" in result.todo).toBe(false);
  });

  it("옮기는 도중 매칭되지 않은 옛 캐릭터의 체크는 버린다", () => {
    const calculator: AppState = {
      characters: [calcChar()],
      selectedId: "calc-1",
    };
    const todo = todoState({
      legacyCharacters: [legacyChar()],
      checks: { "suro:tc-1": "2026-09-14", "suro:없는캐릭": "2026-09-14" },
    });

    const result = unifyCharacters(calculator, todo);

    expect(result.todo.checks).toEqual({ "suro:calc-1": "2026-09-14" });
  });
});
