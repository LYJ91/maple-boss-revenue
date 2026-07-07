export type Difficulty = 'easy' | 'normal' | 'hard' | 'chaos' | 'extreme';

export type ResetType = 'daily' | 'weekly' | 'monthly';

/** 특정 시점부터 적용되는 결정석 가격 (공지의 발효일 처리용) */
export interface PricePoint {
  price: number;
  /** 이 가격이 적용되기 시작한 날짜 (YYYY-MM-DD, KST) */
  since: string;
}

export interface BossVariant {
  difficulty: Difficulty;
  /** since 오름차순. 조회 시점 이하 중 가장 최신 가격이 적용된다. */
  prices: PricePoint[];
}

export interface Boss {
  id: string;
  name: string;
  reset: ResetType;
  maxPartySize: number;
  variants: BossVariant[];
}

/** 캐릭터가 잡는 보스 1건의 설정 */
export interface BossEntry {
  bossId: string;
  difficulty: Difficulty;
  partySize: number;
  /** 일일 보스만 사용 (1~7). 주간/월간은 무시된다. */
  clearsPerWeek: number;
}

/** 넥슨 API에서 불러온 캐릭터 부가 정보 (수동 추가 캐릭터는 없음) */
export interface CharacterMeta {
  world?: string;
  job?: string;
  level?: number;
  image?: string;
}

export interface Character {
  id: string;
  name: string;
  entries: BossEntry[];
  meta?: CharacterMeta;
}

/* ───── 주간 체크리스트 ───── */

/** 주간 리셋 요일 (월요일: 길드 콘텐츠 / 목요일: 주간 보스·에픽 던전 등) */
export type ResetDay = 'mon' | 'thu';

export interface TodoItem {
  id: string;
  label: string;
  resetDay: ResetDay;
  /** 기본 제공 항목 여부 (커스텀 항목과 구분용) */
  builtin?: boolean;
}

export interface TodoCharacter {
  id: string;
  name: string;
  meta?: CharacterMeta;
  /** 이 캐릭터에서 사용하지 않는(비활성) 체크리스트 항목 id 목록 */
  disabledItemIds: string[];
}
