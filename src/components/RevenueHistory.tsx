import { weekKey } from "../lib/week";
import type { WeekRecord } from "../lib/history";
import { weekRangeLabel } from "../lib/history";
import { formatMeso } from "../lib/format";

/** 보스수익 탭 하단의 주간 수익 기록 (이번 주 포함 최신순) */
export function RevenueHistory({ records }: { records: WeekRecord[] }) {
  if (records.length === 0) return null;
  const currentWeek = weekKey("thu");

  return (
    <section className="history-panel">
      <div className="group-head">
        <h3>주간 수익 기록</h3>
        <span className="group-desc">
          목요일 리셋 기준 — 사이트에 접속하면 이번 주가 갱신되고, 미확정 지난
          주는 API로 한 번 확정된 뒤 더 이상 다시 조회하지 않습니다.
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
                {r.monthlyBossRevenue > 0 &&
                  ` · 월간 보스 +${formatMeso(r.monthlyBossRevenue)}`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
