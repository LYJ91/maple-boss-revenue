import type { DetailData } from '../../lib/nexon';
import { EmptyNote, partError, Section } from './shared';

const HEXA_MAX_LEVEL = 30;

export function SkillTab({ data }: { data: DetailData }) {
  const link = partError(data['link-skill']) ? null : data['link-skill'];
  const linkSkills: any[] = link?.character_link_skill ?? [];

  const hexa = partError(data.hexamatrix) ? null : data.hexamatrix;
  const hexaCores: any[] = hexa?.character_hexa_core_equipment ?? [];

  const hexaStat = partError(data['hexa-stat']) ? null : data['hexa-stat'];
  const hexaStatCores: any[] = [
    ...(hexaStat?.character_hexa_stat_core ?? []),
    ...(hexaStat?.character_hexa_stat_core_2 ?? []),
    ...(hexaStat?.character_hexa_stat_core_3 ?? []),
  ].filter((c: any) => c?.main_stat_name);

  const vmatrix = partError(data.vmatrix) ? null : data.vmatrix;
  const vCores: any[] = (vmatrix?.character_v_core_equipment ?? []).filter(
    (c: any) => c?.v_core_name,
  );

  const coreTypes = ['스킬 코어', '마스터리 코어', '강화 코어', '공용 코어'];

  return (
    <div className="tab-content">
      <Section title="HEXA 코어 (6차)">
        {hexaCores.length === 0 ? (
          <EmptyNote text="HEXA 코어 정보가 없습니다." />
        ) : (
          <div className="hexa-groups">
            {coreTypes.map((type) => {
              const cores = hexaCores.filter((c) => c.hexa_core_type === type);
              if (cores.length === 0) return null;
              return (
                <div key={type} className="hexa-group">
                  <h4>{type}</h4>
                  <div className="hexa-list">
                    {cores.map((c) => (
                      <div key={c.hexa_core_name} className="hexa-row">
                        <span className="hexa-name">{c.hexa_core_name}</span>
                        <div className="bar slim">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${(c.hexa_core_level / HEXA_MAX_LEVEL) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="hexa-level">Lv.{c.hexa_core_level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {hexaStatCores.length > 0 && (
        <Section title="HEXA 스탯">
          <div className="chip-wrap">
            {hexaStatCores.map((c, i) => (
              <span key={i} className="chip">
                {c.main_stat_name} Lv.{c.main_stat_level} · {c.sub_stat_name_1} Lv.
                {c.sub_stat_level_1} · {c.sub_stat_name_2} Lv.{c.sub_stat_level_2}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="링크 스킬">
        {linkSkills.length === 0 ? (
          <EmptyNote text="링크 스킬 정보가 없습니다." />
        ) : (
          <div className="link-grid">
            {linkSkills.map((s, i) => (
              <div key={i} className="link-card" title={s.skill_effect ?? ''}>
                {s.skill_icon && <img src={s.skill_icon} alt="" />}
                <div className="link-info">
                  <strong>{s.skill_name}</strong>
                  <span className="plain-sub">Lv.{s.skill_level}</span>
                  {s.skill_effect && <span className="link-effect">{s.skill_effect}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {vCores.length > 0 && (
        <Section title="V매트릭스 (5차)">
          <div className="chip-wrap">
            {vCores.map((c, i) => (
              <span
                key={i}
                className="chip"
                title={[c.v_core_skill_1, c.v_core_skill_2, c.v_core_skill_3]
                  .filter(Boolean)
                  .join(' / ')}
              >
                {c.v_core_name} Lv.{c.v_core_level + Number(c.slot_level ?? 0)}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
