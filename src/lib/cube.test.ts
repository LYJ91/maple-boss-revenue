import { describe, expect, it } from 'vitest';
import { CUBE_TYPES, cubeSlotCategory, gradeFromApi } from '../data/cubeData';
import { jobProfile } from '../data/flameData';
import {
  analyzeCubes,
  countUsefulLines,
  parsePotentialLine,
  probabilityReachTarget,
  lineUsefulProbabilities,
} from './cube';

const warrior = jobProfile('히어로');
const mage = jobProfile('비숍');

describe('cubeSlotCategory / gradeFromApi', () => {
  it('슬롯 분류', () => {
    expect(cubeSlotCategory('무기')).toBe('weapon');
    expect(cubeSlotCategory('엠블렘')).toBe('emblem');
    expect(cubeSlotCategory('장갑')).toBe('gloves');
    expect(cubeSlotCategory('반지1')).toBe('accessory');
    expect(cubeSlotCategory('상의')).toBe('armor');
  });

  it('등급 파싱', () => {
    expect(gradeFromApi('유니크')).toBe('unique');
    expect(gradeFromApi('레전드리')).toBe('legendary');
    expect(gradeFromApi(null)).toBeNull();
  });
});

describe('parsePotentialLine', () => {
  it('무기 유효: 공%/보공/방무', () => {
    expect(parsePotentialLine('공격력 +12%', 'weapon', warrior)?.useful).toBe(true);
    expect(parsePotentialLine('보스 몬스터 공격 시 데미지 +40%', 'weapon', warrior)?.useful).toBe(
      true,
    );
    expect(parsePotentialLine('몬스터 방어율 무시 +40%', 'weapon', warrior)?.useful).toBe(true);
    expect(parsePotentialLine('STR : +12%', 'weapon', warrior)?.useful).toBe(false);
  });

  it('마법사는 마력%만 유효', () => {
    expect(parsePotentialLine('마력 +12%', 'weapon', mage)?.useful).toBe(true);
    expect(parsePotentialLine('공격력 +12%', 'weapon', mage)?.useful).toBe(false);
  });

  it('엠블렘은 보공 비유효', () => {
    expect(parsePotentialLine('보스 몬스터 공격 시 데미지 +40%', 'emblem', warrior)?.useful).toBe(
      false,
    );
    expect(parsePotentialLine('몬스터 방어율 무시 +40%', 'emblem', warrior)?.useful).toBe(true);
  });

  it('장갑 크뎀 / 모자 쿨감', () => {
    expect(parsePotentialLine('크리티컬 데미지 +8%', 'gloves', warrior)?.useful).toBe(true);
    expect(parsePotentialLine('크리티컬 데미지 +8%', 'armor', warrior)?.useful).toBe(false);
    expect(
      parsePotentialLine('모든 스킬의 재사용 대기시간 : -2초', 'hat', warrior)?.useful,
    ).toBe(true);
  });

  it('방어구 주스탯%', () => {
    expect(parsePotentialLine('STR : +12%', 'armor', warrior)?.useful).toBe(true);
    expect(parsePotentialLine('INT : +12%', 'armor', warrior)?.useful).toBe(false);
    expect(parsePotentialLine('올스탯 : +9%', 'accessory', warrior)?.useful).toBe(true);
  });
});

describe('countUsefulLines', () => {
  it('유효 줄 수 집계', () => {
    const r = countUsefulLines(
      ['공격력 +12%', '보스 몬스터 공격 시 데미지 +40%', 'STR : +9%'],
      'weapon',
      warrior,
    );
    expect(r.count).toBe(2);
    expect(r.labels).toEqual(['공%', '보공']);
  });
});

