import { beforeEach, describe, expect, it } from 'vitest';
import { loadState } from './storage';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

describe('loadState partyPrefs 마이그레이션', () => {
  it('기존 entries의 파티 인원을 partyPrefs로 이전한다', () => {
    store.set(
      'maple-boss-revenue:v1',
      JSON.stringify({
        selectedId: 'c1',
        characters: [
          {
            id: 'c1',
            name: '테스트',
            entries: [
              { bossId: 'lotus', difficulty: 'hard', partySize: 2, clearsPerWeek: 7 },
              { bossId: 'damien', difficulty: 'hard', partySize: 1, clearsPerWeek: 7 },
            ],
          },
        ],
      }),
    );
    const state = loadState();
    expect(state.characters[0].partyPrefs).toEqual({ lotus: 2, damien: 1 });
  });

  it('이미 partyPrefs가 있으면 entries로 덮어쓰지 않는다', () => {
    store.set(
      'maple-boss-revenue:v1',
      JSON.stringify({
        selectedId: 'c1',
        characters: [
          {
            id: 'c1',
            name: '테스트',
            partyPrefs: { lotus: 4 },
            entries: [
              { bossId: 'lotus', difficulty: 'hard', partySize: 2, clearsPerWeek: 7 },
            ],
          },
        ],
      }),
    );
    const state = loadState();
    expect(state.characters[0].partyPrefs).toEqual({ lotus: 4 });
  });
});
