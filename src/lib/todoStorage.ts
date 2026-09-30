import type { TodoAccount, TodoCharacter, TodoItem } from "../types";
import { weekKey } from "./week";
import { notifySync } from "./sync";

const STORAGE_KEY = "maple-boss-revenue:todo:v1";

/**
 * 저장 데이터 스키마 버전.
 * v2: '플래그' 항목 제거 (요청에 따라 기존 저장분에서 일괄 삭제.
 *     마이그레이션 후 다시 추가한 항목은 유지된다.)
 * v3: 캐릭터 목록을 보스수익과 공유한다. 체크리스트는 항목/체크/계정과
 *     캐릭터별 비활성 항목(disabledItems)만 보관한다.
 */
const SCHEMA_VERSION = 3;

/**
 * 체크 상태: `${itemId}:${characterId}` → 체크한 주차 키(YYYY-MM-DD).
 * 현재 주차 키와 다르면 리셋된 것으로 보고 미체크 취급한다.
 */
export type TodoChecks = Record<string, string>;

export interface TodoState {
  items: TodoItem[];
  checks: TodoChecks;
  /** 서버에 암호화 저장된 넥슨 Open API 계정 참조 */
  accounts: TodoAccount[];
  /** 캐릭터 id → 그 캐릭터에서 사용하지 않는 항목 id 목록 */
  disabledItems: Record<string, string[]>;
}

/** v3 이전 저장분에 남아 있는 캐릭터 목록 (캐릭터 통합 입력으로만 쓴다) */
export interface LoadedTodoState extends TodoState {
  legacyCharacters?: TodoCharacter[];
}

/** 기본 제공 체크리스트 항목 (최초 실행 시 시드) */
export const DEFAULT_TODO_ITEMS: TodoItem[] = [
  { id: "weekly-boss", label: "주간보스", resetDay: "thu", builtin: true },
  { id: "suro", label: "수로", resetDay: "mon", builtin: true },
  { id: "epic-dungeon", label: "에픽던전", resetDay: "thu", builtin: true },
  { id: "minigame", label: "미니게임", resetDay: "mon", builtin: true },
];

export function checkKey(itemId: string, characterId: string): string {
  return `${itemId}:${characterId}`;
}

export function emptyTodoState(): TodoState {
  return {
    items: [...DEFAULT_TODO_ITEMS],
    checks: {},
    accounts: [],
    disabledItems: {},
  };
}

/**
 * 저장분을 현재 스키마로 읽는다.
 * 버전 번호만으로는 서버에서 내려온 옛 payload를 구분할 수 없어
 * `characters` 배열의 존재로 v3 이전 형태를 판별한다.
 */
export function normalizeTodoState(
  parsed: (Partial<TodoState> & { version?: number; characters?: unknown }) | null,
): LoadedTodoState {
  if (!parsed || !Array.isArray(parsed.items)) return emptyTodoState();
  let items = parsed.items;
  if ((parsed.version ?? 1) < 2) {
    items = items.filter((i) => i.label !== "플래그");
  }
  const legacyCharacters = Array.isArray(parsed.characters)
    ? (parsed.characters as TodoCharacter[]).map((c) => ({
        ...c,
        disabledItemIds: Array.isArray(c.disabledItemIds)
          ? c.disabledItemIds
          : [],
      }))
    : undefined;
  const disabledItems: Record<string, string[]> = {};
  if (parsed.disabledItems && typeof parsed.disabledItems === "object") {
    for (const [charId, ids] of Object.entries(parsed.disabledItems)) {
      if (Array.isArray(ids)) disabledItems[charId] = ids;
    }
  }
  return {
    items,
    checks:
      parsed.checks && typeof parsed.checks === "object" ? parsed.checks : {},
    accounts: Array.isArray(parsed.accounts)
      ? parsed.accounts.map((account) => ({ ...account, connected: true }))
      : [],
    disabledItems,
    ...(legacyCharacters ? { legacyCharacters } : {}),
  };
}

export function loadTodoState(): LoadedTodoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeTodoState(JSON.parse(raw));
  } catch {
    // 손상된 저장 데이터는 무시하고 초기 상태로 시작
  }
  return emptyTodoState();
}

export function saveTodoState(state: TodoState): void {
  try {
    const normalized = pruneChecks(state);
    writeTodoCache(normalized);
    notifySync("todo", normalized);
  } catch {
    // 저장 실패(시크릿 모드 등)는 치명적이지 않으므로 무시
  }
}

/** 서버 hydrate/마지막 정상 스냅샷 갱신용. 동기화 이벤트는 발생시키지 않는다. */
export function writeTodoCache(state: TodoState): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...pruneChecks(state), version: SCHEMA_VERSION }),
  );
}

/**
 * 지난 주차 체크와 삭제된 항목의 체크를 정리해 저장 크기를 유지한다.
 * 캐릭터 기준 정리는 캐릭터를 실제로 제거할 때만 하며, 여기서는 하지 않는다
 * (캐릭터 목록을 아직 못 읽은 시점에 체크가 지워지는 것을 막는다).
 */
function pruneChecks(state: TodoState): TodoState {
  const itemById = new Map(state.items.map((i) => [i.id, i]));
  const checks: TodoChecks = {};
  for (const [key, week] of Object.entries(state.checks)) {
    const sep = key.lastIndexOf(":");
    if (sep < 0) continue;
    const item = itemById.get(key.slice(0, sep));
    if (!item) continue;
    if (weekKey(item.resetDay) !== week) continue;
    checks[key] = week;
  }
  return { ...state, checks };
}

/** 캐릭터를 제거할 때 그 캐릭터의 체크·항목 설정을 함께 정리한다. */
export function forgetCharacter(
  state: TodoState,
  characterId: string,
): TodoState {
  const checks: TodoChecks = {};
  for (const [key, week] of Object.entries(state.checks)) {
    if (key.slice(key.lastIndexOf(":") + 1) === characterId) continue;
    checks[key] = week;
  }
  const { [characterId]: _removed, ...disabledItems } = state.disabledItems;
  return { ...state, checks, disabledItems };
}
