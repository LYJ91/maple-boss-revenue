import { useMemo, useState } from 'react';
import { type CubeId } from '../../data/cubeData';
import { jobProfile } from '../../data/flameData';
import {
  analyzeCubes,
  cubeById,
  type CubeAnalysis,
  type CubeItemInput,
} from '../../lib/cube';
import { Section } from './shared';

export interface CubeEquipLike {
  item_equipment_slot: string;
  item_equipment_part?: string;
  item_name: string;
  item_icon: string;
  potential_option_grade: string | null;
  additional_potential_option_grade: string | null;
  potential_option_1: string | null;
  potential_option_2: string | null;
  potential_option_3: string | null;
  additional_potential_option_1: string | null;
  additional_potential_option_2: string | null;
  additional_potential_option_3: string | null;
}

type Mode = 'silver' | 'legendary' | 'bronze';

const fmtPct = (p: number) => {
  if (p <= 0) return '0%';
  const pct = p * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
};

const fmtTries = (t: number, done: boolean) => {
  if (done) return '완료';
  if (!Number.isFinite(t)) return '도달 불가';
  if (t >= 10) return `약 ${Math.round(t).toLocaleString('ko-KR')}회`;
  return `약 ${t.toFixed(1)}회`;
};

export function CubePriority({
  equips,
  job,
  finalStats,
  onPick,
}: {
  equips: CubeEquipLike[];
  job?: string;
  finalStats?: { str?: number; dex?: number; int?: number; luk?: number };
  onPick?(slot: string): void;
}) {
  const [mode, setMode] = useState<Mode>('silver');
  const [legendCube, setLegendCube] = useState<'gold' | 'black'>('gold');
  const [targetLines, setTargetLines] = useState<1 | 2 | 3>(2);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const profile = useMemo(
    () => jobProfile(job, finalStats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job, finalStats?.str, finalStats?.dex, finalStats?.int, finalStats?.luk],
  );

  const cubeId: CubeId =
    mode === 'silver' ? 'silver' : mode === 'bronze' ? 'bronze' : legendCube;
  const cube = cubeById(cubeId);

  const results = useMemo(() => {
    const inputs: CubeItemInput[] = equips.map((eq) => ({
      slot: eq.item_equipment_slot,
      part: eq.item_equipment_part,
      name: eq.item_name,
      icon: eq.item_icon,
      potentialGrade: eq.potential_option_grade,
      additionalGrade: eq.additional_potential_option_grade,
      potential: [
        eq.potential_option_1,
        eq.potential_option_2,
        eq.potential_option_3,
      ],
      additional: [
        eq.additional_potential_option_1,
        eq.additional_potential_option_2,
        eq.additional_potential_option_3,
      ],
    }));
    return analyzeCubes(inputs, profile, cube, targetLines);
  }, [equips, profile, cube, targetLines]);

  const supported = results.filter((r) => r.supported);
  const pending = supported.filter((r) => !r.done);
  const done = supported.filter((r) => r.done);
  const excluded = results.filter((r) => !r.supported);

  if (equips.length === 0) return null;

  const mainLabel = profile.useHp
    ? 'MaxHP%'
    : profile.main.map((s) => s.toUpperCase()).join('·') + '%';

  return (
    <Section
      title="큐브 강화 우선순위"
      aside={
        <span className="flame-toggle">
          <button
            className={'flame-toggle-btn' + (mode === 'silver' ? ' on' : '')}
            onClick={() => setMode('silver')}
          >
            실버
          </button>
          <button
            className={'flame-toggle-btn' + (mode === 'legendary' ? ' on' : '')}
            onClick={() => setMode('legendary')}
          >
            골드·블랙
          </button>
          <button
            className={'flame-toggle-btn' + (mode === 'bronze' ? ' on' : '')}
            onClick={() => setMode('bronze')}
          >
            브론즈
          </button>
        </span>
      }
    >
      <div className="cube-controls">
        {mode === 'legendary' && (
          <span className="flame-toggle">
            {(['gold', 'black'] as const).map((id) => (
              <button
                key={id}
                className={'flame-toggle-btn' + (legendCube === id ? ' on' : '')}
                onClick={() => setLegendCube(id)}
              >
                {id === 'gold' ? '메멘토 골드' : '블랙'}
              </button>
            ))}
          </span>
        )}
        <span className="flame-toggle" title="목표 유효 줄 수">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              className={'flame-toggle-btn' + (targetLines === n ? ' on' : '')}
              onClick={() => setTargetLines(n)}
            >
              유효 {n}줄
            </button>
          ))}
        </span>
      </div>

      <p className="flame-intro">
        {cube.label} 기준으로{' '}
        <strong>
          {cube.potKind === 'main' ? '본잠' : '에디'}{' '}
          {cube.targetGrade === 'unique'
            ? '유니크'
            : cube.targetGrade === 'legendary'
              ? '레전드리'
              : '에픽'}
        </strong>{' '}
        장비만 분석합니다. 유효 옵션(
        <strong>
          {mode === 'legendary'
            ? '무기·보조 공%/보공/방무 · 엠블렘 공%/방무 · 방어구·장신 주스탯 · 장갑 크뎀 · 모자 쿨감'
            : `${mainLabel} 등 슬롯별 유효`}
        </strong>
        )이 목표(<strong>유효 {targetLines}줄</strong>
        {mode === 'legendary' ? ', 장갑·모자는 전용 1줄' : ''})에 도달할 때까지의 기대
        횟수입니다. 기대 횟수가 낮은 장비부터 작업하는 것이 효율적입니다.
      </p>

      {pending.length === 0 ? (
        <p className="flame-empty">
          {supported.length === 0
            ? '분석 대상 장비가 없습니다.'
            : '목표를 이미 달성한 장비만 있습니다.'}
        </p>
      ) : (
        <div className="flame-list">
          {pending.map((r, i) => (
            <CubeRow key={r.slot} rank={i + 1} r={r} onPick={onPick} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="flame-excluded">
          <button
            className="flame-excluded-toggle"
            onClick={() => setShowDone((v) => !v)}
          >
            목표 달성 {done.length}개 {showDone ? '접기' : '보기'}
          </button>
          {showDone && (
            <ul>
              {done.map((r) => (
                <li key={r.slot}>
                  <span>{r.name}</span>
                  <span className="flame-note">
                    유효 {r.usefulLines}/{r.targetLines}
                    {r.usefulLabels.length > 0 ? ` · ${r.usefulLabels.join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {excluded.length > 0 && (
        <div className="flame-excluded">
          <button
            className="flame-excluded-toggle"
            onClick={() => setShowExcluded((v) => !v)}
          >
            분석 제외 장비 {excluded.length}개 {showExcluded ? '접기' : '보기'}
          </button>
          {showExcluded && (
            <ul>
              {excluded.map((r) => (
                <li key={r.slot}>
                  <span>{r.name}</span>
                  <span className="flame-note">{r.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="flame-footnote">
        옵션·줄 등급 확률은{' '}
        <a href="https://www.mesu.live/calc/potential" target="_blank" rel="noreferrer">
          mesu.live
        </a>
        (넥슨 공개 확률 기반, 200제 스냅샷)를 사용합니다. 목표는 ‘유효로 분류한 옵션 n줄’이며,
        mesu에서 특정 옵션 세트를 지정한 경우와는 수치가 다를 수 있습니다. 쓸만한 스킬 등
        중복 제한·동일 결과 재롤은 근사(줄 독립)로 두었고, 등급업은 고려하지 않습니다.
      </p>
    </Section>
  );
}

function CubeRow({
  rank,
  r,
  onPick,
}: {
  rank: number;
  r: CubeAnalysis;
  onPick?(slot: string): void;
}) {
  const barPct =
    r.pReach > 0 ? Math.min(100, Math.round(Math.min(1, r.pReach) * 100)) : 0;
  return (
    <button className="flame-row" onClick={() => onPick?.(r.slot)}>
      <span className={'flame-rank' + (rank <= 3 ? ' top' : '')}>{rank}</span>
      {r.icon && <img src={r.icon} alt="" className="flame-icon" />}
      <span className="flame-name">
        <strong>{r.name}</strong>
        <span className="flame-slot">
          {r.slot}
          {r.usefulLabels.length > 0 ? ` · ${r.usefulLabels.join(', ')}` : ''}
        </span>
      </span>
      <span className="flame-metrics">
        <span className="flame-metric">
          <em>유효</em> {r.usefulLines}/{r.targetLines}줄
        </span>
        <span className="flame-metric">
          <em>달성 확률</em> {fmtPct(r.pReach)}
        </span>
        <span className="flame-metric strong">
          <em>기대</em> {fmtTries(r.expectedTries, r.done)}
        </span>
      </span>
      <span className="flame-bar">
        <span className="flame-bar-fill" style={{ width: `${barPct}%` }} />
      </span>
    </button>
  );
}
