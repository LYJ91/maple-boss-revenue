/**
 * calculator 문서의 3-way 병합.
 * base는 이 기기가 마지막으로 서버와 맞춘 스냅샷,
 * local은 이 기기의 현재 상태, remote는 서버 상태다.
 * 이 기기가 바꾸지 않은 값은 remote를 유지한다.
 */

import type { BossEntry, Character } from "../types";
import { normalizeAppState, type AppState } from "./storage";

interface WeekCharacter extends Character {
  weeklyConfirmedWeek?: string;
  weeklyByWeek?: Record<string, BossEntry[]>;
  weeklyDecisions?: Record<string, Record<string, string>>;
  monthlyConfirmedMonth?: string;
  monthlyScanMonth?: string;
}

const KNOWN_CHARACTER_KEYS = new Set([
  "id",
  "name",
  "entries",
  "meta",
  "partyPrefs",
  "weeklyConfirmedWeek",
  "weeklyByWeek",
  "weeklyDecisions",
  "monthlyConfirmedMonth",
  "monthlyScanMonth",
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function same(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** local이 base와 같으면 remote, remote가 base와 같으면 local, 둘 다 바뀌었으면 local. */
function pick<T>(base: T, local: T, remote: T): T {
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  return local;
}

export function calculatorStateEqual(a: AppState, b: AppState): boolean {
  return same(normalizeAppState(a), normalizeAppState(b));
}

function partySizeValue(
  character: WeekCharacter | undefined,
  bossId: string,
  entry: BossEntry | undefined,
): number | undefined {
  if (entry) return entry.partySize;
  return character?.partyPrefs?.[bossId];
}

function orderedIds(
  lists: Array<Array<{ id?: string; bossId?: string }> | undefined>,
  idOf: (item: { id?: string; bossId?: string }) => string,
): string[] {
  const ids: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      const id = idOf(item);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function mergeEntryFields(
  bossId: string,
  baseChar: WeekCharacter | undefined,
  localChar: WeekCharacter,
  remoteChar: WeekCharacter,
  baseEntry: BossEntry | undefined,
  localEntry: BossEntry | undefined,
  remoteEntry: BossEntry | undefined,
): BossEntry {
  const difficulty =
    pick(baseEntry?.difficulty, localEntry?.difficulty, remoteEntry?.difficulty) ??
    localEntry?.difficulty ??
    remoteEntry?.difficulty ??
    baseEntry?.difficulty ??
    "easy";
  const clearsPerWeek =
    pick(
      baseEntry?.clearsPerWeek,
      localEntry?.clearsPerWeek,
      remoteEntry?.clearsPerWeek,
    ) ??
    localEntry?.clearsPerWeek ??
    remoteEntry?.clearsPerWeek ??
    baseEntry?.clearsPerWeek ??
    1;
  const partySize =
    pick(
      partySizeValue(baseChar, bossId, baseEntry),
      partySizeValue(localChar, bossId, localEntry),
      partySizeValue(remoteChar, bossId, remoteEntry),
    ) ??
    localEntry?.partySize ??
    remoteEntry?.partySize ??
    1;
  return { bossId, difficulty, partySize, clearsPerWeek };
}

function mergeEntries(
  baseChar: WeekCharacter | undefined,
  localChar: WeekCharacter,
  remoteChar: WeekCharacter,
  baseList: BossEntry[] | undefined,
  localList: BossEntry[] | undefined,
  remoteList: BossEntry[] | undefined,
): BossEntry[] {
  const baseMap = new Map((baseList ?? []).map((entry) => [entry.bossId, entry]));
  const localMap = new Map((localList ?? []).map((entry) => [entry.bossId, entry]));
  const remoteMap = new Map(
    (remoteList ?? []).map((entry) => [entry.bossId, entry]),
  );
  const ids = orderedIds(
    [remoteList, localList, baseList],
    (entry) => entry.bossId ?? "",
  );
  const merged: BossEntry[] = [];
  for (const bossId of ids) {
    if (!bossId) continue;
    const baseEntry = baseMap.get(bossId);
    const localEntry = localMap.get(bossId);
    const remoteEntry = remoteMap.get(bossId);
    if (baseEntry && localEntry && !remoteEntry) {
      if (same(localEntry, baseEntry)) continue;
    } else if (baseEntry && !localEntry && remoteEntry) {
      if (same(remoteEntry, baseEntry)) continue;
    } else if (!localEntry && !remoteEntry) {
      continue;
    }
    merged.push(
      mergeEntryFields(
        bossId,
        baseChar,
        localChar,
        remoteChar,
        baseEntry,
        localEntry,
        remoteEntry,
      ),
    );
  }
  return merged;
}

function mergeFlat<T>(
  base: Record<string, T> | undefined,
  local: Record<string, T> | undefined,
  remote: Record<string, T> | undefined,
): Record<string, T> | undefined {
  const keys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(local ?? {}),
    ...Object.keys(remote ?? {}),
  ]);
  const merged: Record<string, T> = {};
  for (const key of keys) {
    const baseValue = base?.[key];
    const localValue = local?.[key];
    const remoteValue = remote?.[key];
    if (baseValue !== undefined && localValue === undefined && remoteValue !== undefined) {
      if (same(remoteValue, baseValue)) continue;
      merged[key] = remoteValue;
      continue;
    }
    if (baseValue !== undefined && localValue !== undefined && remoteValue === undefined) {
      if (same(localValue, baseValue)) continue;
      merged[key] = localValue;
      continue;
    }
    if (localValue === undefined && remoteValue === undefined) continue;
    if (localValue === undefined && remoteValue !== undefined) {
      merged[key] = remoteValue;
      continue;
    }
    if (localValue !== undefined && remoteValue === undefined) {
      merged[key] = localValue;
      continue;
    }
    const picked = pick(baseValue as T, localValue as T, remoteValue as T);
    if (picked !== undefined) merged[key] = picked;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeWeeklyByWeek(
  base: WeekCharacter | undefined,
  local: WeekCharacter,
  remote: WeekCharacter,
): Record<string, BossEntry[]> | undefined {
  const baseWeeks = base?.weeklyByWeek;
  const localWeeks = local.weeklyByWeek;
  const remoteWeeks = remote.weeklyByWeek;
  const weeks = new Set([
    ...Object.keys(baseWeeks ?? {}),
    ...Object.keys(localWeeks ?? {}),
    ...Object.keys(remoteWeeks ?? {}),
  ]);
  const merged: Record<string, BossEntry[]> = {};
  for (const week of weeks) {
    const baseList = baseWeeks?.[week];
    const localList = localWeeks?.[week];
    const remoteList = remoteWeeks?.[week];
    if (baseList && localList && !remoteList && same(localList, baseList)) continue;
    if (baseList && !localList && remoteList && same(remoteList, baseList)) continue;
    if (!localList && !remoteList) continue;
    merged[week] = mergeEntries(
      base,
      local,
      remote,
      baseList,
      localList,
      remoteList,
    );
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeWeeklyDecisions(
  base: WeekCharacter | undefined,
  local: WeekCharacter,
  remote: WeekCharacter,
): Record<string, Record<string, string>> | undefined {
  const baseWeeks = base?.weeklyDecisions;
  const localWeeks = local.weeklyDecisions;
  const remoteWeeks = remote.weeklyDecisions;
  const weeks = new Set([
    ...Object.keys(baseWeeks ?? {}),
    ...Object.keys(localWeeks ?? {}),
    ...Object.keys(remoteWeeks ?? {}),
  ]);
  const merged: Record<string, Record<string, string>> = {};
  for (const week of weeks) {
    const baseMap = baseWeeks?.[week];
    const localMap = localWeeks?.[week];
    const remoteMap = remoteWeeks?.[week];
    if (baseMap && localMap && !remoteMap && same(localMap, baseMap)) continue;
    if (baseMap && !localMap && remoteMap && same(remoteMap, baseMap)) continue;
    if (!localMap && !remoteMap) continue;
    const decisions = mergeFlat(baseMap, localMap, remoteMap);
    if (decisions) merged[week] = decisions;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeCharacter(
  base: WeekCharacter | undefined,
  local: WeekCharacter,
  remote: WeekCharacter,
): WeekCharacter {
  const merged: WeekCharacter = {
    id: local.id,
    name: pick(base?.name ?? local.name, local.name, remote.name),
    entries: mergeEntries(
      base,
      local,
      remote,
      base?.entries,
      local.entries,
      remote.entries,
    ),
  };
  const meta = mergeFlat(
    base?.meta as Record<string, string | number> | undefined,
    local.meta as Record<string, string | number> | undefined,
    remote.meta as Record<string, string | number> | undefined,
  );
  if (meta) merged.meta = meta as Character["meta"];
  const partyPrefs = mergeFlat(base?.partyPrefs, local.partyPrefs, remote.partyPrefs);
  if (partyPrefs) merged.partyPrefs = partyPrefs;
  const weeklyConfirmedWeek = pick(
    base?.weeklyConfirmedWeek,
    local.weeklyConfirmedWeek,
    remote.weeklyConfirmedWeek,
  );
  if (weeklyConfirmedWeek) merged.weeklyConfirmedWeek = weeklyConfirmedWeek;
  const weeklyByWeek = mergeWeeklyByWeek(base, local, remote);
  if (weeklyByWeek) merged.weeklyByWeek = weeklyByWeek;
  const weeklyDecisions = mergeWeeklyDecisions(base, local, remote);
  if (weeklyDecisions) merged.weeklyDecisions = weeklyDecisions;
  const monthlyConfirmedMonth = pick(
    base?.monthlyConfirmedMonth,
    local.monthlyConfirmedMonth,
    remote.monthlyConfirmedMonth,
  );
  if (monthlyConfirmedMonth) merged.monthlyConfirmedMonth = monthlyConfirmedMonth;
  const monthlyScanMonth = pick(
    base?.monthlyScanMonth,
    local.monthlyScanMonth,
    remote.monthlyScanMonth,
  );
  if (monthlyScanMonth) merged.monthlyScanMonth = monthlyScanMonth;

  const extraKeys = new Set<string>();
  for (const source of [base, local, remote]) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      if (!KNOWN_CHARACTER_KEYS.has(key)) extraKeys.add(key);
    }
  }
  const record = merged as unknown as Record<string, unknown>;
  const baseRecord = (base ?? {}) as unknown as Record<string, unknown>;
  const localRecord = local as unknown as Record<string, unknown>;
  const remoteRecord = remote as unknown as Record<string, unknown>;
  for (const key of extraKeys) {
    const picked = pick(baseRecord[key], localRecord[key], remoteRecord[key]);
    if (picked !== undefined) record[key] = picked;
  }
  return merged;
}

function mergeCharacters(
  base: WeekCharacter[],
  local: WeekCharacter[],
  remote: WeekCharacter[],
): WeekCharacter[] {
  const baseMap = new Map(base.map((character) => [character.id, character]));
  const localMap = new Map(local.map((character) => [character.id, character]));
  const remoteMap = new Map(remote.map((character) => [character.id, character]));
  const ids = orderedIds(
    [remote, local, base],
    (character) => character.id ?? "",
  );
  const merged: WeekCharacter[] = [];
  for (const id of ids) {
    if (!id) continue;
    const baseCharacter = baseMap.get(id);
    const localCharacter = localMap.get(id);
    const remoteCharacter = remoteMap.get(id);
    // 기준에 있던 캐릭터를 어느 한쪽이라도 지웠으면 삭제가 이긴다.
    if (baseCharacter && (!localCharacter || !remoteCharacter)) continue;
    if (!localCharacter && !remoteCharacter) continue;
    if (!localCharacter && remoteCharacter) {
      merged.push(remoteCharacter);
      continue;
    }
    if (localCharacter && !remoteCharacter) {
      merged.push(localCharacter);
      continue;
    }
    if (localCharacter && remoteCharacter) {
      merged.push(mergeCharacter(baseCharacter, localCharacter, remoteCharacter));
    }
  }
  return merged;
}

export function mergeCalculatorState(
  base: AppState,
  local: AppState,
  remote: AppState,
): AppState {
  const baseState = normalizeAppState(base);
  const localState = normalizeAppState(local);
  const remoteState = normalizeAppState(remote);
  const characters = mergeCharacters(
    baseState.characters,
    localState.characters,
    remoteState.characters,
  );
  let selectedId = pick(
    baseState.selectedId,
    localState.selectedId,
    remoteState.selectedId,
  );
  if (selectedId && !characters.some((character) => character.id === selectedId)) {
    selectedId = characters[0]?.id ?? null;
  }
  return normalizeAppState({ characters, selectedId });
}
