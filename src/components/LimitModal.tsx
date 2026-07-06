import { RULES } from '../data/crystalData';

export function LimitModal({ onClose }: { onClose(): void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal compact"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="limit-icon" aria-hidden="true">
          !
        </div>
        <h2 className="limit-title">주간 보스를 더 선택할 수 없습니다</h2>
        <p className="limit-body">
          주간 보스는 캐릭터당 최대{' '}
          <strong>{RULES.weeklyBossSellLimitPerCharacter}개</strong>까지만 처치할 수
          있습니다.
          <br />
          다른 보스를 추가하려면 선택된 주간 보스를 먼저 해제해주세요.
        </p>
        <button className="btn primary limit-confirm" onClick={onClose} autoFocus>
          확인
        </button>
      </div>
    </div>
  );
}
