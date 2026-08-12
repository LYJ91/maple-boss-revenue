import { describe, expect, it } from "vitest";
import { pickCombatEquipment, type EquipItemRaw } from "./potentialOverview";
import {
  analyzeGoalGap,
  analyzeSlotUsefulEv,
  kindGaps,
  presentGoalKinds,
  slotToCubeInput,
} from "./potentialEv";

function weaponSlot() {
  const items: EquipItemRaw[] = [
    {
      item_equipment_slot: "무기",
      item_equipment_part: "무기",
      item_name: "무기A",
      item_icon: "w.png",
      potential_option_grade: "레전드리",
      additional_potential_option_grade: "유니크",
      potential_option_1: "공격력 : +12%",
      potential_option_2: "보스 몬스터 공격 시 데미지 : +40%",
      potential_option_3: "올스탯 : +9%",
      additional_potential_option_1: null,
      additional_potential_option_2: null,
      additional_potential_option_3: null,
    },
    {
      item_equipment_slot: "엠블렘",
      item_name: "엠블렘A",
      item_icon: "e.png",
      potential_option_grade: "레전드리",
      additional_potential_option_grade: null,
      potential_option_1: "공격력 : +12%",
      potential_option_2: "몬스터 방어율 무시 : +40%",
      potential_option_3: null,
      additional_potential_option_1: null,
      additional_potential_option_2: null,
      additional_potential_option_3: null,
    },
  ];
  return pickCombatEquipment(items, "히어로");
}

describe("slotToCubeInput", () => {
  it("EV용 CubeItemInput으로 변환한다", () => {
    const [weapon] = weaponSlot();
    const input = slotToCubeInput(weapon);
    expect(input?.slot).toBe("무기");
    expect(input?.potential[0]).toContain("공격력");
    expect(input?.potentialGrade).toBe("레전드리");
  });
});

describe("presentGoalKinds / kindGaps", () => {
  it("본잠에 있는 목표 종류를 집계한다", () => {
    const [weapon, , emblem] = weaponSlot();
    expect([...presentGoalKinds(weapon, "히어로")].sort()).toEqual([
      "att_pct",
      "boss",
    ]);
    const gaps = kindGaps(weapon, ["att_pct", "boss", "ied"], "히어로");
    expect(gaps.find((g) => g.kind === "att_pct")?.present).toBe(true);
    expect(gaps.find((g) => g.kind === "boss")?.present).toBe(true);
    expect(gaps.find((g) => g.kind === "ied")?.present).toBe(false);

    const emblemGaps = kindGaps(emblem, ["att_pct", "boss", "ied"], "히어로");
    expect(emblemGaps.find((g) => g.kind === "boss")?.applicable).toBe(false);
    expect(emblemGaps.find((g) => g.kind === "ied")?.present).toBe(true);
  });
});

describe("analyzeSlotUsefulEv", () => {
  it("레전드리 무기의 유효줄 EV를 계산한다", () => {
    const [weapon] = weaponSlot();
    const r = analyzeSlotUsefulEv(weapon, "히어로", "gold", 2);
    expect(r?.supported).toBe(true);
    expect(r?.usefulLines).toBeGreaterThanOrEqual(2);
    expect(r?.done).toBe(true);
  });
});

describe("analyzeGoalGap", () => {
  it("빠진 목표 종류 수와 근사 EV를 돌려준다", () => {
    const [weapon] = weaponSlot();
    const row = analyzeGoalGap(
      weapon,
      "히어로",
      ["att_pct", "boss", "ied"],
      "gold",
    );
    expect(row?.missingCount).toBe(1);
    expect(row?.approxTargetLines).toBe(3);
    expect(row?.analysis?.supported).toBe(true);
  });
});
