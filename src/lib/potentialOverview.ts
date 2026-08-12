/**
 * 무기/보조/엠블렘 잠재 한눈에 보기용 파싱·우선순위.
 * 큐브 기대값의 useful과는 별개로, 조회 탭 표시 우선순위를 정의한다.
 */

import { cubeSlotCategory, type CubeSlotCategory } from "../data/cubeData";
import { jobProfile, type JobProfile } from "../data/flameData";
import { parsePotentialLine, type ParsedLine } from "./cube";

export type CombatSlot = "weapon" | "secondary" | "emblem";
export type LinePriority = "p1" | "p2" | "other";
/** 옵션 줄 자체의 등급 톤 (레전드리급 vs 그 외→유니크색, 이탈 포함) */
export type LineTone = "legendary" | "unique";

export interface EquipItemRaw {
  item_equipment_slot: string;
  item_equipment_part?: string;
  item_name: string;
  item_icon: string;
  potential_option_grade: string | null;
  additional_potential_option_grade: string | null;
  potential_option_1: string | null;
  potential_option_2: string | null;
  potential_option_3: string | null;
  additional_potential_option_1: string | null;
  additional_potential_option_2: string | null;
  additional_potential_option_3: string | null;
}

export interface DisplayLine {
  text: string;
  short: string;
  priority: LinePriority;
  tone: LineTone;
  kind: string;
}

export interface SlotPotential {
  slot: CombatSlot;
  label: string;
  name: string;
  icon: string;
  /** 넥슨 장비 슬롯 원문 (EV/mesu 키용) */
  equipSlot: string;
  part?: string;
  potentialGrade: string | null;
  additionalGrade: string | null;
  potential: DisplayLine[];
  additional: DisplayLine[];
  /** 원본 옵션 문자열 (EV 분석용) */
  rawPotential: (string | null)[];
  rawAdditional: (string | null)[];
}

const SLOT_LABEL: Record<CombatSlot, string> = {
  weapon: "무기",
  secondary: "보조",
  emblem: "엠블렘",
};

const COMBAT_SLOTS: CombatSlot[] = ["weapon", "secondary", "emblem"];

function isDamagePct(text: string): boolean {
  // 보스 몬스터 공격 시 데미지와 구분
  if (/보스/.test(text)) return false;
  return /데미지\s*:?\s*\+\d+\s*%/.test(text);
}

function extractPercentNumber(text: string): number | null {
  const m = text.match(/\+(\d+)\s*%/);
  return m ? Number(m[1]) : null;
}

