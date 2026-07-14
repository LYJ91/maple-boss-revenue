/** 넥슨 Open API 프록시(/api/*) 클라이언트 */

export interface LookupCharacter {
  ocid: string;
  name: string;
  world: string;
  job: string;
  level: number;
  image?: string;
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('네트워크 오류가 발생했습니다. 연결을 확인해주세요.');
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `요청에 실패했습니다. (${res.status})`);
  }
  return body as T;
}

/** 캐릭터명으로 기본 정보 조회 (사이트 API 키 사용, 서버 프록시 경유) */
export function searchCharacter(name: string): Promise<LookupCharacter> {
  return request<LookupCharacter>(
    `/api/character?name=${encodeURIComponent(name.trim())}`,
  );
}

/** 방문자 본인의 API 키로 계정 전체 캐릭터 목록 조회 */
export async function fetchAccountCharacters(
  apiKey: string,
): Promise<LookupCharacter[]> {
  const { characters } = await request<{ characters: LookupCharacter[] }>(
    '/api/account',
    { headers: { 'x-user-api-key': apiKey.trim() } },
  );
  return characters;
}

/**
 * 캐릭터 상세 파트 일괄 조회.
 * 응답은 { 파트명: 넥슨 원본 응답 } 형태이며, 실패한 파트는 { error }가 담긴다.
 */
export type DetailData = Record<string, any>;

export function fetchDetail(ocid: string, parts: string[]): Promise<DetailData> {
  return request<DetailData>(
    `/api/detail?ocid=${encodeURIComponent(ocid)}&parts=${parts.join(',')}`,
  );
}
