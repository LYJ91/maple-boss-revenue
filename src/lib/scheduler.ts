/**
 * 넥슨 스케줄러 Open API(/api/scheduler 프록시) 클라이언트.
 * - 키 소유 계정의 캐릭터만 조회 가능 (계정별 API 키 필요)
 * - 응답은 ocid별로 짧게 캐시해 새로고침/탭 이동 시 반복 호출을 막는다
 */

import type { BossEntry, Difficulty } from "../types";
import {
  BOSSES,
  BOSS_MAP,
  clampPartySize,
  RULES,
} from "../data/crystalData";
import { authRequest } from "./sync";

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

export const SCHEDULER_STATE_EVENT = "maple:scheduler-state";

export interface SchedulerStateEventDetail {
  ocid: string;
  accountId: string;
  state: SchedulerState;
}

export interface SchedulerReliability {
  /** 주간 보스 행이 있어 전체 보스 응답으로 신뢰할 수 있음 */
  weeklyBosses: boolean;
  /** 월간 완료=true가 있거나, 전체 응답에서 월간 미완료를 확인할 수 있음 */
  monthlyBosses: boolean;
  /** 미접속 캐릭터에서 관측되는 월간 보스 2행뿐인 축약 응답 */
  truncated: boolean;
}

/**
 * 넥슨 스케줄러가 미접속 캐릭터에 월간 보스 미완료 2행만 주는 경우를 감지한다.
 * 이런 응답을 완료 상태의 근거로 쓰면 기존 주간/월간 기록이 모두 사라진다.
 */
export function schedulerReliability(
  state: SchedulerState,
): SchedulerReliability {
  const weeklyBosses = state.bosses.some((b) => b.cycle === "bossWeekly");
  const hasMonthlyBosses = state.bosses.some(
    (b) => b.cycle === "bossMonthly",
  );
  const hasCompletedMonthlyBoss = state.bosses.some(
    (b) => b.cycle === "bossMonthly" && b.complete,
  );
  return {
    weeklyBosses,
    // 축약 응답의 false는 신뢰하지 않지만 true는 완료의 직접 증거로 사용한다.
    monthlyBosses:
      hasCompletedMonthlyBoss || (weeklyBosses && hasMonthlyBosses),
    truncated: state.bosses.length > 0 && !weeklyBosses && hasMonthlyBosses,
  };
}

function publishSchedulerState(detail: SchedulerStateEventDetail): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<SchedulerStateEventDetail>(SCHEDULER_STATE_EVENT, {
        detail,
      }),
    );
  }
}

/* ───── 조회 + 캐시 ───── */

// v2: 축약 응답을 정상 캐시로 저장하던 v1을 폐기한다.
const CACHE_KEY = "maple-boss-revenue:scheduler-cache:v2";
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  state: SchedulerState;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, CacheEntry>;
  } catch {
    // 손상된 캐시는 무시
  }
  return {};
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장 실패는 치명적이지 않음
  }
}

/** 동일 ocid 동시 요청 합치기 */
const inflight = new Map<string, Promise<SchedulerState>>();

export async function fetchScheduler(
  ocid: string,
  accountId: string,
  options?: { force?: boolean; date?: string },
): Promise<SchedulerState> {
  const date = options?.date;
  const cacheKey = date
    ? `${accountId}:${ocid}:${date}`
    : `${accountId}:${ocid}`;
  if (!options?.force) {
    const entry = readCache()[cacheKey];
    if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
      if (!date) {
        publishSchedulerState({ ocid, accountId, state: entry.state });
      }
      return entry.state;
    }
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
  }

  const params = new URLSearchParams({ ocid, accountId });
  if (date) params.set("date", date);
  const promise = authRequest<SchedulerState>(`/api/scheduler?${params}`)
    .then((state) => {
      // 축약 응답은 상태 전파는 하되 정상 캐시를 덮어쓰지 않는다.
      if (schedulerReliability(state).weeklyBosses) {
        const cache = readCache();
        cache[cacheKey] = { fetchedAt: Date.now(), state };
        writeCache(cache);
      }
      if (!date) {
        publishSchedulerState({ ocid, accountId, state });
      }
      return state;
    })
    .finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, promise);
  return promise;
}

/* ───── 넥슨 보스명 → 앱 보스 id 매핑 ───── */

/** 공백 차이("블러디퀸" vs "블러디 퀸")를 흡수하기 위한 정규화 */
function normalizeName(name: string): string {
  return name.replace(/\s+/g, "");
}

/** 정규화된 보스명+주기 → 앱 보스 id (주간/월간 보스만) */
const BOSS_ID_BY_NAME: ReadonlyMap<string, string> = new Map(
  BOSSES.filter((b) => b.reset === "weekly" || b.reset === "monthly").map(
    (b) => [`${b.reset}:${normalizeName(b.name)}`, b.id],
  ),
);

export function bossKey(
  bossId: string,
  difficulty: Difficulty | string,
): string {
  return `${bossId}:${difficulty}`;
}

/**
 * 이번 주(월간 보스는 이번 달)에 처치 완료된 보스를
 * `${앱 보스 id}:${난이도}` 키 집합으로 반환한다.
 * 앱에 없는 보스(시즌 보스 등)는 무시된다.
 */
export function completedBossKeys(state: SchedulerState): Set<string> {
  const keys = new Set<string>();
  for (const b of state.bosses) {
    if (!b.complete) continue;
    const reset = b.cycle === "bossMonthly" ? "monthly" : "weekly";
    const bossId = BOSS_ID_BY_NAME.get(`${reset}:${normalizeName(b.name)}`);
    if (bossId) keys.add(bossKey(bossId, b.difficulty));
  }
  return keys;
}

