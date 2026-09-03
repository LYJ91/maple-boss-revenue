import { weekKey } from "../lib/week";
import type { WeekRecord } from "../lib/history";
import { weekRangeLabel } from "../lib/history";
import { formatMeso } from "../lib/format";

export interface MonthlyBossOverview {
  monthLabel: string;
  completed: number;
  total: number;
  revenue: number;
  checking: number;
}

/** 보스수익 탭 하단의 주간 수익 기록 (이번 주 포함 최신순) */
export function RevenueHistory({
  records,
  monthly,
}: {
  records: WeekRecord[];
  monthly: MonthlyBossOverview;
}) {
  if (records.length === 0 && monthly.total === 0) return null;
  const currentWeek = weekKey("thu");

  return (
    <section className="history-panel">
      {monthly.total > 0 && (
        <div className="monthly-overview">
          <div className="monthly-overview-title">
            <span>월간 보스</span>
            <strong>{monthly.monthLabel} 진행 현황</strong>
          </div>
          <div className="monthly-overview-metrics">
            <span>
              <strong>
                {monthly.completed}/{monthly.total}
              </strong>
              <small>확인된 완료</small>
            </span>
            <span>
              <strong>{formatMeso(monthly.revenue)}</strong>
              <small>이번 달 결정 수익</small>
            </span>
          </div>
          {monthly.checking > 0 && (
            <span className="monthly-overview-checking">
              {monthly.checking}캐릭터 API 확인 중
            </span>
          )}
        </div>
      )}

      <div className="group-head">
        <h3>주간 수익 기록</h3>
        <span className="group-desc">
          목요일 리셋 기준 — 사이트에 접속하면 이번 주가 갱신되고, 미확정 지난
          주는 API로 한 번 확정됩니다. 월간 보스는 위 현황에서 별도로 집계합니다.
        </span>
      </div>
      <div className="history-rows">
        {records.map((r) => {
          const isCurrent = r.week === currentWeek;
          return (
            <div
              key={r.week}
              className={"history-row" + (isCurrent ? " current" : "")}
            >
              <span className="history-week">
                {weekRangeLabel(r.week)}
                {isCurrent && <em className="history-now">이번 주</em>}
                {!isCurrent && r.finalized && (
                  <em className="history-now">확정</em>
                )}
              </span>
              <span className="history-revenue">
                <strong>{formatMeso(r.revenue)}</strong> 메소
              </span>
              <span className="history-sub">
                결정 {r.crystals}개 · 캐릭터 {r.characterCount}개
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
