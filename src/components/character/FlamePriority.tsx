import { useMemo, useState } from 'react';
import { FLAME_TYPES, jobProfile } from '../../data/flameData';
import { analyzeFlames, type FlameAnalysis, type FlameItemInput } from '../../lib/flame';
import { Section } from './shared';

/** EquipmentTab의 Equip에서 분석에 필요한 최소 형태 */
export interface FlameEquipLike {
  item_equipment_slot: string;
  item_name: string;
  item_icon: string;
  item_add_option: Record<string, unknown>;
  item_base_option?: Record<string, unknown>;
}

const fmtScore = (n: number) =>
  n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

const fmtPct = (p: number) => {
  if (p <= 0) return '0%';
  const pct = p * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
};

const fmtTries = (t: number) => {
  if (!Number.isFinite(t)) return '개선 불가';
  if (t >= 10) return `약 ${Math.round(t).toLocaleString('ko-KR')}회`;
  return `약 ${t.toFixed(1)}회`;
};

export function FlamePriority({
  equips,
  job,
  finalStats,
  onPick,
}: {
  equips: FlameEquipLike[];
  job?: string;
  finalStats?: { str?: number; dex?: number; int?: number; luk?: number };
  onPick?(slot: string): void;
}) {
  const [flameId, setFlameId] = useState<'black' | 'abyss'>('black');
  const [showExcluded, setShowExcluded] = useState(false);

  // finalStats는 부모에서 인라인 객체로 내려와 참조가 매번 바뀌므로 값 단위로 의존
  const profile = useMemo(
    () => jobProfile(job, finalStats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job, finalStats?.str, finalStats?.dex, finalStats?.int, finalStats?.luk],
  );
  const flame = FLAME_TYPES.find((f) => f.id === flameId)!;

  const results = useMemo(() => {
    const inputs: FlameItemInput[] = equips.map((eq) => ({
      slot: eq.item_equipment_slot,
      name: eq.item_name,
      icon: eq.item_icon,
      addOption: eq.item_add_option,
      baseOption: eq.item_base_option,
    }));
    return analyzeFlames(inputs, profile, flame, job);
  }, [equips, profile, flame, job]);

  const supported = results.filter((r) => r.supported);
  const excluded = results.filter((r) => !r.supported);

  if (equips.length === 0) return null;

  const mainLabel = profile.useHp
    ? 'MaxHP·공격력'
    : profile.main.map((s) => s.toUpperCase()).join('·');

  return (
    <Section
      title="추옵 강화 우선순위"
      aside={
        <span className="flame-toggle">
          {FLAME_TYPES.map((f) => (
            <button
              key={f.id}
              className={'flame-toggle-btn' + (flameId === f.id ? ' on' : '')}
              onClick={() => setFlameId(f.id)}
            >
              {f.label.replace(' 환생의 불꽃', '환불')}
            </button>
          ))}
        </span>
      }
    >
      <p className="flame-intro">
        유효 옵션(<strong>{mainLabel}</strong> 기준 환산)으로 현재 추옵을 점수화하고,{' '}
        {flame.label} 1회로 <strong>지금보다 좋아질 확률</strong>과 기대 재설정 횟수를
        계산했습니다. 기대 횟수가 낮은 장비부터 작업하는 것이 효율적입니다.
      </p>

      {supported.length === 0 ? (
        <p className="flame-empty">분석 가능한 장비가 없습니다.</p>
      ) : (
        <div className="flame-list">
          {supported.map((r, i) => (
            <FlameRow key={r.slot} rank={i + 1} r={r} onPick={onPick} />
          ))}
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
        보스 전리품 장비(추옵 4줄 · 3~7단계) 기준의 근사치입니다. 환산 가중치(공마 1당
        주스탯 4, 올스탯 1%당 10 등)는 스펙에 따라 달라질 수 있으며, 일반(비보스)
        장비·제로 무기는 지원하지 않습니다. 2026.3.19 이후 인게임 메소 재설정에도 동일한
        확률이 적용되는지는 넥슨 공개 자료 기준으로 확인이 필요합니다.
      </p>
    </Section>
  );
}

function FlameRow({
  rank,
  r,
  onPick,
}: {
  rank: number;
  r: FlameAnalysis;
  onPick?(slot: string): void;
}) {
  const barPct = Math.min(100, Math.round(r.pImprove * 100));
  return (
    <button className="flame-row" onClick={() => onPick?.(r.slot)}>
      <span className={'flame-rank' + (rank <= 3 ? ' top' : '')}>{rank}</span>
      {r.icon && <img src={r.icon} alt="" className="flame-icon" />}
      <span className="flame-name">
        <strong>{r.name}</strong>
        <span className="flame-slot">
          {r.slot} · Lv.{r.itemLevel}
        </span>
      </span>
      <span className="flame-metrics">
        <span className="flame-metric">
          <em>현재</em> {fmtScore(r.currentScore)}점
          <i className="flame-max"> / 최대 {fmtScore(r.maxScore)}점</i>
        </span>
        <span className="flame-metric">
          <em>개선 확률</em> {fmtPct(r.pImprove)}
        </span>
        <span className="flame-metric strong">
          <em>기대</em> {fmtTries(r.expectedTries)}
        </span>
      </span>
      <span className="flame-bar">
        <span className="flame-bar-fill" style={{ width: `${barPct}%` }} />
      </span>
    </button>
  );
}
