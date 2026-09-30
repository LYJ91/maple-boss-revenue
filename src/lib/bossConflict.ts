/**
 * 내 선택과 API 처치 내역의 차이 판정.
 *
 * 물어볼 가치가 있는 것만 충돌로 본다.
 * - API에만 있는 보스: 실제로 잡은 것이므로 그냥 추가한다 (묻지 않는다).
 * - 내 선택에만 있는 보스: 내가 잘못 켰거나 API가 빠뜨린 것이라 판단이 필요하다.
 * - 12개 초과: 판매 집계에서 잘리므로 알려야 한다.
 * 축약·불완전 응답은 API를 믿을 수 없어 판정에서 제외한다.
 */

import type { BossEntry, Character } from "../types";
import { BOSS_MAP, RULES } from "../data/crystalData";
import {
  bossKey,
  completedBossKeys,
  schedulerReliability,
  type SchedulerState,
} from "./scheduler";
import {
  getWeeklyArchive,
  setWeeklySelection,
  weeklyDecisionsOf,
  withWeeklyDecisions,
} from "./weeklyBoss";

/**
 * 12개 초과 안내를 확인했음을 기록하는 예약 키.
 * 보스 id와 겹치지 않는 형태로 두어 결정 목록에 함께 보관한다.
 */
export const OVER_LIMIT_ACK = "*over-limit";

export interface WeeklyConflict {
  characterId: string;
  characterName: string;
  /** 내 선택에만 있고 API는 미처치인 보스 (아직 결정하지 않은 것만) */
  manualOnly: BossEntry[];
  /** API가 처치로 준 보스 수 */
  apiCount: number;
  /** 내 선택 보스 수 */
  selectedCount: number;
  /** 판매 집계 상한(12개) 초과 여부 */
  overLimit: boolean;
}

/**
 * 내 선택이 API 처치 내역으로 뒷받침되는지.
 * 결정(“내 선택 유지”) 여부와 무관하게 사실을 그대로 돌려준다.
 * 화면에 항상 같이 표시해, 실제로 안 잡은 보스가 완료로 보이지 않게 한다.
 */
export interface WeeklyVerification {
  /** 그 주 내 선택 보스 수 */
  selectedCount: number;
  /** API가 처치로 준 주간 보스 수 */
  apiCount: number;
  /** 내 선택 중 API가 확인해주지 않은 보스 */
  unverified: BossEntry[];
  /** API 응답을 판정 근거로 쓸 수 있는지 (축약·미조회면 false) */
  reliable: boolean;
}

export function verifyWeekly(
  character: Character,
  state: SchedulerState | undefined,
  week: string,
): WeeklyVerification {
  const selected = getWeeklyArchive(character, week);
  if (!state || !schedulerReliability(state).weeklyBosses) {
    return {
      selectedCount: selected.length,
      apiCount: 0,
      unverified: [],
      reliable: false,
    };
  }
  const cleared = completedBossKeys(state);
  return {
    selectedCount: selected.length,
    apiCount: apiWeeklyCount(state),
    unverified: selected.filter(
      (entry) =>
        !BOSS_MAP.get(entry.bossId)?.variants.some((variant) =>
          cleared.has(bossKey(entry.bossId, variant.difficulty)),
        ),
    ),
    reliable: true,
  };
}

/** API 응답에서 이번 주 처치로 인정되는 주간 보스 수 */
export function apiWeeklyCount(state: SchedulerState): number {
  const cleared = completedBossKeys(state);
  let count = 0;
  for (const boss of BOSS_MAP.values()) {
    if (boss.reset !== "weekly") continue;
    if (boss.variants.some((v) => cleared.has(bossKey(boss.id, v.difficulty)))) {
      count += 1;
    }
  }
  return count;
}

