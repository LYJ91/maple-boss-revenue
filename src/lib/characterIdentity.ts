/**
 * 연동 캐릭터 식별자 갱신.
 * 월드 이전(챌린저스 종료 등) 후 ocid·월드가 바뀌면
 * 계정 캐릭터 목록을 기준으로 이름 매칭해 교체한다.
 */

import type { CharacterMeta } from "../types";
import {
  fetchAccountCharacters,
  type LookupCharacter,
} from "./nexon";

export function shouldReplaceMeta(
  current: CharacterMeta | undefined,
  next: CharacterMeta,
): boolean {
  if (!next.ocid) return false;
  return (
    current?.ocid !== next.ocid ||
    current?.accountId !== next.accountId ||
    current?.world !== next.world ||
    current?.job !== next.job ||
    current?.level !== next.level ||
    Boolean(next.image && current?.image !== next.image)
  );
}

export function applyLiveIdentity<T extends { name: string; meta?: CharacterMeta }>(
  character: T,
  live: LookupCharacter,
  accountId: string,
): T {
  const nextMeta: CharacterMeta = {
    ...character.meta,
    ocid: live.ocid,
    world: live.world,
    job: live.job,
    level: live.level,
    accountId,
    ...(live.image ? { image: live.image } : {}),
  };
  if (
    character.name === live.name &&
    !shouldReplaceMeta(character.meta, nextMeta)
  ) {
    return character;
  }
  return { ...character, name: live.name, meta: nextMeta };
}

/**
 * 한 계정의 최신 명단으로 식별자를 맞춘다.
 * - ocid가 명단에 있으면 그 항목을 사용한다.
 * - ocid가 없고(또는 이전 후 폐기됐고) 이름이 명단에 하나면 그 항목으로 교체한다.
 * - 이름이 둘 이상이면 추측하지 않는다.
 * - 다른 계정 캐릭터는 건드리지 않는다.
 */
export function applyRosterToCharacters<
  T extends { name: string; meta?: CharacterMeta },
>(characters: T[], roster: LookupCharacter[], accountId: string): T[] {
  if (roster.length === 0) return characters;
  const byOcid = new Map(roster.map((item) => [item.ocid, item]));
  const byName = new Map<string, LookupCharacter[]>();
  for (const item of roster) {
    const list = byName.get(item.name) ?? [];
    list.push(item);
    byName.set(item.name, list);
  }

  let changed = false;
  const next = characters.map((character) => {
    if (character.meta?.accountId && character.meta.accountId !== accountId) {
      return character;
    }
    const fromOcid = character.meta?.ocid
      ? byOcid.get(character.meta.ocid)
      : undefined;
    const nameHits = byName.get(character.name) ?? [];
    const live = fromOcid ?? (nameHits.length === 1 ? nameHits[0] : undefined);
    if (!live) return character;
    const updated = applyLiveIdentity(character, live, accountId);
    if (updated !== character) changed = true;
    return updated;
  });
  return changed ? next : characters;
}

export function applyRosters<T extends { name: string; meta?: CharacterMeta }>(
  characters: T[],
  rosters: Map<string, LookupCharacter[]>,
): T[] {
  let next = characters;
  for (const [accountId, roster] of rosters) {
    next = applyRosterToCharacters(next, roster, accountId);
  }
  return next;
}

const ROSTER_TTL_MS = 10 * 60 * 1000;
const rosterCache = new Map<string, { at: number; roster: LookupCharacter[] }>();
const rosterInflight = new Map<string, Promise<LookupCharacter[]>>();

async function fetchRosterCached(
  accountId: string,
  fetchRoster: (id: string) => Promise<LookupCharacter[]>,
): Promise<LookupCharacter[] | null> {
  const cached = rosterCache.get(accountId);
  if (cached && Date.now() - cached.at < ROSTER_TTL_MS) return cached.roster;
  const pending = rosterInflight.get(accountId);
  if (pending) return pending;
  const request = fetchRoster(accountId)
    .then((roster) => {
      rosterCache.set(accountId, { at: Date.now(), roster });
      return roster;
    })
    .finally(() => {
      rosterInflight.delete(accountId);
    });
  rosterInflight.set(accountId, request);
  try {
    return await request;
  } catch {
    return null;
  }
}

/** 연결된 계정별 최신 캐릭터 명단. 실패한 계정은 결과에 넣지 않는다. */
export async function loadAccountRosters(
  accountIds: string[],
  fetchRoster: (id: string) => Promise<LookupCharacter[]> = fetchAccountCharacters,
): Promise<Map<string, LookupCharacter[]>> {
  const unique = [...new Set(accountIds.filter(Boolean))];
  const rosters = new Map<string, LookupCharacter[]>();
  await Promise.all(
    unique.map(async (accountId) => {
      const roster = await fetchRosterCached(accountId, fetchRoster);
      if (roster && roster.length > 0) rosters.set(accountId, roster);
    }),
  );
  return rosters;
}
