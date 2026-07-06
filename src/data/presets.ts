import type { Difficulty } from '../types';

/**
 * 주간 보스돌이 프리셋 (커뮤니티 통용 용어)
 *
 * 출처: 나무위키 '보스돌이' 문서 (2026-05-27 판) 기준으로 구성을 확인하고,
 * 문서에 기재된 프리셋별 주간 수익(2025-10-16 가격 기준)을 당시 결정석 가격으로
 * 역산하여 보스 구성이 일치함을 검증했다.
 *   - 검밑솔 6억 5691만 / 노세이칼 12억 1718만 / 하세이적자 16억 6190만 / 노칼이카 23억 1710만 등
 * 프리셋은 주간 보스만 다루며(일일/월간 보스 설정은 유지), 전부 솔플(1인) 기준이다.
 *
 * 하세이칼은 하드 세렌이 이지 대적자보다 어렵다는 점을 반영해 이지 대적자를 포함한다
 * (문서상 '하세이적자'와 동일 구성).
 *
 * 참고: 2026-06-18 개편으로 이지 시그너스 삭제, 하드 힐라·카오스 핑크빈·노멀 시그너스가
 * 일일 보스로 전환되어 과거 하위 보스돌이 구성과는 주간 보스 수가 다를 수 있다.
 */
export interface BossPreset {
  id: string;
  /** 커뮤니티 통용 명칭 */
  name: string;
  /** 어떤 라인인지 짧은 설명 */
  description: string;
  entries: { bossId: string; difficulty: Difficulty }[];
}

type E = BossPreset['entries'];

/** 검밑솔 공통 8보스 (하드 스우 ~ 하드 진 힐라 솔격 라인) */
const GEOMMIT_8: E = [
  { bossId: 'lotus', difficulty: 'hard' },
  { bossId: 'damien', difficulty: 'hard' },
  { bossId: 'guardian-angel-slime', difficulty: 'chaos' },
  { bossId: 'lucid', difficulty: 'hard' },
  { bossId: 'will', difficulty: 'hard' },
  { bossId: 'dusk', difficulty: 'chaos' },
  { bossId: 'dunkel', difficulty: 'hard' },
  { bossId: 'verus-hilla', difficulty: 'hard' },
];

const CHAOS_PAPULATUS: E[number] = { bossId: 'papulatus-weekly', difficulty: 'chaos' };
const CHAOS_VELLUM: E[number] = { bossId: 'vellum-weekly', difficulty: 'chaos' };
const HARD_MAGNUS: E[number] = { bossId: 'magnus-weekly', difficulty: 'hard' };
const CHAOS_PIERRE: E[number] = { bossId: 'pierre-weekly', difficulty: 'chaos' };

export const BOSS_PRESETS: BossPreset[] = [
  {
    id: 'geommitsol',
    name: '검밑솔',
    description: '검은 마법사 밑 하드/카오스 솔격 (유니온 챔피언 A)',
    entries: [...GEOMMIT_8, CHAOS_PAPULATUS, CHAOS_VELLUM, HARD_MAGNUS, CHAOS_PIERRE],
  },
  {
    id: 'nose-ikal',
    name: '노세이칼',
    description: '검밑솔 + 노멀 세렌 + 이지 칼로스',
    entries: [
      ...GEOMMIT_8,
      CHAOS_PAPULATUS,
      CHAOS_VELLUM,
      { bossId: 'seren', difficulty: 'normal' },
      { bossId: 'kalos', difficulty: 'easy' },
    ],
  },
  {
    id: 'ijeokja',
    name: '이적자',
    description: '노세이칼 + 이지 대적자 (카벨 제외)',
    entries: [
      ...GEOMMIT_8,
      CHAOS_PAPULATUS,
      { bossId: 'seren', difficulty: 'normal' },
      { bossId: 'kalos', difficulty: 'easy' },
      { bossId: 'adversary', difficulty: 'easy' },
    ],
  },
  {
    // 하드 세렌이 이지 대적자보다 어려운 보스이므로, 하세이칼 스펙이면
    // 이지 대적자도 함께 잡는 구성으로 본다 (이적자에서 세렌만 하드로 승급).
    id: 'hase-ikal',
    name: '하세이칼',
    description: '이적자 + 하드 세렌 승급 (유니온 챔피언 SS)',
    entries: [
      ...GEOMMIT_8,
      CHAOS_PAPULATUS,
      { bossId: 'seren', difficulty: 'hard' },
      { bossId: 'kalos', difficulty: 'easy' },
      { bossId: 'adversary', difficulty: 'easy' },
    ],
  },
  {
    id: 'ika',
    name: '이카',
    description: '하세이칼 + 이지 카링 (카파풀 제외)',
    entries: [
      ...GEOMMIT_8,
      { bossId: 'seren', difficulty: 'hard' },
      { bossId: 'kalos', difficulty: 'easy' },
      { bossId: 'adversary', difficulty: 'easy' },
      { bossId: 'kaling', difficulty: 'easy' },
    ],
  },
  {
    id: 'nokal-ika',
    name: '노칼이카',
    description: '이카 + 칼로스 노멀 승급 (검윗솔 상위)',
    entries: [
      ...GEOMMIT_8,
      { bossId: 'seren', difficulty: 'hard' },
      { bossId: 'kalos', difficulty: 'normal' },
      { bossId: 'adversary', difficulty: 'easy' },
      { bossId: 'kaling', difficulty: 'easy' },
    ],
  },
];