export function conflictOf(
  character: Character,
  state: SchedulerState | undefined,
  week: string,
): WeeklyConflict | null {
  const selected = getWeeklyArchive(character, week);
  const acknowledged =
    weeklyDecisionsOf(character, week)[OVER_LIMIT_ACK] === "manual";
  const overLimit =
    !acknowledged &&
    selected.length > RULES.weeklyBossSellLimitPerCharacter;

  // API를 믿을 수 없으면 차이를 물어봐야 할 근거가 없다.
  if (!state || !schedulerReliability(state).weeklyBosses) {
    return overLimit
      ? {
          characterId: character.id,
          characterName: character.name,
          manualOnly: [],
          apiCount: 0,
          selectedCount: selected.length,
          overLimit,
        }
      : null;
  }

  const cleared = completedBossKeys(state);
  const decisions = weeklyDecisionsOf(character, week);
  const manualOnly = selected.filter(
    (entry) =>
      decisions[entry.bossId] !== "manual" &&
      !BOSS_MAP.get(entry.bossId)?.variants.some((variant) =>
        cleared.has(bossKey(entry.bossId, variant.difficulty)),
      ),
  );

  if (manualOnly.length === 0 && !overLimit) return null;
  return {
    characterId: character.id,
    characterName: character.name,
    manualOnly,
    apiCount: apiWeeklyCount(state),
    selectedCount: selected.length,
    overLimit,
  };
}

/** 내 선택을 그대로 둔다. 같은 주에는 이 보스들을 다시 묻지 않는다. */
export function keepManualSelection(
  character: Character,
  week: string,
  conflict: WeeklyConflict,
): Character {
  const decisions: Record<string, "manual"> = Object.fromEntries(
    conflict.manualOnly.map((entry) => [entry.bossId, "manual" as const]),
  );
  if (conflict.overLimit) decisions[OVER_LIMIT_ACK] = "manual";
  return withWeeklyDecisions(character, week, decisions);
}

/** API 처치 내역에 맞춘다. 내 선택에만 있던 보스를 그 주에서 제거한다. */
export function adoptApiSelection(
  character: Character,
  week: string,
  conflict: WeeklyConflict,
): Character {
  const drop = new Set(conflict.manualOnly.map((entry) => entry.bossId));
  const weekly = getWeeklyArchive(character, week).filter(
    (entry) => !drop.has(entry.bossId),
  );
  const decisions: Record<string, "manual" | "excluded"> = Object.fromEntries(
    [...drop].map((bossId) => [bossId, "excluded" as const]),
  );
  if (weekly.length > RULES.weeklyBossSellLimitPerCharacter) {
    decisions[OVER_LIMIT_ACK] = "manual";
  }
  return withWeeklyDecisions(
    setWeeklySelection(character, week, weekly),
    week,
    decisions,
  );
}

export function detectWeeklyConflicts(
  characters: Character[],
  schedulesByOcid: Record<string, SchedulerState>,
  week: string,
): WeeklyConflict[] {
  const conflicts: WeeklyConflict[] = [];
  for (const character of characters) {
    const ocid = character.meta?.ocid;
    const found = conflictOf(
      character,
      ocid ? schedulesByOcid[ocid] : undefined,
      week,
    );
    if (found) conflicts.push(found);
  }
  return conflicts;
}

/** 캐릭터 id → API 대조 결과 (화면 표시용) */
export function verifyAllWeekly(
  characters: Character[],
  schedulesByOcid: Record<string, SchedulerState>,
  week: string,
): Record<string, WeeklyVerification> {
  return Object.fromEntries(
    characters.map((character) => {
      const ocid = character.meta?.ocid;
      return [
        character.id,
        verifyWeekly(character, ocid ? schedulesByOcid[ocid] : undefined, week),
      ];
    }),
  );
}

/**
 * 충돌 하나하나를 식별하는 키.
 * 이미 알린 충돌을 다시 띄우지 않되, 새로 생긴 차이는 바로 알리기 위해 쓴다.
 */
export function conflictKeys(conflicts: WeeklyConflict[]): string[] {
  const keys: string[] = [];
  for (const conflict of conflicts) {
    for (const entry of conflict.manualOnly) {
      keys.push(`${conflict.characterId}:${entry.bossId}`);
    }
    if (conflict.overLimit) {
      keys.push(`${conflict.characterId}:${OVER_LIMIT_ACK}`);
    }
  }
  return keys;
}