describe('probabilityReachTarget', () => {
  it('첫 줄만 확실하면 목표 1은 100%', () => {
    expect(probabilityReachTarget([1, 0, 0], 1)).toBeCloseTo(1);
  });

  it('세 줄 독립 10%면 목표 1은 약 27.1%', () => {
    const p = probabilityReachTarget([0.1, 0.1, 0.1], 1);
    expect(p).toBeCloseTo(1 - 0.9 ** 3, 4);
  });
});

describe('analyzeCubes', () => {
  const silver = CUBE_TYPES.find((c) => c.id === 'silver')!;
  const gold = CUBE_TYPES.find((c) => c.id === 'gold')!;
  const bronze = CUBE_TYPES.find((c) => c.id === 'bronze')!;

  it('유니크 무기는 실버 분석, 미달이면 기대 횟수 > 0', () => {
    const [r] = analyzeCubes(
      [
        {
          slot: '무기',
          name: '테스트웨폰',
          icon: '',
          potentialGrade: '유니크',
          additionalGrade: '에픽',
          potential: ['공격력 +12%', '최대 HP +10%', 'DEX : +9%'],
          additional: [],
        },
      ],
      warrior,
      silver,
      2,
    );
    expect(r.supported).toBe(true);
    expect(r.usefulLines).toBe(1);
    expect(r.done).toBe(false);
    expect(r.expectedTries).toBeGreaterThan(1);
    expect(Number.isFinite(r.expectedTries)).toBe(true);
  });

  it('이미 목표 이상이면 기대 0', () => {
    const [r] = analyzeCubes(
      [
        {
          slot: '무기',
          name: '완성',
          icon: '',
          potentialGrade: '유니크',
          additionalGrade: null,
          potential: [
            '공격력 +12%',
            '보스 몬스터 공격 시 데미지 +35%',
            '몬스터 방어율 무시 +35%',
          ],
          additional: [],
        },
      ],
      warrior,
      silver,
      2,
    );
    expect(r.done).toBe(true);
    expect(r.expectedTries).toBe(0);
  });

  it('레전만 골드 대상, 유니크는 제외', () => {
    const [r] = analyzeCubes(
      [
        {
          slot: '무기',
          name: '유니크총',
          icon: '',
          potentialGrade: '유니크',
          additionalGrade: null,
          potential: ['공격력 +12%', null, null],
          additional: [],
        },
      ],
      warrior,
      gold,
      2,
    );
    expect(r.supported).toBe(false);
  });

  it('에디 에픽은 브론즈 대상', () => {
    const [r] = analyzeCubes(
      [
        {
          slot: '상의',
          name: '상의',
          icon: '',
          potentialGrade: '레전드리',
          additionalGrade: '에픽',
          potential: [],
          additional: ['STR : +6%', '최대 MP +6%', 'DEX : +6%'],
        },
      ],
      warrior,
      bronze,
      2,
    );
    expect(r.supported).toBe(true);
    expect(r.usefulLines).toBe(1);
  });

  it('블랙이 골드보다 2·3줄 동일등급 확률이 높아 기대 횟수가 작다', () => {
    const item = {
      slot: '무기' as const,
      name: '레전무기',
      icon: '',
      potentialGrade: '레전드리',
      additionalGrade: null,
      potential: ['공격력 +12%', 'DEX : +9%', '최대 HP +10%'],
      additional: [] as (string | null)[],
    };
    const black = CUBE_TYPES.find((c) => c.id === 'black')!;
    const g = analyzeCubes([item], warrior, gold, 2)[0];
    const b = analyzeCubes([item], warrior, black, 2)[0];
    expect(g.supported && b.supported).toBe(true);
    expect(b.expectedTries).toBeLessThan(g.expectedTries);
  });
});

describe('lineUsefulProbabilities', () => {
  it('실버 유니크 첫 줄은 useful rate와 동일', () => {
    const p = lineUsefulProbabilities('silver', 'unique', 'weapon', false);
    expect(p[0]).toBeCloseTo(0.32);
    expect(p[1]).toBeCloseTo(0.011858 * 0.32);
  });
});
