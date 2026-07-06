import type { DetailData } from '../../lib/nexon';
import { EmptyNote, partError, Section } from './shared';

export function CashTab({ data }: { data: DetailData }) {
  const cash = partError(data.cash) ? null : data.cash;
  const cashItems: any[] = cash?.cash_item_equipment_base ?? [];

  const beauty = partError(data.beauty) ? null : data.beauty;
  const android = partError(data.android) ? null : data.android;
  const pet = partError(data.pet) ? null : data.pet;

  const pets = [1, 2, 3]
    .map((n) => ({
      name: pet?.[`pet_${n}_name`],
      nickname: pet?.[`pet_${n}_nickname`],
      icon: pet?.[`pet_${n}_icon`] ?? pet?.[`pet_${n}_appearance_icon`],
    }))
    .filter((p) => p.name);

  return (
    <div className="tab-content">
      <Section title="캐시 장비 (코디)">
        {cashItems.length === 0 ? (
          <EmptyNote text="캐시 장비 정보가 없습니다." />
        ) : (
          <div className="cash-grid">
            {cashItems.map((c, i) => (
              <div key={i} className="cash-card" title={c.cash_item_name}>
                <img src={c.cash_item_icon} alt="" />
                <div className="cash-info">
                  <span className="cash-name">{c.cash_item_name}</span>
                  <span className="plain-sub">{c.cash_item_equipment_part}</span>
                  {c.cash_item_label && <span className="chip sm">{c.cash_item_label}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="two-col">
        <Section title="헤어 · 성형 · 피부">
          {!beauty ? (
            <EmptyNote text="정보가 없습니다." />
          ) : (
            <div className="plain-list">
              <div className="plain-row">
                <span>헤어</span>
                <span className="plain-sub">
                  {beauty.character_hair?.hair_name ?? '-'}
                  {beauty.character_hair?.mix_color &&
                    ` (${beauty.character_hair.base_color}+${beauty.character_hair.mix_color} ${beauty.character_hair.mix_rate}%)`}
                </span>
              </div>
              <div className="plain-row">
                <span>성형</span>
                <span className="plain-sub">
                  {beauty.character_face?.face_name ?? '-'}
                  {beauty.character_face?.mix_color &&
                    ` (${beauty.character_face.base_color}+${beauty.character_face.mix_color} ${beauty.character_face.mix_rate}%)`}
                </span>
              </div>
              <div className="plain-row">
                <span>피부</span>
                <span className="plain-sub">{beauty.character_skin?.skin_name ?? '-'}</span>
              </div>
            </div>
          )}
        </Section>

        <Section title="안드로이드 · 펫">
          <div className="plain-list">
            <div className="plain-row">
              <span>안드로이드</span>
              <span className="plain-sub">
                {android?.android_name
                  ? `${android.android_name} (${android.android_grade}등급)`
                  : '없음'}
              </span>
            </div>
            {pets.length === 0 ? (
              <div className="plain-row">
                <span>펫</span>
                <span className="plain-sub">없음</span>
              </div>
            ) : (
              pets.map((p, i) => (
                <div key={i} className="plain-row">
                  <span>펫 {i + 1}</span>
                  <span className="plain-sub pet-cell">
                    {p.icon && <img src={p.icon} alt="" className="pet-icon" />}
                    {p.name}
                    {p.nickname && p.nickname !== p.name && ` (${p.nickname})`}
                  </span>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
