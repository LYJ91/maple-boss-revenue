/**
 * 스케줄러 응답을 앱 보스 id로 맞추는 순수 함수.
 * 브라우저 인증 코드는 가져오지 않는다.
 */

import type { Difficulty } from "../types";
import { BOSSES } from "../data/crystalData.js";

export interface SchedulerBoss {
  name: string;
  difficulty: string;
  /** bossWeekly | bossMonthly */
  cycle: string;
  complete: boolean;
}

export interface SchedulerContent {
  name: string;
  nowCount: number;
  maxCount: number;
  registered: boolean;
}

export interface SchedulerState {
  date: string | null;
  weeklyBossClearCount: number;
  weeklyBossClearLimit: number;
  bosses: SchedulerBoss[];
  contents: SchedulerContent[];
}

export interface SchedulerReliability {
  weeklyBosses: boolean;
  monthlyBosses: boolean;
  truncated: boolean;
}

export function schedulerReliability(state: SchedulerState): SchedulerReliability {
  const weeklyBosses = state.bosses.some((boss) => boss.cycle === "bossWeekly");
  const hasMonthlyBosses = state.bosses.some((boss) => boss.cycle === "bossMonthly");
  const hasCompletedMonthlyBoss = state.bosses.some(
    (boss) => boss.cycle === "bossMonthly" && boss.complete,
  );
  return {
    weeklyBosses,
    monthlyBosses: hasCompletedMonthlyBoss || (weeklyBosses && hasMonthlyBosses),
    truncated: state.bosses.length > 0 && !weeklyBosses && hasMonthlyBosses,
  };
}

export function normalizeName(name: string): string {
  return name.replace(/\s+/g, "");
}

const BOSS_ID_BY_NAME: ReadonlyMap<string, string> = new Map(
  BOSSES.filter((boss) => boss.reset === "weekly" || boss.reset === "monthly").map(
    (boss) => [`${boss.reset}:${normalizeName(boss.name)}`, boss.id],
  ),
);

export function bossKey(bossId: string, difficulty: Difficulty | string): string {
  return `${bossId}:${difficulty}`;
}

export function completedBossKeys(state: SchedulerState): Set<string> {
  const keys = new Set<string>();
  for (const boss of state.bosses) {
    if (!boss.complete) continue;
    const reset = boss.cycle === "bossMonthly" ? "monthly" : "weekly";
    const bossId = BOSS_ID_BY_NAME.get(`${reset}:${normalizeName(boss.name)}`);
    if (bossId) keys.add(bossKey(bossId, boss.difficulty));
  }
  return keys;
}
