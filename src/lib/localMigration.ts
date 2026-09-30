import type { LoadedTodoState, TodoState } from "./todoStorage";
import type { AppState } from "./storage";
import type { WeekRecord } from "./history";

export interface LegacyAccount {
  id: string;
  label: string;
  apiKey?: string;
  connected?: boolean;
}
export interface LegacyTodoState
  extends Partial<Omit<LoadedTodoState, "accounts" | "items" | "checks">> {
  items: LoadedTodoState["items"];
  checks: LoadedTodoState["checks"];
  accounts: LegacyAccount[];
  /** v3 이전 저장분의 캐릭터 목록 (원본 필드명) */
  characters?: LoadedTodoState["legacyCharacters"];
}

export function hasCalculatorData(state: AppState): boolean {
  return state.characters.length > 0;
}
export function hasTodoData(state: LegacyTodoState): boolean {
  return (
    (state.legacyCharacters?.length ?? state.characters?.length ?? 0) > 0 ||
    state.accounts.length > 0 ||
    Object.keys(state.checks).length > 0 ||
    state.items.some((i) => !i.builtin)
  );
}
export function hasHistoryData(records: WeekRecord[]): boolean {
  return records.length > 0;
}

export function redactTodoKeys(state: LegacyTodoState): LoadedTodoState {
  const { characters, ...rest } = state;
  const legacyCharacters = state.legacyCharacters ?? characters;
  return {
    ...rest,
    disabledItems: state.disabledItems ?? {},
    ...(legacyCharacters ? { legacyCharacters } : {}),
    accounts: state.accounts.map(({ id, label }) => ({
      id,
      label,
      connected: true,
    })),
  };
}

/** 서버로 보낼 payload에서 마이그레이션 입력용 필드를 제거한다 */
export function toStoredTodoState(state: LoadedTodoState): TodoState {
  const { legacyCharacters: _drop, ...rest } = state;
  return rest;
}

const BACKUP_KEY = "maple-boss-revenue:pre-server-migration:v1";
const CACHE_OWNER_KEY = "maple-boss-revenue:cache-owner:v1";

interface CacheOwner {
  userId: string;
  establishedAt: string;
}

export function readCacheOwner(): string | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CACHE_OWNER_KEY) ?? "null",
    ) as CacheOwner | null;
    return typeof parsed?.userId === "string" ? parsed.userId : null;
  } catch {
    return null;
  }
}

export function markCacheOwner(userId: string): void {
  try {
    localStorage.setItem(
      CACHE_OWNER_KEY,
      JSON.stringify({ userId, establishedAt: new Date().toISOString() }),
    );
  } catch {
    // 캐시 소유자 메타데이터 저장 실패는 서버 동기화를 막지 않는다.
  }
}

/** 계정 선택 전의 브라우저 원본을 한 번 보존해 잘못된 이관 선택으로 인한 손실을 막는다. */
export function backupLocalData(
  calculator: AppState,
  todo: LegacyTodoState,
  history: WeekRecord[],
): void {
  try {
    if (localStorage.getItem(BACKUP_KEY)) return;
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({
        backedUpAt: new Date().toISOString(),
        calculator,
        todo,
        history,
      }),
    );
  } catch {
    // 백업 저장이 불가능해도 서버 이관 자체는 계속할 수 있다.
  }
}
