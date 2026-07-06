import type { DetailData } from '../../lib/nexon';
import { EmptyNote, partError, Section } from './shared';

export function UnionTab({
  union,
  data,
}: {
  /** 요약 로딩 시 이미 받아둔 유니온 기본 정보 */
  union: DetailData | null;
  data: DetailData;
}) {
  const raider = partError(data['union-raider']) ? null : data['union-raider'];
  const artifact = partError(data['union-artifact']) ? null : data['union-artifact'];
  const champion = partError(data['union-champion']) ? null : data['union-champion'];

  const occupied: any[] = raider?.union_occupied_stat ?? [];
  const raiderStats: any[] = raider?.union_raider_stat ?? [];
  const artifactEffects: any[] = artifact?.union_artifact_effect ?? [];
  const champions: any[] = (champion?.union_champion ?? []).filter(
    (c: any) => c?.champion_name,
  );

  return (
    <div className="tab-content">
      <div className="union-summary">
        <div className="union-big">
          <span className="stat-label">유니온 레벨</span>
          <strong>{union?.union_level?.toLocaleString('ko-KR') ?? '-'}</strong>
          <span className="plain-sub">{union?.union_grade ?? ''}</span>
        </div>
        <div className="union-big">
          <span className="stat-label">아티팩트 레벨</span>
          <strong>{union?.union_artifact_level ?? '-'}</strong>
        </div>
      </div>

      <Section title="아티팩트 효과">
        {artifactEffects.length === 0 ? (
          <EmptyNote text="아티팩트 정보가 없습니다." />
        ) : (
          <div className="chip-wrap">
            {artifactEffects.map((e, i) => (
              <span key={i} className="chip">
                {e.name} (Lv.{e.level})
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="유니온 챔피언">
        {champions.length === 0 ? (
          <EmptyNote text="유니온 챔피언 정보가 없습니다." />
        ) : (
          <div className="champion-grid">
            {champions.map((c) => (
              <div key={c.champion_slot} className="champion-card">
                <div className="champion-head">
                  <strong>{c.champion_name}</strong>
                  <span className={'champ-grade g-' + String(c.champion_grade).toLowerCase()}>
                    {c.champion_grade}
                  </span>
                </div>
                <span className="plain-sub">{c.champion_class}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="two-col">
        <Section title="공격대 점령 효과">
          {occupied.length === 0 ? (
            <EmptyNote text="점령 효과 정보가 없습니다." />
          ) : (
            <div className="plain-list scroll">
              {occupied.map((s, i) => (
                <div key={i} className="plain-row">
                  {typeof s === 'string' ? s : s.stat}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="공격대원 효과">
          {raiderStats.length === 0 ? (
            <EmptyNote text="공격대원 효과 정보가 없습니다." />
          ) : (
            <div className="plain-list scroll">
              {raiderStats.map((s, i) => (
                <div key={i} className="plain-row">
                  {typeof s === 'string' ? s : s.stat}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
