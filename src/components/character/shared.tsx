/** 캐릭터 상세 페이지 공용 헬퍼 */

export type GradeKey = 'rare' | 'epic' | 'unique' | 'legendary';

export function gradeKey(grade: string | null | undefined): GradeKey | null {
  switch (grade) {
    case '레어':
      return 'rare';
    case '에픽':
      return 'epic';
    case '유니크':
      return 'unique';
    case '레전드리':
      return 'legendary';
    default:
      return null;
  }
}

export function GradeBadge({ grade, prefix }: { grade?: string | null; prefix?: string }) {
  const key = gradeKey(grade);
  if (!key) return null;
  return (
    <span className={`grade-badge ${key}`}>
      {prefix}
      {grade}
    </span>
  );
}

/** item_total_option 등 옵션 객체의 키 → 표시 라벨 */
const OPTION_LABEL: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  int: 'INT',
  luk: 'LUK',
  max_hp: '최대 HP',
  max_mp: '최대 MP',
  attack_power: '공격력',
  magic_power: '마력',
  armor: '방어력',
  speed: '이동속도',
  jump: '점프력',
  boss_damage: '보스 몬스터 데미지',
  ignore_monster_armor: '몬스터 방어율 무시',
  all_stat: '올스탯',
  damage: '데미지',
  max_hp_rate: '최대 HP',
  max_mp_rate: '최대 MP',
  base_equipment_level: '착용 레벨',
  equipment_level_decrease: '착용 레벨 감소',
  exceptional_upgrade: '익셉셔널 강화',
};

const PERCENT_KEYS = new Set([
  'boss_damage',
  'ignore_monster_armor',
  'all_stat',
  'damage',
  'max_hp_rate',
  'max_mp_rate',
]);

/** 옵션 객체를 "라벨 +값" 문자열 배열로 변환 (0/빈 값 제외) */
export function optionLines(option: Record<string, unknown> | null | undefined): string[] {
  if (!option) return [];
  const lines: string[] = [];
  for (const [key, raw] of Object.entries(option)) {
    if (key === 'base_equipment_level') continue;
    const label = OPTION_LABEL[key];
    if (!label) continue;
    const value = Number(raw);
    if (!value) continue;
    lines.push(`${label} +${value}${PERCENT_KEYS.has(key) ? '%' : ''}`);
  }
  return lines;
}

/** 파트 응답이 오류인지 확인 */
export function partError(data: unknown): string | null {
  if (data && typeof data === 'object' && 'error' in data) {
    return String((data as { error: unknown }).error);
  }
  return null;
}

export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="detail-section">
      <div className="detail-section-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyNote({ text }: { text: string }) {
  return <p className="empty-note">{text}</p>;
}
