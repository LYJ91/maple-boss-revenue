const NEXON_BASE = "https://open.api.nexon.com/maplestory/v1";

/** 조회 가능한 파트 화이트리스트 (part 이름 → 넥슨 API 경로) */
export const PARTS: Record<string, string> = {
  basic: "/character/basic",
  popularity: "/character/popularity",
  stat: "/character/stat",
  "hyper-stat": "/character/hyper-stat",
  propensity: "/character/propensity",
  ability: "/character/ability",
  item: "/character/item-equipment",
  cash: "/character/cashitem-equipment",
  symbol: "/character/symbol-equipment",
  "set-effect": "/character/set-effect",
  beauty: "/character/beauty-equipment",
  android: "/character/android-equipment",
  pet: "/character/pet-equipment",
  "link-skill": "/character/link-skill",
  vmatrix: "/character/vmatrix",
  hexamatrix: "/character/hexamatrix",
  "hexa-stat": "/character/hexamatrix-stat",
  dojang: "/character/dojang",
  union: "/user/union",
  "union-raider": "/user/union-raider",
  "union-artifact": "/user/union-artifact",
  "union-champion": "/user/union-champion",
};

export const CHUNK_SIZE = 4;
export const CHUNK_INTERVAL_MS = 1100;

export async function lookupOcid(name: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `${NEXON_BASE}/id?character_name=${encodeURIComponent(name)}`,
    { headers: { "x-nxopen-api-key": apiKey } },
  );
  if (!response.ok) {
    throw Object.assign(new Error(`캐릭터 조회 실패 (${response.status})`), {
      status: response.status,
    });
  }
  const body = (await response.json()) as { ocid?: string };
  if (!body.ocid) throw new Error("캐릭터 식별자를 받지 못했습니다.");
  return body.ocid;
}

export async function fetchCharacterPart(
  ocid: string,
  part: string,
  apiKey: string,
): Promise<unknown> {
  const path = PARTS[part];
  if (!path) return { error: "지원하지 않는 조회 파트입니다." };
  const response = await fetch(`${NEXON_BASE}${path}?ocid=${encodeURIComponent(ocid)}`, {
    headers: { "x-nxopen-api-key": apiKey },
  });
  if (!response.ok) return { error: `조회 실패 (${response.status})` };
  return response.json();
}
