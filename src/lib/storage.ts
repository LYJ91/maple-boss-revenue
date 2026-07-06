import type { Character } from '../types';

const STORAGE_KEY = 'maple-boss-revenue:v1';

export interface AppState {
  characters: Character[];
  selectedId: string | null;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.characters)) {
        return {
          characters: parsed.characters,
          selectedId: parsed.selectedId ?? parsed.characters[0]?.id ?? null,
        };
      }
    }
  } catch {
    // 손상된 저장 데이터는 무시하고 초기 상태로 시작
  }
  return { characters: [], selectedId: null };
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패(시크릿 모드 등)는 치명적이지 않으므로 무시
  }
}