function extractFlatNumber(text: string): number | null {
  const m = text.match(/\+(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/**
 * 옵션 줄이 레전드리급인지 판별 (이탈=유니크급 줄은 false).
 * 무기/보조/엠블렘 mesu 표 기준 임계값.
 */
export function isLegendaryOptionLine(text: string): boolean {
  const t = text.trim();
  const pct = extractPercentNumber(t);

  if (/보스/.test(t) && /데미지/.test(t)) return pct != null && pct >= 35;
  if (/몬스터\s*방어율\s*무시/.test(t)) return pct != null && pct >= 35;
  if (/데미지/.test(t) && !/보스/.test(t) && !/피격/.test(t))
    return pct != null && pct >= 12;
  if (/올스탯|모든\s*스탯/.test(t)) return pct != null && pct >= 9;
  if (/(공격력|마력)\s*:?\s*\+\d+\s*%/.test(t)) return pct != null && pct >= 12;
  if (/\b(STR|DEX|INT|LUK)\s*:?\s*\+\d+\s*%/i.test(t))
    return pct != null && pct >= 12;

  // 평공/평마 (레전 +32)
  if (/^(공격력|마력)\s*:?\s*\+\d+\s*$/.test(t)) {
    const flat = extractFlatNumber(t);
    return flat != null && flat >= 32;
  }
  return false;
}

export function lineTone(text: string): LineTone {
  return isLegendaryOptionLine(text) ? "legendary" : "unique";
}

function extractPercent(text: string): string | null {
  const m = text.match(/\+(\d+)\s*%/);
  return m ? `+${m[1]}%` : null;
}

function extractFlat(text: string): string | null {
  const m = text.match(/\+(\d+)\s*$/);
  return m ? `+${m[1]}` : null;
}

/** 표시용 짧은 라벨 (공% +12, 보공 +30 …) */
export function shortLineLabel(
  parsed: ParsedLine | null,
  text: string,
): string {
  const pct = extractPercent(text);
  if (isDamagePct(text) && pct) return `뎀 ${pct}`;
  if (!parsed) return text;
  const value = pct ?? extractFlat(text) ?? "";
  switch (parsed.kind) {
    case "att_pct":
      return `${parsed.label} ${value}`.trim();
    case "boss":
      return `보공 ${value}`.trim();
    case "ied":
      return `방무 ${value}`.trim();
    case "main_stat_pct":
    case "all_stat_pct":
    case "hp_pct":
      return `${parsed.label} ${value}`.trim();
    default:
      return parsed.label !== "기타" ? `${parsed.label} ${value}`.trim() : text;
  }
}

/**
 * 1순위: 공%/마력%(직업 일치), 보공, 방무
 * 2순위: 주스탯%/올스탯%/HP%, 데미지%
 * 그 외: other
 */
export function linePriority(
  text: string,
  category: CubeSlotCategory,
  profile: JobProfile,
  potKind: "main" | "additional" = "main",
): DisplayLine {
  const parsed = parsePotentialLine(text, category, profile, false, potKind);
  const tone = lineTone(text);
  if (isDamagePct(text)) {
    return {
      text,
      short: shortLineLabel(parsed, text),
      priority: "p2",
      tone,
      kind: "damage",
    };
  }
  if (!parsed) {
    return { text, short: text, priority: "other", tone, kind: "other" };
  }
  let priority: LinePriority = "other";
  if (
    parsed.kind === "boss" ||
    parsed.kind === "ied" ||
    (parsed.kind === "att_pct" && parsed.useful)
  ) {
    priority = "p1";
  } else if (
    parsed.kind === "main_stat_pct" ||
    parsed.kind === "all_stat_pct" ||
    parsed.kind === "hp_pct"
  ) {
    priority = "p2";
  }
  return {
    text,
    short: shortLineLabel(parsed, text),
    priority,
    tone,
    kind: parsed.kind,
  };
}

function toDisplayLines(
  lines: (string | null)[],
  category: CubeSlotCategory,
  profile: JobProfile,
  potKind: "main" | "additional",
): DisplayLine[] {
  return lines
    .filter((line): line is string => Boolean(line?.trim()))
    .map((line) => linePriority(line, category, profile, potKind));
}

export function pickCombatEquipment(
  items: EquipItemRaw[],
  job?: string,
): SlotPotential[] {
  const profile = jobProfile(job ?? "");
  const bySlot = new Map<CombatSlot, SlotPotential>();

  for (const item of items) {
    const category = cubeSlotCategory(
      item.item_equipment_slot,
      item.item_equipment_part,
    );
    if (
      category !== "weapon" &&
      category !== "secondary" &&
      category !== "emblem"
    ) {
      continue;
    }
    // 같은 슬롯이 여러 개면 첫 장비 유지 (넥슨 응답은 보통 1개)
    if (bySlot.has(category)) continue;
    const rawPotential = [
      item.potential_option_1,
      item.potential_option_2,
      item.potential_option_3,
    ];
    const rawAdditional = [
      item.additional_potential_option_1,
      item.additional_potential_option_2,
      item.additional_potential_option_3,
    ];
    bySlot.set(category, {
      slot: category,
      label: SLOT_LABEL[category],
      name: item.item_name,
      icon: item.item_icon,
      equipSlot: item.item_equipment_slot,
      part: item.item_equipment_part,
      potentialGrade: item.potential_option_grade,
      additionalGrade: item.additional_potential_option_grade,
      potential: toDisplayLines(rawPotential, category, profile, "main"),
      additional: toDisplayLines(rawAdditional, category, profile, "additional"),
      rawPotential,
      rawAdditional,
    });
  }

  return COMBAT_SLOTS.map(
    (slot) =>
      bySlot.get(slot) ?? {
        slot,
        label: SLOT_LABEL[slot],
        name: "",
        icon: "",
        equipSlot: "",
        potentialGrade: null,
        additionalGrade: null,
        potential: [],
        additional: [],
        rawPotential: [null, null, null],
        rawAdditional: [null, null, null],
      },
  );
}

/**
 * 캐시에 저장된 슬롯도 현재 직업 매핑으로 우선순위를 다시 계산한다.
 * (직업 추가/수정 후에도 오래된 캐시가 잘못된 p1/p2를 유지하지 않게)
 */
/** 캐시 v3 등 구형 슬롯도 받을 수 있게 한다 */
type SlotPotentialLike = Omit<
  SlotPotential,
  "equipSlot" | "rawPotential" | "rawAdditional"
> &
  Partial<Pick<SlotPotential, "equipSlot" | "rawPotential" | "rawAdditional">>;

export function reclassifySlots(
  slots: SlotPotentialLike[],
  job?: string,
): SlotPotential[] {
  const profile = jobProfile(job ?? "");
  return slots.map((slot) => {
    const category = slot.slot;
    const rawPotential =
      slot.rawPotential ??
      slot.potential.map((line) => line.text || null);
    const rawAdditional =
      slot.rawAdditional ??
      slot.additional.map((line) => line.text || null);
    return {
      ...slot,
      equipSlot: slot.equipSlot || slot.slot,
      rawPotential,
      rawAdditional,
      potential: toDisplayLines(rawPotential, category, profile, "main"),
      additional: toDisplayLines(rawAdditional, category, profile, "additional"),
    };
  });
}
