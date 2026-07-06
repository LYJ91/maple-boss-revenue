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
