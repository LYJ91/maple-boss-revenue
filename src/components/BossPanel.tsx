import type { Boss, BossEntry, Character, Difficulty, ResetType } from '../types';
import { BOSSES, BOSS_MAP, DIFFICULTY_LABEL, RULES } from '../data/crystalData';
import { BOSS_PRESETS, type BossPreset } from '../data/presets';
import type { CharacterSummary } from '../lib/calc';
import { crystalValue, priceAt } from '../lib/calc';
import { formatFull, formatMeso } from '../lib/format';

const GROUPS: { reset: ResetType; title: string; desc: string }[] = [
  {
    reset: 'daily',
    title: '일일 보스',
    desc: '매일 1회 격파 · 주 격파 횟수 설정 가능',
  },
  {
    reset: 'weekly',
    title: '주간 보스',
    desc: `주 1회 격파 · 결정 판매는 캐릭터당 ${RULES.weeklyBossSellLimitPerCharacter}개까지`,
  },
  {
    reset: 'monthly',
    title: '월간 보스',
    desc: '월 1회 격파 · 주간 수익이 아닌 월간 수익에 합산',
  },
];

interface Props {
  character: Character;
  summary: CharacterSummary | undefined;
  today: string;
  onToggle(bossId: string, difficulty: Difficulty): void;
  onUpdateEntry(bossId: string, patch: Partial<BossEntry>): void;
  onApplyPreset(preset: BossPreset): void;
  onRename(name: string): void;
}

/** 캐릭터의 주간 보스 설정이 프리셋 구성과 정확히 일치하는지 */
function matchesPreset(character: Character, preset: BossPreset): boolean {
  const weekly = character.entries.filter(
    (e) => BOSS_MAP.get(e.bossId)?.reset === 'weekly',
  );
  if (weekly.length !== preset.entries.length) return false;
  return preset.entries.every((p) =>
    weekly.some((e) => e.bossId === p.bossId && e.difficulty === p.difficulty),
  );
}

/** 프리셋의 주간 결정석 합계 (솔플 기준, 조회 날짜 가격) */
function presetRevenue(preset: BossPreset, today: string): number {
  let sum = 0;
  for (const { bossId, difficulty } of preset.entries) {
    const variant = BOSS_MAP.get(bossId)?.variants.find(
      (v) => v.difficulty === difficulty,
    );
    if (variant) sum += priceAt(variant, today);
  }
  return sum;
}

