import type { Character } from '../types';
import type { CharacterSummary } from '../lib/calc';
import { BOSSES, RULES } from '../data/crystalData';
import { formatMeso } from '../lib/format';
import { CharacterAvatar } from './CharacterAvatar';

export type MonthlySyncStatus = 'manual' | 'ready' | 'checking';

interface Props {
  characters: Character[];
  summaries: CharacterSummary[];
  monthlySyncStatus: Record<string, MonthlySyncStatus>;
  selectedId: string | null;
  onAdd(): void;
  onImport(): void;
  onSelect(id: string): void;
  onRemove(id: string): void;
  onDuplicate(id: string): void;
}

export function CharacterSidebar({
  characters,
  summaries,
  monthlySyncStatus,
  selectedId,
  onAdd,
  onImport,
  onSelect,
  onRemove,
  onDuplicate,
}: Props) {
  const summaryMap = new Map(summaries.map((s) => [s.id, s]));
  const full = characters.length >= RULES.maxCharacters;
  const monthlyBossTotal = BOSSES.filter(
    (boss) => boss.reset === 'monthly',
  ).length;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>
          캐릭터 목록{' '}
          <span className="count">
            {characters.length}/{RULES.maxCharacters}
          </span>
        </h2>
        <span className="sidebar-actions">
          <button className="btn sm" onClick={onImport} disabled={full}>
            불러오기
          </button>
          <button className="btn primary sm" onClick={onAdd} disabled={full}>
            + 추가
          </button>
        </span>
      </div>

      <div className="character-list">
        {characters.length === 0 && (
          <p className="sidebar-empty">
            캐릭터를 추가하면
            <br />
            보스별 수익 설정이 시작됩니다.
          </p>
        )}
        {characters.map((character) => {
          const s = summaryMap.get(character.id);
          const over12 =
            (s?.weeklyBossSelected ?? 0) > RULES.weeklyBossSellLimitPerCharacter;
          const monthlySelected = s?.monthlyBossSelected ?? 0;
          const monthlyChecking =
            monthlySyncStatus[character.id] === 'checking';
          return (
            <div
              key={character.id}
              role="button"
              tabIndex={0}
              className={
                'character-card' + (character.id === selectedId ? ' selected' : '')
              }
              onClick={() => onSelect(character.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(character.id);
              }}
            >
              <div className="character-top">
                <span className="character-name">
                  {character.meta?.image && (
                    <CharacterAvatar src={character.meta.image} size={32} />
                  )}
                  {character.name}
                  {character.meta?.level != null && (
                    <span className="character-level"> Lv.{character.meta.level}</span>
                  )}
                </span>
                <span className="character-actions">
                  <button
                    className="icon-btn"
                    title="캐릭터 복제"
                    disabled={full}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(character.id);
                    }}
                  >
                    복제
                  </button>
                  <button
                    className="icon-btn danger"
                    title="캐릭터 삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(character.id);
                    }}
                  >
                    삭제
                  </button>
                </span>
              </div>
              <div className="character-revenue">
                {formatMeso(s?.weeklyRevenue ?? 0)}
                <span className="unit"> 메소/주</span>
              </div>
              <div className="character-chips">
                <span className="chip">결정 {s?.weeklyCrystalCount ?? 0}개</span>
                <span className={'chip' + (over12 ? ' warn' : '')}>
                  주간 보스 {s?.weeklyBossSelected ?? 0}/
                  {RULES.weeklyBossSellLimitPerCharacter}
                </span>
                {monthlyBossTotal > 0 && (
                  <span
                    className={
                      'chip monthly-progress' +
                      (monthlySelected >= monthlyBossTotal ? ' done' : '') +
                      (monthlyChecking ? ' checking' : '')
                    }
                  >
                    {monthlyChecking
                      ? '월간 보스 확인 중'
                      : `월간 보스 ${monthlySelected}/${monthlyBossTotal}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
