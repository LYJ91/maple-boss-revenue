import type { Difficulty } from '../types';

/**
 * 주간 보스돌이 프리셋.
 *
 * 프리셋은 주간 보스만 다루며(일일/월간 보스 설정은 유지), 보스별 파티 인원도
 * 구성에 포함한다. 제목에 인원이 없는 단계는 그 단계의 보스가 1인이다.
 * 상위 단계로 갈 때 이미 적힌 보스의 인원은 유지되고, 새로 적힌 보스만
 * 그 단계의 인원을 따른다.
 */
export interface BossPreset {
  id: string;
  name: string;
  /** 어떤 라인인지 짧은 설명 */
  description: string;
  entries: { bossId: string; difficulty: Difficulty; partySize: number }[];
}

function e(
  bossId: string,
  difficulty: Difficulty,
  partySize = 1,
): BossPreset['entries'][number] {
  return { bossId, difficulty, partySize };
}

export const BOSS_PRESETS: BossPreset[] = [
  {
    id: 'ibel',
    name: '이벨',
    description:
      '하데미 · 카가엔슬 · 하루시드 · 하윌 · 카더스크 · 하진힐라 · 하듄켈 · 하세 · 이칼 · 이적자 · 이카 · 이벨 (전부 1인)',
    entries: [
      e('damien', 'hard'),
      e('guardian-angel-slime', 'chaos'),
      e('lucid', 'hard'),
      e('will', 'hard'),
      e('dusk', 'chaos'),
      e('verus-hilla', 'hard'),
      e('dunkel', 'hard'),
      e('seren', 'hard'),
      e('kalos', 'easy'),
      e('adversary', 'easy'),
      e('kaling', 'easy'),
      e('bellona', 'easy'),
    ],
  },
  {
    id: 'nokal',
    name: '노칼',
    description:
      '하데미 · 카가엔슬 · 하루시드 · 하윌 · 카더스크 · 하진힐라 · 하듄켈 · 하세 · 노칼 · 이적자 · 이카 · 이벨 (전부 1인)',
    entries: [
      e('damien', 'hard'),
      e('guardian-angel-slime', 'chaos'),
      e('lucid', 'hard'),
      e('will', 'hard'),
      e('dusk', 'chaos'),
      e('verus-hilla', 'hard'),
      e('dunkel', 'hard'),
      e('seren', 'hard'),
      e('kalos', 'normal'),
      e('adversary', 'easy'),
      e('kaling', 'easy'),
      e('bellona', 'easy'),
    ],
  },
  {
    id: 'nohyung-3',
    name: '노흉 3인',
    description:
      '하데미 · 하루시드 · 하윌 · 카더스크 · 하진힐라 · 하듄켈 · 하세 · 노칼 · 이적자 · 이카 · 이벨 · 노흉(3인). 카가엔슬 제외',
    entries: [
      e('damien', 'hard'),
      e('lucid', 'hard'),
      e('will', 'hard'),
      e('dusk', 'chaos'),
      e('verus-hilla', 'hard'),
      e('dunkel', 'hard'),
      e('seren', 'hard'),
      e('kalos', 'normal'),
      e('adversary', 'easy'),
      e('kaling', 'easy'),
      e('bellona', 'easy'),
      e('brilliant-star', 'normal', 3),
    ],
  },
  {
    id: 'nojeok',
    name: '노적',
    description:
      '하데미 · 하루시드 · 하윌 · 카더스크 · 하진힐라 · 하듄켈 · 하세 · 노칼 · 노적자 · 이카 · 이벨 · 노흉(3인)',
    entries: [
      e('damien', 'hard'),
      e('lucid', 'hard'),
      e('will', 'hard'),
      e('dusk', 'chaos'),
      e('verus-hilla', 'hard'),
      e('dunkel', 'hard'),
      e('seren', 'hard'),
      e('kalos', 'normal'),
      e('adversary', 'normal'),
      e('kaling', 'easy'),
      e('bellona', 'easy'),
      e('brilliant-star', 'normal', 3),
    ],
  },
  {
    id: 'nohyung-2',
    name: '노흉 2인',
    description:
      '하데미 · 하루시드 · 하윌 · 카더스크 · 하진힐라 · 하듄켈 · 하세 · 노칼 · 노적자 · 이카 · 이벨 · 노흉(2인)',
    entries: [
      e('damien', 'hard'),
      e('lucid', 'hard'),
      e('will', 'hard'),
      e('dusk', 'chaos'),
      e('verus-hilla', 'hard'),
      e('dunkel', 'hard'),
      e('seren', 'hard'),
      e('kalos', 'normal'),
      e('adversary', 'normal'),
      e('kaling', 'easy'),
      e('bellona', 'easy'),
      e('brilliant-star', 'normal', 2),
    ],
  },
  {
    id: 'exlotus-2',
    name: '익스우 2인',
    description:
      '익스우(2인) · 하루시드 · 하윌 · 카더스크 · 하진힐라 · 하듄켈 · 하세 · 노칼 · 노적자 · 이카 · 이벨 · 노흉(2인). 하데미 제외',
    entries: [
      e('lotus', 'extreme', 2),
      e('lucid', 'hard'),
      e('will', 'hard'),
      e('dusk', 'chaos'),
      e('verus-hilla', 'hard'),
      e('dunkel', 'hard'),
      e('seren', 'hard'),
      e('kalos', 'normal'),
      e('adversary', 'normal'),
      e('kaling', 'easy'),
      e('bellona', 'easy'),
      e('brilliant-star', 'normal', 2),
    ],
  },
];
