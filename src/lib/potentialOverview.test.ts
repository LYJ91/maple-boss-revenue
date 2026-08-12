import { describe, expect, it } from "vitest";
import { jobProfile } from "../data/flameData";
import {
  isLegendaryOptionLine,
  linePriority,
  pickCombatEquipment,
  shortLineLabel,
  type EquipItemRaw,
} from "./potentialOverview";
import { parsePotentialLine } from "./cube";

const warrior = jobProfile("히어로");
const mage = jobProfile("비숍");

describe("isLegendaryOptionLine", () => {
  it("레전드리급 수치만 legendary로 판정한다", () => {
    expect(isLegendaryOptionLine("공격력 : +12%")).toBe(true);
    expect(isLegendaryOptionLine("보스 몬스터 공격 시 데미지 : +40%")).toBe(
      true,
    );
    expect(isLegendaryOptionLine("몬스터 방어율 무시 : +35%")).toBe(true);
    expect(isLegendaryOptionLine("데미지 : +12%")).toBe(true);
    expect(isLegendaryOptionLine("올스탯 : +9%")).toBe(true);
  });

  it("이탈(유니크급) 수치는 legendary가 아니다", () => {
    expect(isLegendaryOptionLine("공격력 : +9%")).toBe(false);
    expect(isLegendaryOptionLine("보스 몬스터 공격 시 데미지 : +30%")).toBe(
      false,
    );
    expect(isLegendaryOptionLine("몬스터 방어율 무시 : +30%")).toBe(false);
    expect(isLegendaryOptionLine("데미지 : +9%")).toBe(false);
    expect(isLegendaryOptionLine("올스탯 : +6%")).toBe(false);
  });
});

describe("linePriority", () => {
  it("공%/보공/방무를 1순위로 표시한다", () => {
    expect(linePriority("공격력 : +12%", "weapon", warrior).priority).toBe(
      "p1",
    );
    expect(linePriority("공격력 : +12%", "weapon", warrior).tone).toBe(
      "legendary",
    );
    expect(
      linePriority("보스 몬스터 공격 시 데미지 : +30%", "weapon", warrior)
        .priority,
    ).toBe("p1");
    expect(
      linePriority("보스 몬스터 공격 시 데미지 : +30%", "weapon", warrior).tone,
    ).toBe("unique");
    expect(
      linePriority("몬스터 방어율 무시 : +40%", "emblem", warrior).priority,
    ).toBe("p1");
  });

  it("직업과 다른 공/마력%는 1순위가 아니다", () => {
    expect(linePriority("마력 : +12%", "weapon", warrior).priority).toBe(
      "other",
    );
    expect(linePriority("마력 : +12%", "weapon", mage).priority).toBe("p1");
  });

  it("레테는 마력/INT 직업으로 판정한다", () => {
    const lete = jobProfile("레테");
    expect(lete.attackType).toBe("magic");
    expect(lete.main).toEqual(["int"]);
    expect(linePriority("마력 : +12%", "weapon", lete).priority).toBe("p1");
    expect(linePriority("INT : +12%", "weapon", lete).priority).toBe("p2");
    expect(linePriority("공격력 : +12%", "weapon", lete).priority).toBe(
      "other",
    );
  });

  it("캐시된 잘못된 우선순위도 직업 기준으로 다시 분류한다", async () => {
    const { reclassifySlots } = await import("./potentialOverview");
    const stale = [
      {
        slot: "weapon" as const,
        label: "무기",
        name: "테스트",
        icon: "",
        potentialGrade: "레전드리",
        additionalGrade: null,
        potential: [
          {
            text: "마력 : +12%",
            short: "마력% +12%",
            priority: "other" as const,
            tone: "legendary" as const,
            kind: "att_pct",
          },
        ],
        additional: [],
      },
    ];
    const fixed = reclassifySlots(stale, "레테");
    expect(fixed[0].potential[0].priority).toBe("p1");
  });

  it("주스탯/올스탯/데미지를 2순위로 표시한다", () => {
    expect(linePriority("STR : +12%", "weapon", warrior).priority).toBe("p2");
    expect(linePriority("올스탯 : +9%", "weapon", warrior).priority).toBe("p2");
    expect(linePriority("데미지 : +12%", "weapon", warrior).priority).toBe(
      "p2",
    );
  });

  it("짧은 라벨을 만든다", () => {
    const parsed = parsePotentialLine("공격력 : +12%", "weapon", warrior);
    expect(shortLineLabel(parsed, "공격력 : +12%")).toBe("공% +12%");
    expect(
      shortLineLabel(
        parsePotentialLine(
          "보스 몬스터 공격 시 데미지 : +30%",
          "weapon",
          warrior,
        ),
        "보스 몬스터 공격 시 데미지 : +30%",
      ),
    ).toBe("보공 +30%");
  });
});

describe("pickCombatEquipment", () => {
  it("무기/보조/엠블렘만 추려 고정 순서로 반환한다", () => {
    const items: EquipItemRaw[] = [
      {
        item_equipment_slot: "엠블렘",
        item_name: "엠블렘A",
        item_icon: "e.png",
        potential_option_grade: "유니크",
        additional_potential_option_grade: "에픽",
        potential_option_1: "몬스터 방어율 무시 : +40%",
        potential_option_2: "공격력 : +12%",
        potential_option_3: null,
        additional_potential_option_1: "올스탯 : +5%",
        additional_potential_option_2: null,
        additional_potential_option_3: null,
      },
      {
        item_equipment_slot: "무기",
        item_equipment_part: "무기",
        item_name: "무기A",
        item_icon: "w.png",
        potential_option_grade: "레전드리",
        additional_potential_option_grade: "유니크",
        potential_option_1: "공격력 : +13%",
        potential_option_2: "보스 몬스터 공격 시 데미지 : +35%",
        potential_option_3: "데미지 : +10%",
        additional_potential_option_1: "공격력 : +9%",
        additional_potential_option_2: null,
        additional_potential_option_3: null,
      },
      {
        item_equipment_slot: "모자",
        item_name: "모자",
        item_icon: "h.png",
        potential_option_grade: "레전드리",
        additional_potential_option_grade: null,
        potential_option_1: "STR : +13%",
        potential_option_2: null,
        potential_option_3: null,
        additional_potential_option_1: null,
        additional_potential_option_2: null,
        additional_potential_option_3: null,
      },
    ];
    const slots = pickCombatEquipment(items, "히어로");
    expect(slots.map((s) => s.slot)).toEqual(["weapon", "secondary", "emblem"]);
    expect(slots[0].name).toBe("무기A");
    expect(slots[1].name).toBe("");
    expect(slots[2].name).toBe("엠블렘A");
    expect(slots[0].potential[0].priority).toBe("p1");
    expect(slots[0].potential[0].tone).toBe("legendary");
    expect(slots[0].potential[2].priority).toBe("p2");
    expect(slots[0].additional[0].tone).toBe("unique");
    expect(slots[0].equipSlot).toBe("무기");
    expect(slots[0].rawPotential[0]).toContain("공격력");
  });
});
