import type { AccountSummary } from '../lib/calc';
import { RULES } from '../data/crystalData';
import { formatFull, formatMeso } from '../lib/format';

export function SummaryBar({ summary }: { summary: AccountSummary }) {
  // 90개 제한은 계정×월드 그룹마다 각각 적용되므로 전체 용량은 그룹 수 × 90
  const capacity = summary.capGroups * RULES.worldWeeklySellLimit;
  const capPct = Math.min(100, (summary.weeklyCrystalCount / capacity) * 100);
  const overCap = summary.weeklyLostToWorldCap > 0;

  return (
    <section className="summary">
      <div className="stat-card accent">
        <span className="stat-label">주간 수익</span>
        <strong className="stat-value">
          {formatMeso(summary.weeklyRevenue)}
          <span className="unit"> 메소</span>
        </strong>
        <span className="stat-sub">{formatFull(summary.weeklyRevenue)} 메소</span>
        {summary.weeklyLostToWorldCap > 0 && (
          <span className="stat-warn">
            판매 제한으로 {formatMeso(summary.weeklyLostToWorldCap)} 메소 제외됨
          </span>
        )}
      </div>

      <div className="stat-card">
        <span className="stat-label">월간 수익 (+ 월간 보스)</span>
        <strong className="stat-value">
          {formatMeso(summary.monthlyRevenue)}
          <span className="unit"> 메소</span>
        </strong>
        <span className="stat-sub">
          주간 × {RULES.weeksPerMonth} + 월간 보스 {formatMeso(summary.monthlyBossRevenue)} 메소
        </span>
      </div>

      <div className="stat-card">
        <span className="stat-label">주간 판매 결정</span>
        <strong className="stat-value">
          {summary.weeklyCrystalCount}
          <span className="unit"> / {capacity}개</span>
        </strong>
        <div className="cap-bar">
          <div
            className={'cap-fill' + (overCap ? ' over' : '')}
            style={{ width: `${capPct}%` }}
          />
        </div>
        {overCap ? (
          <span className="stat-warn">
            결정 {summary.weeklyCrystalTotal}개 생산 — 계정×월드당 가격 높은 순{' '}
            {RULES.worldWeeklySellLimit}개만 판매 가능
          </span>
        ) : (
          <span className="stat-sub">
            계정×월드당 주 {RULES.worldWeeklySellLimit}개 판매 제한
            {summary.capGroups > 1 && ` (${summary.capGroups}개 그룹)`}
          </span>
        )}
      </div>
    </section>
  );
}