/* ───── 처치 내역 → 보스 선택(entries) 자동 반영 ───── */

/**
 * 캐릭터의 주간/월간 보스 선택을 API 처치 내역으로 교체한 entries를 반환한다.
 * - 파티 인원은 partyPrefs(주차와 무관한 선호) → 현재 entries → 기본 1 순으로 적용
 * - 같은 보스가 여러 난이도로 완료로 내려오는 비정상 응답은 가격 높은 난이도를 쓴다
 */
export function entriesFromSchedule(
  current: BossEntry[],
  state: SchedulerState,
  partyPrefs: Record<string, number> = {},
): BossEntry[] {
  const cleared = completedBossKeys(state);
  const prevByBoss = new Map(current.map((e) => [e.bossId, e]));

  const auto: BossEntry[] = [];
  for (const boss of BOSSES) {
    // variants는 가격 오름차순이므로 마지막 매칭이 가장 높은 난이도다
    let matched: Difficulty | null = null;
    for (const v of boss.variants) {
      if (cleared.has(bossKey(boss.id, v.difficulty))) matched = v.difficulty;
    }
    if (!matched) continue;
    const prev = prevByBoss.get(boss.id);
    const preferred = partyPrefs[boss.id];
    const requestedPartySize = preferred ?? prev?.partySize ?? 1;
    auto.push({
      bossId: boss.id,
      difficulty: matched,
      partySize: clampPartySize(boss, matched, requestedPartySize),
      clearsPerWeek: prev?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
    });
  }
  const reliability = schedulerReliability(state);
  const byReset = (entries: BossEntry[], reset: "weekly" | "monthly") =>
    entries.filter((entry) => BOSS_MAP.get(entry.bossId)?.reset === reset);

  // 신뢰할 수 없는 구간은 기존 상태를 보존한다. 특히 월간 2행 축약 응답의
  // complete=false로 검은 마법사 완료 기록을 지우지 않는다.
  return [
    ...(reliability.weeklyBosses
      ? byReset(auto, "weekly")
      : byReset(current, "weekly")),
    ...(reliability.monthlyBosses
      ? byReset(auto, "monthly")
      : byReset(current, "monthly")),
  ];
}

/** 두 entries가 순서와 무관하게 같은 설정인지 */
export function entriesEqual(a: BossEntry[], b: BossEntry[]): boolean {
  if (a.length !== b.length) return false;
  const key = (e: BossEntry) =>
    `${e.bossId}|${e.difficulty}|${e.partySize}|${e.clearsPerWeek}`;
  const as = a.map(key).sort();
  const bs = b.map(key).sort();
  return as.every((v, i) => v === bs[i]);
}

/* ───── 체크리스트 자동 항목 판정 ───── */

export const WEEKLY_BOSS_DEFAULT_LIMIT = 12;
export const EPIC_DUNGEON_WEEKLY_LIMIT = 3;

export interface AutoProgress {
  done: number;
  total: number;
  complete: boolean;
  /** 축약 응답이라 완료/미완료를 확정할 수 없음 */
  checking?: boolean;
}

/**
 * 주간 보스 처치 수 (n/12).
 * 넥슨의 weekly_boss_clear_count 카운터가 실제 처치 플래그와 어긋나는 사례가 있어
 * (예: 12마리 처치인데 11로 응답) 보스별 complete 플래그에서 직접 센다.
 * 같은 보스를 여러 난이도로 응답하는 경우는 1마리로 센다.
 */
export function weeklyBossProgress(state: SchedulerState): AutoProgress {
  const total = state.weeklyBossClearLimit || WEEKLY_BOSS_DEFAULT_LIMIT;
  if (!schedulerReliability(state).weeklyBosses) {
    return { done: 0, total, complete: false, checking: true };
  }
  const clearedNames = new Set(
    state.bosses
      .filter((b) => b.cycle !== "bossMonthly" && b.complete)
      .map((b) => normalizeName(b.name)),
  );
  const done = Math.min(clearedNames.size, total);
  return { done, total, complete: done >= total };
}

/** [길드] 지하 수로 참여 여부 */
export function culvertProgress(state: SchedulerState): AutoProgress {
  const content = state.contents.find(
    (c) => normalizeName(c.name) === normalizeName("[길드] 지하 수로"),
  );
  const done = content && content.nowCount > 0 ? 1 : 0;
  return { done, total: 1, complete: done >= 1 };
}

/**
 * 에픽 던전 진행 (주간 3회, 서로 다른 던전 각 1회).
 * 스케줄러에 등록된 던전만 집계한다 — 미등록 항목의 now_count는
 * 이번 주와 무관한 값이 내려오는 사례가 있어 제외한다.
 */
export function epicDungeonProgress(state: SchedulerState): AutoProgress {
  const dungeons = state.contents.filter(
    (c) => normalizeName(c.name).startsWith("에픽던전") && c.registered,
  );
  const done = Math.min(
    dungeons.reduce((sum, d) => sum + Math.min(d.nowCount, 1), 0),
    EPIC_DUNGEON_WEEKLY_LIMIT,
  );
  return {
    done,
    total: EPIC_DUNGEON_WEEKLY_LIMIT,
    complete: done >= EPIC_DUNGEON_WEEKLY_LIMIT,
  };
}

/** 체크리스트 기본 항목 id → 자동 진행 계산 함수 (없으면 수동 항목) */
export const AUTO_ITEM_PROGRESS: Record<
  string,
  (state: SchedulerState) => AutoProgress
> = {
  "weekly-boss": weeklyBossProgress,
  suro: culvertProgress,
  "epic-dungeon": epicDungeonProgress,
};
