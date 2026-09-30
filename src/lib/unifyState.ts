/**
 * 캐릭터 목록 단일화.
 *
 * 예전 구조는 보스수익(calculator)과 체크리스트(todo)가 각각 캐릭터 목록을
 * 들고 ocid·이름으로 서로 맞춰봤다. 그래서 한쪽 로직을 바꾸면 다른 탭에
 * 반영되지 않았다. 이제 캐릭터는 calculator 한 곳만 갖고, 체크리스트는
 * 그 캐릭터 id로 체크·항목 설정만 보관한다.
 */

import type { Character, CharacterMeta } from "../types";
import { RULES } from "../data/crystalData";
import type { AppState } from "./storage";
import { checkKey, type LoadedTodoState, type TodoState } from "./todoStorage";

export interface UnifyResult {
  calculator: AppState;
  todo: TodoState;
  changed: boolean;
}

function newId(): string {
  return crypto.randomUUID();
}

/** ocid 우선, 없으면 이름으로 같은 캐릭터를 찾는다 */
function findCanonical(
  characters: Character[],
  name: string,
  meta: CharacterMeta | undefined,
): Character | undefined {
  if (meta?.ocid) {
    const byOcid = characters.find((c) => c.meta?.ocid === meta.ocid);
    if (byOcid) return byOcid;
  }
  return characters.find((c) => c.name === name);
}

function mergeMeta(
  current: CharacterMeta | undefined,
  incoming: CharacterMeta | undefined,
): CharacterMeta | undefined {
  if (!incoming) return current;
  return { ...current, ...incoming };
}

/**
 * 체크리스트에만 있던 캐릭터를 보스수익 목록으로 옮기고,
 * 체크·항목 설정의 캐릭터 키를 통합된 id로 다시 쓴다.
 */
export function unifyCharacters(
  calculator: AppState,
  todo: LoadedTodoState,
): UnifyResult {
  const legacy = todo.legacyCharacters;
  const { legacyCharacters: _drop, ...todoRest } = todo;
  const cleanTodo: TodoState = {
    ...todoRest,
    disabledItems: { ...todoRest.disabledItems },
  };

  if (!legacy || legacy.length === 0) {
    return {
      calculator,
      todo: cleanTodo,
      changed: legacy != null,
    };
  }

  const characters = [...calculator.characters];
  const idMap = new Map<string, string>();

  for (const item of legacy) {
    const match = findCanonical(characters, item.name, item.meta);
    if (match) {
      idMap.set(item.id, match.id);
      const meta = mergeMeta(match.meta, item.meta);
      if (JSON.stringify(meta) !== JSON.stringify(match.meta)) {
        characters[characters.indexOf(match)] = { ...match, meta };
      }
      continue;
    }
    if (characters.length >= RULES.maxCharacters) continue;
    const created: Character = {
      id: newId(),
      name: item.name,
      entries: [],
      meta: item.meta,
    };
    characters.push(created);
    idMap.set(item.id, created.id);
  }

  const knownIds = new Set(characters.map((c) => c.id));
  const remap = (charId: string) => idMap.get(charId) ?? charId;

  const checks: TodoState["checks"] = {};
  for (const [key, week] of Object.entries(cleanTodo.checks)) {
    const sep = key.lastIndexOf(":");
    if (sep < 0) continue;
    const nextId = remap(key.slice(sep + 1));
    if (!knownIds.has(nextId)) continue;
    checks[checkKey(key.slice(0, sep), nextId)] = week;
  }

  const disabledItems: TodoState["disabledItems"] = {};
  for (const [charId, ids] of Object.entries(cleanTodo.disabledItems)) {
    const nextId = remap(charId);
    if (!knownIds.has(nextId) || ids.length === 0) continue;
    disabledItems[nextId] = [...new Set([...(disabledItems[nextId] ?? []), ...ids])];
  }
  for (const item of legacy) {
    const nextId = idMap.get(item.id);
    if (!nextId || item.disabledItemIds.length === 0) continue;
    disabledItems[nextId] = [
      ...new Set([...(disabledItems[nextId] ?? []), ...item.disabledItemIds]),
    ];
  }

  return {
    calculator: {
      characters,
      selectedId: calculator.selectedId ?? characters[0]?.id ?? null,
    },
    todo: { ...cleanTodo, checks, disabledItems },
    changed: true,
  };
}
