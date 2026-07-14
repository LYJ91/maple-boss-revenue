import { useState } from 'react';
import type { DetailData } from '../../lib/nexon';
import { EmptyNote, GradeBadge, gradeKey, optionLines, partError, Section } from './shared';
import { FlamePriority } from './FlamePriority';

interface Equip {
  item_equipment_part: string;
  item_equipment_slot: string;
  item_name: string;
  item_icon: string;
  starforce: string | number;
  scroll_upgrade: string | number;
  potential_option_grade: string | null;
  additional_potential_option_grade: string | null;
  potential_option_1: string | null;
  potential_option_2: string | null;
  potential_option_3: string | null;
  additional_potential_option_1: string | null;
  additional_potential_option_2: string | null;
  additional_potential_option_3: string | null;
  item_total_option: Record<string, unknown>;
  item_add_option: Record<string, unknown>;
  item_base_option?: Record<string, unknown>;
  item_etc_option: Record<string, unknown>;
  item_starforce_option: Record<string, unknown>;
  soul_name: string | null;
  soul_option: string | null;
}

interface Symbol_ {
  symbol_name: string;
  symbol_icon: string;
  symbol_level: number;
  symbol_force: string | number;
  symbol_growth_count: number;
  symbol_require_growth_count: number;
}

export function EquipmentTab({
  data,
  job,
  finalStats,
}: {
  data: DetailData;
  job?: string;
  finalStats?: { str?: number; dex?: number; int?: number; luk?: number };
}) {
  const [selected, setSelected] = useState<Equip | null>(null);

  const itemErr = partError(data.item);
  const equips: Equip[] = itemErr ? [] : (data.item?.item_equipment ?? []);
  const title = itemErr ? null : data.item?.title;
  const symbols: Symbol_[] = partError(data.symbol) ? [] : (data.symbol?.symbol ?? []);
  const sets: any[] = partError(data['set-effect'])
    ? []
    : (data['set-effect']?.set_effect ?? []);

  const arcane = symbols.filter((s) => s.symbol_name.startsWith('아케인'));
  const authentic = symbols.filter((s) => !s.symbol_name.startsWith('아케인'));

  return (
    <div className="tab-content">
      <Section title="장착 장비" aside={itemErr && <span className="part-err">{itemErr}</span>}>
        {equips.length === 0 ? (
          <EmptyNote text="장비 정보가 없습니다." />
        ) : (
          <div className="equip-layout">
            <div className="equip-grid">
              {equips.map((eq, i) => {
                const potKey = gradeKey(eq.potential_option_grade);
                const star = Number(eq.starforce);
                return (
                  <button
                    key={`${eq.item_equipment_slot}-${i}`}
                    className={
                      'equip-card' +
                      (selected === eq ? ' selected' : '') +
                      (potKey ? ` pot-${potKey}` : '')
                    }
                    onClick={() => setSelected(selected === eq ? null : eq)}
                  >
                    <img src={eq.item_icon} alt="" className="equip-icon" />
                    <span className="equip-slot">{eq.item_equipment_slot}</span>
                    {star > 0 && <span className="equip-star">★{star}</span>}
                  </button>
                );
              })}
            </div>
            {selected ? (
              <EquipDetail equip={selected} />
            ) : (
              <div className="equip-detail placeholder">
                <p>장비를 클릭하면 상세 옵션이 표시됩니다.</p>
                {title && (
                  <p className="title-line">
                    칭호: <strong>{title.title_name}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {equips.length > 0 && (
        <FlamePriority
          equips={equips}
          job={job}
          finalStats={finalStats}
          onPick={(slot) => {
            const eq = equips.find((e) => e.item_equipment_slot === slot);
            if (eq) setSelected(eq);
          }}
        />
      )}

      <div className="two-col">
        <Section title="심볼">
          {symbols.length === 0 ? (
            <EmptyNote text="심볼 정보가 없습니다." />
          ) : (
            <>
              <SymbolGroup label="아케인심볼" list={arcane} />
              <SymbolGroup label="어센틱심볼" list={authentic} />
            </>
          )}
        </Section>

        <Section title="세트 효과">
          {sets.length === 0 ? (
            <EmptyNote text="적용 중인 세트 효과가 없습니다." />
          ) : (
            <div className="set-list">
              {sets.map((s) => (
                <div key={s.set_name} className="set-row">
                  <span className="set-name">{s.set_name}</span>
                  <span className="set-count">{s.total_set_count}세트</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function SymbolGroup({ label, list }: { label: string; list: Symbol_[] }) {
  if (list.length === 0) return null;
  return (
    <div className="symbol-group">
      <h4>{label}</h4>
      <div className="symbol-grid">
        {list.map((s) => (
          <div key={s.symbol_name} className="symbol-cell" title={s.symbol_name}>
            <img src={s.symbol_icon} alt={s.symbol_name} />
            <span>Lv.{s.symbol_level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquipDetail({ equip }: { equip: Equip }) {
  const potKey = gradeKey(equip.potential_option_grade);
  const star = Number(equip.starforce);
  const scroll = Number(equip.scroll_upgrade);
  const potentials = [
    equip.potential_option_1,
    equip.potential_option_2,
    equip.potential_option_3,
  ].filter(Boolean);
  const additionals = [
    equip.additional_potential_option_1,
    equip.additional_potential_option_2,
    equip.additional_potential_option_3,
  ].filter(Boolean);

  return (
    <div className="equip-detail">
      <div className="equip-detail-head">
        <img src={equip.item_icon} alt="" />
        <div>
          <strong className={potKey ? `text-${potKey}` : undefined}>
            {equip.item_name}
          </strong>
          <div className="equip-detail-sub">
            {equip.item_equipment_part}
            {star > 0 && ` · ★${star}`}
            {scroll > 0 && ` · ${scroll}작`}
          </div>
        </div>
      </div>

      {potentials.length > 0 && (
        <div className="option-block">
          <div className="option-title">
            잠재옵션 <GradeBadge grade={equip.potential_option_grade} />
          </div>
          {potentials.map((p, i) => (
            <div key={i} className="option-line">
              {p}
            </div>
          ))}
        </div>
      )}

      {additionals.length > 0 && (
        <div className="option-block">
          <div className="option-title">
            에디셔널 잠재 <GradeBadge grade={equip.additional_potential_option_grade} />
          </div>
          {additionals.map((p, i) => (
            <div key={i} className="option-line">
              {p}
            </div>
          ))}
        </div>
      )}

      {optionLines(equip.item_total_option).length > 0 && (
        <div className="option-block">
          <div className="option-title">총 옵션</div>
          {optionLines(equip.item_total_option).map((line) => (
            <div key={line} className="option-line dim">
              {line}
            </div>
          ))}
        </div>
      )}

      {equip.soul_name && (
        <div className="option-block">
          <div className="option-title">소울</div>
          <div className="option-line">
            {equip.soul_name} — {equip.soul_option}
          </div>
        </div>
      )}
    </div>
  );
}
