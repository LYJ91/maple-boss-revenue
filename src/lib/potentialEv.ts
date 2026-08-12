/**
 * 장비잠재 탭용 EV / 목표 라인 갭 헬퍼.
 * 큐브 기대값은 cube.analyzeOne과 동일 로직을 쓴다.
 */

import { type CubeId } from "../data/cubeData";
import { jobProfile } from "../data/flameData";
import {
  analyzeOne,
  cubeById,
  parsePotentialLine,
  type CubeAnalysis,
  type CubeItemInput,
  type LineKind,
} from "./cube";
import type { CombatSlot, SlotPotential } from "./potentialOverview";

export type EvCubeMode = "silver" | "gold" | "black" | "bronze";

/** 목표 라인 탭에서 고를 수 있는 종류 */
export type GoalKind = "att_pct" | "boss" | "ied";

export const GOAL_KIND_OPTIONS: {
  kind: GoalKind;
  label: string;
}[] = [
  { kind: "att_pct", label: "공/마력%" },
  { kind: "boss", label: "보공" },
  { kind: "ied", label: "방무" },
];

export function slotToCubeInput(slot: SlotPotential): CubeItemInput | null {
  if (!slot.name) return null;
  return {
    slot: slot.equipSlot || slot.slot,
    part: slot.part,
    name: slot.name,
    icon: slot.icon,
    potentialGrade: slot.potentialGrade,
    additionalGrade: slot.additionalGrade,
    potential: slot.rawPotential ?? slot.potential.map((l) => l.text || null),
    additional:
      slot.rawAdditional ?? slot.additional.map((l) => l.text || null),
  };
}

export function analyzeSlotUsefulEv(
  slot: SlotPotential,
  job: string | undefined,
  cubeId: CubeId,
  targetLines: number,
): CubeAnalysis | null {
  const input = slotToCubeInput(slot);
  if (!input) return null;
  const profile = jobProfile(job ?? "");
  return analyzeOne(input, profile, cubeById(cubeId), targetLines);
}

export function analyzeSlotsUsefulEv(
  slots: SlotPotential[],
  job: string | undefined,
  cubeId: CubeId,
  targetLines: number,
): Array<{ slot: CombatSlot; analysis: CubeAnalysis }> {
  const out: Array<{ slot: CombatSlot; analysis: CubeAnalysis }> = [];
  for (const slot of slots) {
    const analysis = analyzeSlotUsefulEv(slot, job, cubeId, targetLines);
    if (analysis) out.push({ slot: slot.slot, analysis });
  }
  return out;
}

export interface KindGap {
  kind: GoalKind;
  label: string;
  /** 엠블렘 보공처럼 해당 슬롯에 의미 없는 목표 */
  applicable: boolean;
  present: boolean;
}

function kindApplicable(slot: CombatSlot, kind: GoalKind): boolean {
  if (kind === "boss" && slot === "emblem") return false;
  return true;
}

/** 본잠 라인에 목표 kind가 있는지 (동일 kind 중복은 1회로 취급) */
export function presentGoalKinds(
  slot: SlotPotential,
  job?: string,
): Set<GoalKind> {
  const profile = jobProfile(job ?? "");
  const found = new Set<GoalKind>();
  const lines =
    slot.rawPotential ?? slot.potential.map((l) => l.text || null);
  for (const text of lines) {
    const parsed = parsePotentialLine(text, slot.slot, profile, false, "main");
    if (!parsed) continue;
    if (parsed.kind === "att_pct") found.add("att_pct");
    else if (parsed.kind === "boss") found.add("boss");
    else if (parsed.kind === "ied") found.add("ied");
  }
  return found;
}

export function kindGaps(
  slot: SlotPotential,
  targets: GoalKind[],
  job?: string,
): KindGap[] {
  const present = presentGoalKinds(slot, job);
  return targets.map((kind) => {
    const meta = GOAL_KIND_OPTIONS.find((o) => o.kind === kind)!;
    const applicable = kindApplicable(slot.slot, kind);
    return {
      kind,
      label: meta.label,
      applicable,
      present: applicable && present.has(kind),
    };
  });
}

export interface GoalEvRow {
  gaps: KindGap[];
  missingCount: number;
  /** 유효줄 EV 근사 (목표 줄 수 = 적용 가능한 선택 kind 수) */
  analysis: CubeAnalysis | null;
  approxTargetLines: number;
}

/**
 * 목표 라인 갭 + 유효 n줄 EV 근사.
 * 특정 옵션 세트 EV가 아니라 '선택한 종류 개수만큼 유효줄' 기대값이다.
 */
export function analyzeGoalGap(
  slot: SlotPotential,
  job: string | undefined,
  targets: GoalKind[],
  cubeId: CubeId,
): GoalEvRow | null {
  if (!slot.name) return null;
  const gaps = kindGaps(slot, targets, job);
  const applicable = gaps.filter((g) => g.applicable);
  const missingCount = applicable.filter((g) => !g.present).length;
  const approxTargetLines = Math.min(
    3,
    Math.max(1, applicable.length || targets.length || 1),
  );
  const analysis = analyzeSlotUsefulEv(
    slot,
    job,
    cubeId,
    approxTargetLines,
  );
  return { gaps, missingCount, analysis, approxTargetLines };
}

export function fmtTries(t: number, done: boolean): string {
  if (done) return "완료";
  if (!Number.isFinite(t)) return "도달 불가";
  if (t >= 10) return `약 ${Math.round(t).toLocaleString("ko-KR")}회`;
  return `약 ${t.toFixed(1)}회`;
}

export function fmtPct(p: number): string {
  if (p <= 0) return "0%";
  const pct = p * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

/** LineKind가 목표 칩과 매칭되는지 (테스트/표시용) */
export function isGoalKind(kind: LineKind): kind is GoalKind {
  return kind === "att_pct" || kind === "boss" || kind === "ied";
}
