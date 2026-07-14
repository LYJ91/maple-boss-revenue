import { describe, expect, it } from 'vitest';
import {
  FLAME_TYPES,
  effectScore,
  jobProfile,
  optionEffect,
  optionPool,
  weaponAttackFlame,
} from '../data/flameData';
import { analyzeFlames, improveProbability, parseAddOption } from './flame';

const BLACK = FLAME_TYPES.find((f) => f.id === 'black')!;
const ABYSS = FLAME_TYPES.find((f) => f.id === 'abyss')!;

describe('weaponAttackFlame (무기 공마 공식)', () => {
  it('200제 순공 200 무기의 6단계(2추)는 96', () => {
    // (200/40몫+1)=6, 6×6×1.1^3 = 47.916% → ceil(200×0.47916) = 96
    expect(weaponAttackFlame(200, 200, 6)).toBe(96);
  });

  it('제네시스 무기(200제, 순공 340)의 7단계(1추)는 210', () => {
    expect(weaponAttackFlame(340, 200, 7)).toBe(210);
  });
});

describe('optionEffect (수치 공식)', () => {
  it('단일 스탯: 200제 7단계 = 77', () => {
    expect(optionEffect('str', 7, 200, false, 0, 0).str).toBe(77);
  });

  it('단일 스탯: 250제는 220으로 취급 = 12×단계', () => {
    expect(optionEffect('int', 5, 250, false, 0, 0).int).toBe(60);
  });

  it('이중 스탯: 200제 5단계 = 각각 30', () => {
    const e = optionEffect('dex_luk', 5, 200, false, 0, 0);
    expect(e.dex).toBe(30);
    expect(e.luk).toBe(30);
  });

  it('MaxHP: 150제 3단계 = 1350', () => {
    expect(optionEffect('max_hp', 3, 150, false, 0, 0).maxHp).toBe(1350);
  });

  it('방어구 공격력은 단계값 그대로', () => {
    expect(optionEffect('attack_power', 6, 160, false, 0, 0).attack).toBe(6);
  });

  it('보공은 단계×2%, 올스탯은 단계%', () => {
    expect(optionEffect('boss_damage', 7, 200, true, 300, 0).bossDamagePct).toBe(14);
    expect(optionEffect('all_stat', 4, 160, false, 0, 0).allStatPct).toBe(4);
  });
});

describe('optionPool', () => {
  it('무기 풀에는 보공/뎀, 방어구 풀에는 이속/점프', () => {
    const weapon = optionPool(true, 200);
    const armor = optionPool(false, 160);
    expect(weapon).toContain('boss_damage');
    expect(weapon).toContain('damage');
    expect(weapon).not.toContain('speed');
    expect(armor).toContain('speed');
    expect(armor).toContain('jump');
    expect(armor).not.toContain('boss_damage');
    expect(weapon).toHaveLength(19);
    expect(armor).toHaveLength(19);
  });

  it('70레벨 미만에는 올스탯이 없다', () => {
    expect(optionPool(false, 60)).not.toContain('all_stat');
  });
});

describe('jobProfile', () => {
  it('비숍은 INT 주스탯 + 마력', () => {
    const p = jobProfile('비숍');
    expect(p.main).toEqual(['int']);
    expect(p.sub).toEqual(['luk']);
    expect(p.attackType).toBe('magic');
  });

  it('제논은 3스탯, 데몬어벤져는 HP', () => {
    expect(jobProfile('제논').main).toEqual(['str', 'dex', 'luk']);
    expect(jobProfile('데몬어벤져').useHp).toBe(true);
  });

  it('모르는 직업은 스탯 수치로 추론한다', () => {
    const p = jobProfile('미래의신직업', { str: 100, dex: 200, int: 50, luk: 4000 });
    expect(p.main).toEqual(['luk']);
    expect(p.sub).toEqual(['dex']);
  });
});

