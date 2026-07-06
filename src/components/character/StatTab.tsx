import type { DetailData } from '../../lib/nexon';
import { EmptyNote, GradeBadge, partError, Section } from './shared';

interface FinalStat {
  stat_name: string;
  stat_value: string;
}

const NUMBER_STATS = new Set([
  '전투력',
  '최소 스탯공격력',
  '최대 스탯공격력',
  'HP',
  'MP',
  'STR',
  'DEX',
  'INT',
  'LUK',
  '공격력',
  '마력',
]);

function formatStatValue(name: string, value: string): string {
  const n = Number(value);
  if (NUMBER_STATS.has(name) && Number.isFinite(n)) {
    return n.toLocaleString('ko-KR');
  }
  return value;
}

const PROPENSITY_LABEL: Record<string, string> = {
  charisma_level: '카리스마',
  sensibility_level: '감성',
  insight_level: '통찰력',
  willingness_level: '의지',
  handicraft_level: '손재주',
  charm_level: '매력',
};

export function StatTab({
  stat,
  data,
}: {
  /** 요약 로딩 시 이미 받아둔 종합 능력치 */
  stat: DetailData | null;
  data: DetailData;
}) {
  const finalStats: FinalStat[] = stat?.final_stat ?? [];

  const hyper = partError(data['hyper-stat']) ? null : data['hyper-stat'];
  const presetNo = hyper?.use_preset_no ?? '1';
  const hyperList: any[] = (hyper?.[`hyper_stat_preset_${presetNo}`] ?? []).filter(
    (h: any) => h.stat_level > 0,
  );

  const ability = partError(data.ability) ? null : data.ability;
  const abilityList: any[] = ability?.ability_info ?? [];

  const propensity = partError(data.propensity) ? null : data.propensity;

  return (
    <div className="tab-content">
      <Section title="종합 능력치">
        {finalStats.length === 0 ? (
          <EmptyNote text="능력치 정보가 없습니다." />
        ) : (
          <div className="stat-grid">
            {finalStats.map((s) => (
              <div key={s.stat_name} className="stat-cell">
                <span className="stat-cell-name">{s.stat_name}</span>
                <span className="stat-cell-value">
                  {formatStatValue(s.stat_name, s.stat_value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="two-col">
        <Section title={`하이퍼스탯 (프리셋 ${presetNo})`}>
          {hyperList.length === 0 ? (
            <EmptyNote text="설정된 하이퍼스탯이 없습니다." />
          ) : (
            <div className="plain-list">
              {hyperList.map((h) => (
                <div key={h.stat_type} className="plain-row">
                  <span>{h.stat_type}</span>
                  <span className="plain-sub">
                    Lv.{h.stat_level} — {h.stat_increase}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="어빌리티"
          aside={ability && <GradeBadge grade={ability.ability_grade} />}
        >
          {abilityList.length === 0 ? (
            <EmptyNote text="어빌리티 정보가 없습니다." />
          ) : (
            <div className="plain-list">
              {abilityList.map((a) => (
                <div key={a.ability_no} className="plain-row">
                  <GradeBadge grade={a.ability_grade} />
                  <span className="ability-text">{a.ability_value}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="성향">
        {!propensity ? (
          <EmptyNote text="성향 정보가 없습니다." />
        ) : (
          <div className="propensity-grid">
            {Object.entries(PROPENSITY_LABEL).map(([key, label]) => {
              const level = Number(propensity[key] ?? 0);
              return (
                <div key={key} className="propensity-cell">
                  <div className="propensity-head">
                    <span>{label}</span>
                    <span className="plain-sub">Lv.{level}</span>
                  </div>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${level}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
