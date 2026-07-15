import type { TodoState } from "./todoStorage";
import type { AppState } from "./storage";
import type { WeekRecord } from "./history";

export interface LegacyAccount {
  id: string;
  label: string;
  apiKey?: string;
  connected?: boolean;
}
export interface LegacyTodoState extends Omit<TodoState, "accounts"> {
  accounts: LegacyAccount[];
}

export function hasCalculatorData(state: AppState): boolean {
  return state.characters.length > 0;
}
export function hasTodoData(state: LegacyTodoState): boolean {
  return (
    state.characters.length > 0 ||
    state.accounts.length > 0 ||
    Object.keys(state.checks).length > 0 ||
    state.items.some((i) => !i.builtin)
  );
}
export function hasHistoryData(records: WeekRecord[]): boolean {
  return records.length > 0;
}

export function redactTodoKeys(state: LegacyTodoState): TodoState {
  return {
    ...state,
    accounts: state.accounts.map(({ id, label }) => ({
      id,
      label,
      connected: true,
    })),
  };
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