describe('parseAddOption + effectScore', () => {
  it('환산 점수: 주스탯1 + 부스탯0.1 + 공마4 + 올스탯10', () => {
    const effect = parseAddOption({
      int: '120',
      luk: '40',
      magic_power: '6',
      all_stat: '5',
      speed: '3',
    });
    const score = effectScore(effect, jobProfile('비숍'), false);
    // 120 + 40×0.1 + 6×4 + 5×10 = 198
    expect(score).toBe(198);
  });

  it('잘못된 공격 종류는 점수 0 (비숍에게 물리 공격력)', () => {
    const effect = parseAddOption({ attack_power: '7' });
    expect(effectScore(effect, jobProfile('비숍'), false)).toBe(0);
  });
});

describe('improveProbability', () => {
  const bishop = jobProfile('비숍');

  it('현재 점수가 음수면 어떤 결과든 개선 → p=1', () => {
    const { pImprove } = improveProbability(-1, 160, false, 0, 0, bishop, BLACK);
    expect(pImprove).toBe(1);
  });

  it('도달 불가능한 점수면 p=0', () => {
    const { pImprove, maxScore } = improveProbability(
      99999,
      160,
      false,
      0,
      0,
      bishop,
      BLACK,
    );
    expect(pImprove).toBe(0);
    expect(maxScore).toBeLessThan(99999);
  });

  it('점수가 높을수록 개선 확률은 낮아진다 (단조성)', () => {
    const p10 = improveProbability(10, 160, false, 0, 0, bishop, BLACK).pImprove;
    const p60 = improveProbability(60, 160, false, 0, 0, bishop, BLACK).pImprove;
    const p120 = improveProbability(120, 160, false, 0, 0, bishop, BLACK).pImprove;
    expect(p10).toBeGreaterThan(p60);
    expect(p60).toBeGreaterThan(p120);
    expect(p120).toBeGreaterThan(0);
  });

  it('심환불은 검환불보다 같은 목표에 대해 개선 확률이 높다', () => {
    const pBlack = improveProbability(80, 160, false, 0, 0, bishop, BLACK).pImprove;
    const pAbyss = improveProbability(80, 160, false, 0, 0, bishop, ABYSS).pImprove;
    expect(pAbyss).toBeGreaterThan(pBlack);
  });

  it('보스 장비 최고점: 160제 방어구 주스탯 관점 검증', () => {
    // 최고 조합: INT단일(9×7=63) + 올스탯(7%→70) + INT+LUK(35 + 부스탯 35×0.1=38.5)
    //           + INT이중 하나 더(35) = 206.5
    const { maxScore } = improveProbability(0, 160, false, 0, 0, bishop, BLACK);
    expect(maxScore).toBe(206.5);
  });
});

describe('analyzeFlames', () => {
  const bishop = jobProfile('비숍');

  const makeItem = (
    slot: string,
    addOption: Record<string, string>,
    level = 160,
  ) => ({
    slot,
    name: `테스트 ${slot}`,
    icon: '',
    addOption,
    baseOption: { base_equipment_level: String(level), attack_power: '0', magic_power: '0' },
  });

  it('추옵 낮은 장비가 우선순위 상위로 온다', () => {
    const bad = makeItem('모자', { jump: '4' }); // 점수 0
    const good = makeItem('장갑', { int: '110', all_stat: '6' }); // 점수 170
    const results = analyzeFlames([good, bad], bishop, BLACK);
    expect(results[0].slot).toBe('모자');
    expect(results[0].expectedTries).toBeLessThan(results[1].expectedTries);
  });

  it('추옵 없는 장비는 미지원으로 분류', () => {
    const none = makeItem('반지1', {});
    const results = analyzeFlames([none], bishop, BLACK);
    expect(results[0].supported).toBe(false);
  });

  it('분석 대상 슬롯이 아니면 결과에서 제외 (훈장/뱃지 등)', () => {
    const medal = makeItem('훈장', { int: '10' });
    expect(analyzeFlames([medal], bishop, BLACK)).toHaveLength(0);
  });

  it('제로 무기는 미지원', () => {
    const weapon = makeItem('무기', { str: '40' }, 180);
    const results = analyzeFlames([weapon], jobProfile('제로'), BLACK, '제로');
    expect(results[0].supported).toBe(false);
  });
});
