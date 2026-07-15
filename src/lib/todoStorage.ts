import type { TodoAccount, TodoCharacter, TodoItem } from "../types";
import { weekKey } from "./week";
import { notifySync } from "./sync";

const STORAGE_KEY = "maple-boss-revenue:todo:v1";

/**
 * 저장 데이터 스키마 버전.
 * v2: '플래그' 항목 제거 (요청에 따라 기존 저장분에서 일괄 삭제.
 *     마이그레이션 후 다시 추가한 항목은 유지된다.)
 */
const SCHEMA_VERSION = 2;

/**
 * 체크 상태: `${itemId}:${characterId}` → 체크한 주차 키(YYYY-MM-DD).
 * 현재 주차 키와 다르면 리셋된 것으로 보고 미체크 취급한다.
 */
export type TodoChecks = Record<string, string>;

export interface TodoState {
  items: TodoItem[];
  characters: TodoCharacter[];
  checks: TodoChecks;
  /** 서버에 암호화 저장된 넥슨 Open API 계정 참조 */
  accounts: TodoAccount[];
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

export function loadTodoState(): TodoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TodoState> & {
        version?: number;
      };
      if (Array.isArray(parsed.items) && Array.isArray(parsed.characters)) {
        let items = parsed.items;
        if ((parsed.version ?? 1) < 2) {
          items = items.filter((i) => i.label !== "플래그");
        }
        return {
          items,
          characters: parsed.characters.map((c) => ({
            ...c,
            disabledItemIds: Array.isArray(c.disabledItemIds)
              ? c.disabledItemIds
              : [],
          })),
          checks:
            parsed.checks && typeof parsed.checks === "object"
              ? parsed.checks
              : {},
          accounts: Array.isArray(parsed.accounts)
            ? parsed.accounts.map((account) => ({
                ...account,
                connected: true,
              }))
            : [],
        };
      }
    }
  } catch {
    // 손상된 저장 데이터는 무시하고 초기 상태로 시작
  }
  return {
    items: [...DEFAULT_TODO_ITEMS],
    characters: [],
    checks: {},
    accounts: [],
  };
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

/** 지난 주차 체크·삭제된 항목/캐릭터의 체크를 정리해 저장 크기를 유지 */
function pruneChecks(state: TodoState): TodoState {
  const itemById = new Map(state.items.map((i) => [i.id, i]));
  const charIds = new Set(state.characters.map((c) => c.id));
  const checks: TodoChecks = {};
  for (const [key, week] of Object.entries(state.checks)) {
    const sep = key.lastIndexOf(":");
    if (sep < 0) continue;
    const itemId = key.slice(0, sep);
    const charId = key.slice(sep + 1);
    const item = itemById.get(itemId);
    if (!item || !charIds.has(charId)) continue;
    if (weekKey(item.resetDay) !== week) continue;
    checks[key] = week;
  }
  return { ...state, checks };
}
