import type { Character } from "../types";
import { notifySync } from "./sync";

const STORAGE_KEY = "maple-boss-revenue:v1";

export interface AppState {
  characters: Character[];
  selectedId: string | null;
}

/** 현재 entries의 파티 인원을 partyPrefs로 이전해, 주차 리셋 후에도 인원이 유지되게 한다 */
function withPartyPrefs(character: Character): Character {
  const prefs: Record<string, number> = { ...(character.partyPrefs ?? {}) };
  for (const entry of character.entries ?? []) {
    if (prefs[entry.bossId] == null && entry.partySize >= 1) {
      prefs[entry.bossId] = entry.partySize;
    }
  }
  return Object.keys(prefs).length > 0
    ? { ...character, partyPrefs: prefs }
    : character;
}

/** 세 문서를 비교하기 전에 같은 모양으로 맞춘다. 이미 있는 partyPrefs는 유지한다. */
export function normalizeAppState(state: AppState): AppState {
  const characters = (state.characters ?? []).map(withPartyPrefs);
  return {
    characters,
    selectedId: state.selectedId ?? characters[0]?.id ?? null,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.characters)) return normalizeAppState(parsed);
    }
  } catch {
    // 손상된 저장 데이터는 무시하고 초기 상태로 시작
  }
  return { characters: [], selectedId: null };
}

const CALCULATOR_BASE_KEY = "maple-boss-revenue:calculator-base:v1";

interface StoredCalculatorBase {
  userId: string;
  state: AppState;
}

/** 이 계정이 마지막으로 서버와 맞춘 calculator. 없으면 null. */
export function readCalculatorBase(userId: string): AppState | null {
  try {
    const raw = localStorage.getItem(CALCULATOR_BASE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCalculatorBase;
    if (parsed.userId !== userId || !Array.isArray(parsed.state?.characters)) {
      return null;
    }
    return normalizeAppState(parsed.state);
  } catch {
    return null;
  }
}

export function writeCalculatorBase(userId: string, state: AppState): void {
  try {
    const stored: StoredCalculatorBase = {
      userId,
      state: normalizeAppState(state),
    };
    localStorage.setItem(CALCULATOR_BASE_KEY, JSON.stringify(stored));
  } catch {
    // 기준 스냅샷 저장 실패는 다음 접속의 병합 정확도만 낮춘다.
  }
}

export function saveState(state: AppState): void {
  try {
    writeStateCache(state);
    notifySync("calculator", state);
  } catch {
    // 저장 실패(시크릿 모드 등)는 치명적이지 않으므로 무시
  }
}

/** 서버 hydrate/마지막 정상 스냅샷 갱신용. 동기화 이벤트는 발생시키지 않는다. */
export function writeStateCache(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