export function BossPanel({
  character,
  summary,
  today,
  onToggle,
  onUpdateEntry,
  onApplyPreset,
  onRename,
}: Props) {
  const entryMap = new Map(character.entries.map((e) => [e.bossId, e]));
  const over12 =
    (summary?.weeklyBossSelected ?? 0) > RULES.weeklyBossSellLimitPerCharacter;

  return (
    <div className="boss-panel">
      <div className="panel-head">
        <input
          className="name-input"
          value={character.name}
          onChange={(e) => onRename(e.target.value)}
          maxLength={20}
          aria-label="캐릭터 이름"
        />
        <div className="panel-stats">
          <span className="chip lg">
            주간 <strong>{formatMeso(summary?.weeklyRevenue ?? 0)}</strong> 메소
          </span>
          <span className={'chip lg' + (over12 ? ' warn' : '')}>
            주간 보스 {summary?.weeklyBossSelected ?? 0}/
            {RULES.weeklyBossSellLimitPerCharacter}
          </span>
        </div>
      </div>

      <section className="preset-bar">
        <div className="preset-head">
          <h3>주간 보스 프리셋</h3>
          <span className="group-desc">
            커뮤니티 통용 보스돌이 구성 — 클릭 시 주간 보스가 해당 구성(솔플 기준)으로
            설정됩니다. 일일·월간 보스 설정은 유지됩니다.
          </span>
        </div>
        <div className="preset-chips">
          {BOSS_PRESETS.map((preset) => {
            const active = matchesPreset(character, preset);
            return (
              <button
                key={preset.id}
                type="button"
                className={'preset-chip' + (active ? ' on' : '')}
                title={`${preset.description}\n주간 결정석 합계(솔플): ${formatMeso(presetRevenue(preset, today))} 메소`}
                onClick={() => onApplyPreset(preset)}
              >
                <span className="preset-name">{preset.name}</span>
                <span className="preset-sub">{formatMeso(presetRevenue(preset, today))}</span>
              </button>
            );
          })}
        </div>
      </section>

      {over12 && (
        <p className="notice warn">
          주간 보스를 {RULES.weeklyBossSellLimitPerCharacter}개 초과 선택했습니다. 게임
          규칙상 가격이 높은 {RULES.weeklyBossSellLimitPerCharacter}개만 판매·집계되며,
          초과분 {formatMeso(summary?.weeklyLostToCharLimit ?? 0)} 메소는 제외됩니다.
        </p>
      )}

      {GROUPS.map((group) => {
        const bosses = BOSSES.filter((b) => b.reset === group.reset);
        return (
          <section key={group.reset} className="boss-group">
            <div className="group-head">
              <h3>{group.title}</h3>
              <span className="group-desc">{group.desc}</span>
            </div>
            <div className="boss-rows">
              {bosses.map((boss) => (
                <BossRow
                  key={boss.id}
                  boss={boss}
                  entry={entryMap.get(boss.id)}
                  today={today}
                  onToggle={onToggle}
                  onUpdate={onUpdateEntry}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface RowProps {
  boss: Boss;
  entry: BossEntry | undefined;
  today: string;
  onToggle(bossId: string, difficulty: Difficulty): void;
  onUpdate(bossId: string, patch: Partial<BossEntry>): void;
}

function BossRow({ boss, entry, today, onToggle, onUpdate }: RowProps) {
  const variant = entry
    ? boss.variants.find((v) => v.difficulty === entry.difficulty)
    : undefined;
  const value =
    entry && variant ? crystalValue(priceAt(variant, today), entry.partySize) : 0;
  const clears = entry
    ? Math.min(Math.max(1, entry.clearsPerWeek), RULES.maxDailyClearsPerWeek)
    : 0;

  return (
    <div className={'boss-row' + (entry ? ' active' : '')}>
      <span className="boss-name">{boss.name}</span>

      <div className="pills">
        {boss.variants.map((v) => (
          <button
            key={v.difficulty}
            type="button"
            className={
              'pill ' +
              v.difficulty +
              (entry?.difficulty === v.difficulty ? ' on' : '')
            }
            title={`결정석 ${formatFull(priceAt(v, today))} 메소`}
            onClick={() => onToggle(boss.id, v.difficulty)}
          >
            {DIFFICULTY_LABEL[v.difficulty]}
          </button>
        ))}
      </div>

      {entry && variant ? (
        <div className="row-controls">
          <label className="control">
            파티
            <select
              value={entry.partySize}
              onChange={(e) => onUpdate(boss.id, { partySize: Number(e.target.value) })}
            >
              {Array.from({ length: boss.maxPartySize }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}인
                </option>
              ))}
            </select>
          </label>
          {boss.reset === 'daily' && (
            <label className="control">
              주
              <select
                value={clears}
                onChange={(e) =>
                  onUpdate(boss.id, { clearsPerWeek: Number(e.target.value) })
                }
              >
                {Array.from({ length: RULES.maxDailyClearsPerWeek }, (_, i) => i + 1).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}회
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          <div className="row-value">
            <strong>
              {formatMeso(boss.reset === 'daily' ? value * clears : value)}
            </strong>
            <span className="row-value-sub">
              {boss.reset === 'daily'
                ? `결정 1개 ${formatMeso(value)}`
                : boss.reset === 'weekly'
                  ? '주 1회'
                  : '월 1회'}
            </span>
          </div>
        </div>
      ) : (
        <div className="row-controls empty" />
      )}
    </div>
  );
}
