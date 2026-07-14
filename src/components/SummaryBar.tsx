import type { AccountSummary, CapGroupSummary } from '../lib/calc';
import { RULES } from '../data/crystalData';
import { formatFull, formatMeso } from '../lib/format';

/** 그룹 표시명: 계정 이름 우선, 같은 계정에 월드가 여럿이면 월드를 덧붙인다 */
function groupLabel(
  group: CapGroupSummary,
  groups: CapGroupSummary[],
  accountLabels: ReadonlyMap<string, string>,
): string {
  const accountName = group.accountId
    ? (accountLabels.get(group.accountId) ?? '삭제된 계정')
    : group.world || '기타';
  const multiWorld =
    groups.filter((g) => g.accountId === group.accountId).length > 1;
  return group.accountId && multiWorld && group.world
    ? `${accountName}·${group.world}`
    : accountName;
}

export function SummaryBar({
  summary,
  accountLabels,
}: {
  summary: AccountSummary;
  accountLabels: ReadonlyMap<string, string>;
}) {
  // 90개 제한은 계정×월드 그룹마다 각각 적용되므로 전체 용량은 그룹 수 × 90
  const capacity = summary.capGroups * RULES.worldWeeklySellLimit;
  const capPct = Math.min(100, (summary.weeklyCrystalCount / capacity) * 100);
  const overCap = summary.weeklyLostToWorldCap > 0;
  const showGroups = summary.groups.length > 1;

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
        {showGroups && (
          <div className="cap-groups">
            {summary.groups.map((g) => {
              const over = g.produced > RULES.worldWeeklySellLimit;
              return (
                <span
                  key={`${g.accountId}:${g.world}`}
                  className={'chip cap-group-chip' + (over ? ' warn' : '')}
                  title={
                    over
                      ? `${g.produced}개 생산 — 가격 높은 순 ${RULES.worldWeeklySellLimit}개만 판매 집계`
                      : undefined
                  }
                >
                  {g.sold}/{RULES.worldWeeklySellLimit} (
                  {groupLabel(g, summary.groups, accountLabels)})
                </span>
              );
            })}
          </div>
        )}
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
