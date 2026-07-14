import { describe, expect, it } from 'vitest';
import { CUBE_TYPES, mesuEquipKey } from '../data/cubeData';
import { jobProfile } from '../data/flameData';
import {
  analyzeCubes,
  countUsefulLines,
  lineUsefulProbabilities,
  parsePotentialLine,
  probabilityReachTarget,
  usefulRateInPool,
} from './cube';
import mesuTables from '../data/mesuCubeOptions.json';

const warrior = jobProfile('히어로');
const mage = jobProfile('비숍');

describe('mesuEquipKey', () => {
  it('슬롯 매핑', () => {
    expect(mesuEquipKey('무기')).toBe('무기');
    expect(mesuEquipKey('반지1')).toBe('반지');
    expect(mesuEquipKey('보조무기')).toBe('보조무기(포스실드, 소울링 제외)');
  });
});

describe('parsePotentialLine', () => {
  it('무기 유효: 공%/보공/방무 (mesu 표기 포함)', () => {
    expect(parsePotentialLine('공격력 : +9%', 'weapon', warrior)?.useful).toBe(true);
    expect(parsePotentialLine('보스 몬스터 공격 시 데미지 : +30%', 'weapon', warrior)?.useful).toBe(
      true,
    );
    expect(parsePotentialLine('몬스터 방어율 무시 : +30%', 'weapon', warrior)?.useful).toBe(true);
    expect(parsePotentialLine('공격력 : +32', 'weapon', warrior)?.useful).toBe(false);
    expect(parsePotentialLine('STR : +12%', 'weapon', warrior)?.useful).toBe(false);
  });

  it('마법사는 마력%만 유효', () => {
    expect(parsePotentialLine('마력 : +12%', 'weapon', mage)?.useful).toBe(true);
    expect(parsePotentialLine('공격력 : +12%', 'weapon', mage)?.useful).toBe(false);
  });

  it('엠블렘은 보공 비유효', () => {
    expect(
      parsePotentialLine('보스 몬스터 공격 시 데미지 : +40%', 'emblem', warrior)?.useful,
    ).toBe(false);
    expect(parsePotentialLine('몬스터 방어율 무시 : +40%', 'emblem', warrior)?.useful).toBe(true);
  });
});

describe('mesu useful rates', () => {
  it('실버 유니크 무기 공%/보공/방무 합 ≈ 20%', () => {
    const pool = mesuTables.methods.silver['무기'].UNIQUE;
    const rate = usefulRateInPool(pool, 'weapon', warrior, false);
    expect(rate).toBeCloseTo(0.2, 2);
  });

  it('하위 에픽 줄을 반영하면 2줄 기대가 동일등급만 볼 때보다 낮다', () => {
    const withLower = lineUsefulProbabilities(
      'silver',
      'unique',
      '무기',
      'weapon',
      warrior,
      false,
    );
    // L2 should be dominated by epic useful (~7.7%), not only unique*0.2
    expect(withLower[1]).toBeGreaterThan(0.05);
    const p2 = probabilityReachTarget(withLower, 2);
    const tries = 1 / p2;
    // without lower grades: ~1000+; with mesu lower: typically tens~low hundreds
    expect(tries).toBeLessThan(200);
    expect(tries).toBeGreaterThan(10);
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
  });
});

describe('additional epic useful (bronze)', () => {
  it('마법사: 상의에서 마력(평마)·올스탯·INT% 유효, 공%는 비유효', () => {
    expect(parsePotentialLine('마력 : +11', 'armor', mage, false, 'additional')?.useful).toBe(
      true,
    );
    expect(parsePotentialLine('올스탯 : +2%', 'armor', mage, false, 'additional')?.useful).toBe(
      true,
    );
    expect(parsePotentialLine('INT : +4%', 'armor', mage, false, 'additional')?.useful).toBe(true);
    expect(parsePotentialLine('공격력 : +11', 'armor', mage, false, 'additional')?.useful).toBe(
      false,
    );
  });

  it('물리: 상의에서 공격력(평공)·올스탯·STR% 유효, 마력은 비유효', () => {
    expect(parsePotentialLine('공격력 : +11', 'armor', warrior, false, 'additional')?.useful).toBe(
      true,
    );
    expect(parsePotentialLine('올스탯 : +2%', 'armor', warrior, false, 'additional')?.useful).toBe(
      true,
    );
    expect(parsePotentialLine('마력 : +11', 'armor', warrior, false, 'additional')?.useful).toBe(
      false,
    );
  });

  it('에디 무기: 올스탯%도 유효 (본잠에선 무기 올스탯 비유효)', () => {
    expect(parsePotentialLine('올스탯 : +3%', 'weapon', warrior, false, 'additional')?.useful).toBe(
      true,
    );
    expect(parsePotentialLine('올스탯 : +3%', 'weapon', warrior, false, 'main')?.useful).toBe(false);
    expect(parsePotentialLine('공격력 : +6%', 'weapon', warrior, false, 'additional')?.useful).toBe(
      true,
    );
  });

  it('브론즈 상의 물리 유효 비율이 주스탯만일 때보다 큼', () => {
    const pool = mesuTables.methods.bronze['상의'].EPIC;
    const mainOnly = usefulRateInPool(pool, 'armor', warrior, false, 'main');
    const addi = usefulRateInPool(pool, 'armor', warrior, false, 'additional');
    // main: STR% 4% + allstat 4% = 0.08
    // addi: + flat ATT 4% → 0.12
    expect(mainOnly).toBeCloseTo(0.08, 2);
    expect(addi).toBeCloseTo(0.12, 2);
    expect(addi).toBeGreaterThan(mainOnly);
  });
});

describe('analyzeCubes', () => {
  const silver = CUBE_TYPES.find((c) => c.id === 'silver')!;
  const gold = CUBE_TYPES.find((c) => c.id === 'gold')!;
  const bronze = CUBE_TYPES.find((c) => c.id === 'bronze')!;
  const black = CUBE_TYPES.find((c) => c.id === 'black')!;

  it('유니크 무기 실버 목표 2줄 — mesu 기반 유한 기대', () => {
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
    expect(r.expectedTries).toBeGreaterThan(10);
    expect(r.expectedTries).toBeLessThan(200);
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

  it('레전만 골드 대상', () => {
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

  it('에디 에픽 평공도 유효 줄로 집계', () => {
    const [r] = analyzeCubes(
      [
        {
          slot: '상의',
          name: '상의',
          icon: '',
          potentialGrade: '레전드리',
          additionalGrade: '에픽',
          potential: [],
          additional: ['공격력 : +11', '올스탯 : +2%', 'DEX : +4%'],
        },
      ],
      warrior,
      bronze,
      2,
    );
    expect(r.supported).toBe(true);
    expect(r.usefulLines).toBe(2);
    expect(r.done).toBe(true);
  });

  it('블랙이 골드보다 레전 2줄 기대가 유리', () => {
    const item = {
      slot: '무기',
      name: '레전무기',
      icon: '',
      potentialGrade: '레전드리',
      additionalGrade: null,
      potential: ['공격력 +12%', 'DEX : +9%', '최대 HP +10%'],
      additional: [] as (string | null)[],
    };
    const g = analyzeCubes([item], warrior, gold, 2)[0];
    const b = analyzeCubes([item], warrior, black, 2)[0];
    expect(g.supported && b.supported).toBe(true);
    expect(b.expectedTries).toBeLessThan(g.expectedTries);
  });
});
