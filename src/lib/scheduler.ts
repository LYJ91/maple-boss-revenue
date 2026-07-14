/**
 * 넥슨 스케줄러 Open API(/api/scheduler 프록시) 클라이언트.
 * - 키 소유 계정의 캐릭터만 조회 가능 (계정별 API 키 필요)
 * - 응답은 ocid별로 짧게 캐시해 새로고침/탭 이동 시 반복 호출을 막는다
 */

import type { BossEntry, Difficulty } from '../types';
import { BOSSES, RULES } from '../data/crystalData';
import { request } from './nexon';

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

/* ───── 조회 + 캐시 ───── */

const CACHE_KEY = 'maple-boss-revenue:scheduler-cache:v1';
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
  apiKey: string,
  options?: { force?: boolean },
): Promise<SchedulerState> {
  if (!options?.force) {
    const entry = readCache()[ocid];
    if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.state;
    const pending = inflight.get(ocid);
    if (pending) return pending;
  }

  const promise = request<SchedulerState>(
    `/api/scheduler?ocid=${encodeURIComponent(ocid)}`,
    { headers: { 'x-user-api-key': apiKey.trim() } },
  )
    .then((state) => {
      const cache = readCache();
      cache[ocid] = { fetchedAt: Date.now(), state };
      writeCache(cache);
      return state;
    })
    .finally(() => inflight.delete(ocid));
  inflight.set(ocid, promise);
  return promise;
}

/* ───── 넥슨 보스명 → 앱 보스 id 매핑 ───── */

/** 공백 차이("블러디퀸" vs "블러디 퀸")를 흡수하기 위한 정규화 */
function normalizeName(name: string): string {
  return name.replace(/\s+/g, '');
}

/** 정규화된 보스명+주기 → 앱 보스 id (주간/월간 보스만) */
const BOSS_ID_BY_NAME: ReadonlyMap<string, string> = new Map(
  BOSSES.filter((b) => b.reset === 'weekly' || b.reset === 'monthly').map((b) => [
    `${b.reset}:${normalizeName(b.name)}`,
    b.id,
  ]),
);

export function bossKey(bossId: string, difficulty: Difficulty | string): string {
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
    const reset = b.cycle === 'bossMonthly' ? 'monthly' : 'weekly';
    const bossId = BOSS_ID_BY_NAME.get(`${reset}:${normalizeName(b.name)}`);
    if (bossId) keys.add(bossKey(bossId, b.difficulty));
  }
  return keys;
}

/* ───── 처치 내역 → 보스 선택(entries) 자동 반영 ───── */

/**
 * 캐릭터의 주간/월간 보스 선택을 API 처치 내역으로 교체한 entries를 반환한다.
 * - 기존에 같은 보스가 선택돼 있었다면 파티 인원 설정을 이어받는다
 * - 같은 보스가 여러 난이도로 완료로 내려오는 비정상 응답은 가격 높은 난이도를 쓴다
 */
export function entriesFromSchedule(
  current: BossEntry[],
  state: SchedulerState,
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
    auto.push({
      bossId: boss.id,
      difficulty: matched,
      partySize: prev?.partySize ?? 1,
      clearsPerWeek: prev?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
    });
  }
  return auto;
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
}

/** 주간 보스 처치 수 (n/12) — limit이 0으로 오는 경우 기본 12를 쓴다 */
export function weeklyBossProgress(state: SchedulerState): AutoProgress {
  const total = state.weeklyBossClearLimit || WEEKLY_BOSS_DEFAULT_LIMIT;
  const done = Math.min(state.weeklyBossClearCount, total);
  return { done, total, complete: done >= total };
}

/** [길드] 지하 수로 참여 여부 */
export function culvertProgress(state: SchedulerState): AutoProgress {
  const content = state.contents.find(
    (c) => normalizeName(c.name) === normalizeName('[길드] 지하 수로'),
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
    (c) => normalizeName(c.name).startsWith('에픽던전') && c.registered,
  );
  const done = Math.min(
    dungeons.reduce((sum, d) => sum + Math.min(d.nowCount, 1), 0),
    EPIC_DUNGEON_WEEKLY_LIMIT,
  );
  return { done, total: EPIC_DUNGEON_WEEKLY_LIMIT, complete: done >= EPIC_DUNGEON_WEEKLY_LIMIT };
}

/** 체크리스트 기본 항목 id → 자동 진행 계산 함수 (없으면 수동 항목) */
export const AUTO_ITEM_PROGRESS: Record<
  string,
  (state: SchedulerState) => AutoProgress
> = {
  'weekly-boss': weeklyBossProgress,
  suro: culvertProgress,
  'epic-dungeon': epicDungeonProgress,
};
