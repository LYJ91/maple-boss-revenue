import { describe, expect, it } from "vitest";
import type { Character } from "../types";
import { buildRows, sortRows } from "./BossesPage";
import { BOSSES } from "../data/crystalData";

const CHAR_A: Character = {
  id: "a",
  name: "꿀꾸릿보마",
  entries: [
    { bossId: "kalos", difficulty: "chaos", partySize: 3, clearsPerWeek: 1 },
    { bossId: "adversary", difficulty: "normal", partySize: 1, clearsPerWeek: 1 },
  ],
};

const CHAR_B: Character = {
  id: "b",
  name: "꿀꾸리렌",
  entries: [
    { bossId: "kalos", difficulty: "chaos", partySize: 3, clearsPerWeek: 1 },
  ],
};

describe("buildRows", () => {
  it("모든 보스 × 난이도가 행으로 확장된다", () => {
    const rows = buildRows([], "2026-07-15");
    const totalVariants = BOSSES.reduce(
      (sum, b) => sum + b.variants.length,
      0,
    );
    expect(rows).toHaveLength(totalVariants);
  });

  it("같은 (보스, 난이도)를 잡는 캐릭터가 여럿이면 이름이 배열로 모인다", () => {
    const rows = buildRows([CHAR_A, CHAR_B], "2026-07-15");
    const kalosChaos = rows.find(
      (r) => r.bossId === "kalos" && r.difficulty === "chaos",
    );
    expect(kalosChaos?.clearers).toEqual(["꿀꾸릿보마", "꿀꾸리렌"]);
    const adversaryNormal = rows.find(
      (r) => r.bossId === "adversary" && r.difficulty === "normal",
    );
    expect(adversaryNormal?.clearers).toEqual(["꿀꾸릿보마"]);
    const noOne = rows.find(
      (r) => r.bossId === "kaling" && r.difficulty === "extreme",
    );
    expect(noOne?.clearers).toEqual([]);
  });

  it("발효일이 오늘 이후인 가격은 upcoming으로 분리한다 (검마 7/1)", () => {
    // 2026-06-30 기준: 현재 가격은 2025-11-01자, 7/1자가 upcoming
    const rows = buildRows([], "2026-06-30");
    const blackMageHard = rows.find(
      (r) => r.bossId === "black-mage" && r.difficulty === "hard",
    );
    expect(blackMageHard?.price).toBe(700_000_000);
    expect(blackMageHard?.upcoming?.since).toBe("2026-07-01");
    expect(blackMageHard?.upcoming?.price).toBe(665_000_000);

    // 2026-07-15 기준: 이미 반영됨, upcoming 없음
    const later = buildRows([], "2026-07-15").find(
      (r) => r.bossId === "black-mage" && r.difficulty === "hard",
    );
    expect(later?.price).toBe(665_000_000);
    expect(later?.upcoming).toBeUndefined();
  });

  it("같은 캐릭터가 같은 (보스, 난이도)에 두 번 등장해도 중복되지 않는다", () => {
    const dup: Character = {
      id: "d",
      name: "이름중복",
      entries: [
        { bossId: "kalos", difficulty: "chaos", partySize: 1, clearsPerWeek: 1 },
      ],
    };
    const dup2: Character = { ...dup, id: "d2" };
    const rows = buildRows([dup, dup2], "2026-07-15");
    const kalos = rows.find(
      (r) => r.bossId === "kalos" && r.difficulty === "chaos",
    );
    // 같은 이름은 한 번만 등록되어야 한다
    expect(kalos?.clearers).toEqual(["이름중복"]);
  });
});

describe("sortRows", () => {
  it("가격 높은순으로 내림차순 정렬한다", () => {
    const rows = buildRows([], "2026-07-15");
    const sorted = sortRows(rows, "price-desc");
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].price >= sorted[i + 1].price).toBe(true);
    }
  });

  it("가격 낮은순으로 오름차순 정렬한다", () => {
    const rows = buildRows([], "2026-07-15");
    const sorted = sortRows(rows, "price-asc");
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].price <= sorted[i + 1].price).toBe(true);
    }
  });

  it("이름순은 한국어 로케일 기준으로 정렬한다", () => {
    const rows = buildRows([], "2026-07-15");
    const sorted = sortRows(rows, "name");
    // '감시자 칼로스'가 '자쿰'보다 앞에 오도록
    const kalos = sorted.findIndex((r) => r.bossName === "감시자 칼로스");
    const zakum = sorted.findIndex((r) => r.bossName === "자쿰");
    expect(kalos).toBeLessThan(zakum);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const rows = buildRows([], "2026-07-15");
    const before = rows.map((r) => r.bossId + r.difficulty).join(",");
    sortRows(rows, "price-desc");
    const after = rows.map((r) => r.bossId + r.difficulty).join(",");
    expect(after).toBe(before);
  });
});
