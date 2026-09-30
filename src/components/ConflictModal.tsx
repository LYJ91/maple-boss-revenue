import { BOSS_MAP, DIFFICULTY_LABEL, RULES } from '../data/crystalData';
import type { WeeklyConflict } from '../lib/bossConflict';
import { weekRangeLabel } from '../lib/history';

function bossLabel(bossId: string, difficulty: string): string {
  const name = BOSS_MAP.get(bossId)?.name ?? bossId;
  const label = DIFFICULTY_LABEL[difficulty as keyof typeof DIFFICULTY_LABEL];
  return label ? `${label} ${name}` : name;
}

export function ConflictModal({
  conflicts,
  week,
  onKeepManual,
  onAdoptApi,
  onKeepAll,
  onAdoptAll,
  onClose,
}: {
  conflicts: WeeklyConflict[];
  week: string;
  onKeepManual(characterId: string): void;
  onAdoptApi(characterId: string): void;
  onKeepAll(): void;
  onAdoptAll(): void;
  onClose(): void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal conflict-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>내 선택과 API가 다릅니다</h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="modal-sub">
          {weekRangeLabel(week)} 주차 · 캐릭터 {conflicts.length}명. 내 선택에만
          있는 보스를 어떻게 할지 고르세요. 선택한 결과가 저장되고, 이 주차에는
          다시 묻지 않습니다.
        </p>

        <div className="conflict-list">
          {conflicts.map((conflict) => (
            <div key={conflict.characterId} className="conflict-row">
              <div className="conflict-head">
                <strong>{conflict.characterName}</strong>
                <span className="conflict-counts">
                  내 선택 {conflict.selectedCount}개 · API {conflict.apiCount}개
                </span>
              </div>

              {conflict.manualOnly.length > 0 && (
                <div className="conflict-bosses">
                  <span className="conflict-tag">내 선택에만 있음</span>
                  <span className="conflict-boss-names">
                    {conflict.manualOnly
                      .map((entry) => bossLabel(entry.bossId, entry.difficulty))
                      .join(' · ')}
                  </span>
                </div>
              )}

              {conflict.overLimit && (
                <p className="notice warn conflict-note">
                  주간 보스 {conflict.selectedCount}개 —{' '}
                  {RULES.weeklyBossSellLimitPerCharacter}개를 넘어 가격 높은 순
                  {RULES.weeklyBossSellLimitPerCharacter}개만 집계됩니다.
                </p>
              )}

              <div className="conflict-actions">
                <button
                  className="btn primary sm"
                  onClick={() => onKeepManual(conflict.characterId)}
                >
                  {conflict.manualOnly.length > 0 ? '내 선택 유지' : '확인했음'}
                </button>
                {conflict.manualOnly.length > 0 && (
                  <button
                    className="btn ghost sm"
                    onClick={() => onAdoptApi(conflict.characterId)}
                  >
                    API로 맞춤 ({conflict.apiCount}개)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="conflict-bulk">
          <button className="btn primary" onClick={onKeepAll}>
            전부 내 선택 유지
          </button>
          <button className="btn ghost" onClick={onAdoptAll}>
            전부 API로 맞춤
          </button>
        </div>
      </div>
    </div>
  );
}
