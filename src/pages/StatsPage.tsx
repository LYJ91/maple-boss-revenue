import { useMemo, useState } from "react";
import type { WeekRecord } from "../lib/history";
import { weekRangeLabel } from "../lib/history";
import { weekKey } from "../lib/week";
import { formatMeso } from "../lib/format";
import { gotoHome } from "../lib/router";
import { chartWindow, computeStatMetrics } from "../lib/stats";

type RangeKey = "4w" | "12w" | "52w";

const RANGE_LABEL: Record<RangeKey, string> = {
  "4w": "최근 4주",
  "12w": "최근 12주",
  "52w": "최근 52주",
};
const RANGE_SIZE: Record<RangeKey, number> = { "4w": 4, "12w": 12, "52w": 52 };

/** 주간 수익 히스토리 시각화 및 요약 통계 탭 */
export function StatsPage({ records }: { records: WeekRecord[] }) {
  const [range, setRange] = useState<RangeKey>("12w");
  const [showMonthly, setShowMonthly] = useState(false);
  const currentWeek = useMemo(() => weekKey("thu"), []);

  // 최신 순 정렬 후 range만큼 잘라 오래된 → 최신 순으로 뒤집는다
  const sortedDesc = useMemo(
    () => [...records].sort((a, b) => b.week.localeCompare(a.week)),
    [records],
  );
  const view = useMemo(
    () => chartWindow(sortedDesc, RANGE_SIZE[range]),
    [sortedDesc, range],
  );

  const metrics = useMemo(
    () => computeStatMetrics(sortedDesc, showMonthly),
    [sortedDesc, showMonthly],
  );

  if (records.length === 0) {
    return (
      <div className="empty-board">
        <h2>아직 수익 기록이 없어요</h2>
        <p>
          보스수익 탭에서 캐릭터의 보스를 설정하면 이번 주 수익이 자동으로
          기록되고,
          <br />이 화면에 주간 추이가 표시됩니다.
        </p>
        <button className="btn primary" onClick={gotoHome}>
          보스수익 탭으로 이동
        </button>
      </div>
    );
  }

  return (
    <div className="stats-page">
      <div className="stats-head">
        <div>
          <h2>수익 통계</h2>
          <p className="stats-sub">
            보스수익 탭에서 자동 기록된 주간 수익 데이터를 시각화합니다. 로그인한
            계정 기준이라 어느 기기에서든 동일하게 보입니다.
          </p>
        </div>
        <div className="stats-toolbar">
          <div className="range-buttons" role="tablist" aria-label="기간 선택">
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={range === key}
                className={"btn sm" + (range === key ? " primary" : " ghost")}
                onClick={() => setRange(key)}
              >
                {RANGE_LABEL[key]}
              </button>
            ))}
          </div>
          <label className="stats-toggle">
            <input
              type="checkbox"
              checked={showMonthly}
              onChange={(e) => setShowMonthly(e.target.checked)}
            />
            월간 보스 포함
          </label>
        </div>
      </div>

      <div className="stats-metrics">
        {metrics.map((m) => (
          <div key={m.label} className={"metric-card" + (m.tone ? " " + m.tone : "")}>
            <span className="metric-label">{m.label}</span>
            <strong className="metric-value">{m.value}</strong>
            {m.sub && <span className="metric-sub">{m.sub}</span>}
          </div>
        ))}
      </div>

      <RevenueChart data={view} showMonthly={showMonthly} currentWeek={currentWeek} />

      <BestWorst records={sortedDesc.slice(0, RANGE_SIZE[range])} showMonthly={showMonthly} />
    </div>
  );
}

/* ───── 차트 ───── */

const CHART_HEIGHT = 220;
const CHART_PAD_TOP = 14;
const CHART_PAD_BOTTOM = 30;
const CHART_PAD_LEFT = 8;
const CHART_PAD_RIGHT = 8;

function RevenueChart({
  data,
  showMonthly,
  currentWeek,
}: {
  data: WeekRecord[];
  showMonthly: boolean;
  currentWeek: string;
}) {
  if (data.length === 0) return null;

  const values = data.map((r) => r.revenue + (showMonthly ? r.monthlyBossRevenue : 0));
  const max = Math.max(1, ...values);
  const gridSteps = 4;

  // 반응형: SVG viewBox를 넓게 잡고, 바 너비를 균등 분할
  const width = Math.max(320, data.length * 44);
  const innerH = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const innerW = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const barWidth = Math.max(6, (innerW / data.length) * 0.66);

  const xFor = (i: number) =>
    CHART_PAD_LEFT + (innerW / data.length) * (i + 0.5);

  return (
    <div className="stats-chart-panel">
      <div className="stats-chart-scroll">
        <svg
          className="stats-chart"
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          role="img"
          aria-label="주간 수익 트렌드"
        >
          {/* 격자선 + 눈금 라벨 */}
          {Array.from({ length: gridSteps + 1 }).map((_, i) => {
            const y = CHART_PAD_TOP + (innerH / gridSteps) * i;
            const value = max * (1 - i / gridSteps);
            return (
              <g key={i}>
                <line
                  x1={CHART_PAD_LEFT}
                  x2={width - CHART_PAD_RIGHT}
                  y1={y}
                  y2={y}
                  className="stats-grid-line"
                />
                {i < gridSteps && (
                  <text
                    x={CHART_PAD_LEFT + 4}
                    y={y - 3}
                    className="stats-grid-label"
                  >
                    {abbreviateMeso(value)}
                  </text>
                )}
              </g>
            );
          })}

          {/* 주간 수익 바 (월간 보스 스택 시 아래) */}
          {data.map((r, i) => {
            const isCurrent = r.week === currentWeek;
            const weekly = r.revenue;
            const monthly = showMonthly ? r.monthlyBossRevenue : 0;
            const bottomY = CHART_PAD_TOP + innerH;
            const weeklyH = (weekly / max) * innerH;
            const monthlyH = (monthly / max) * innerH;
            const x = xFor(i) - barWidth / 2;
            return (
              <g key={r.week} className="stats-bar-group">
                {weekly > 0 && (
                  <rect
                    x={x}
                    y={bottomY - weeklyH}
                    width={barWidth}
                    height={weeklyH}
                    className={"stats-bar weekly" + (isCurrent ? " current" : "")}
                    rx="2"
                  />
                )}
                {monthly > 0 && (
                  <rect
                    x={x}
                    y={bottomY - weeklyH - monthlyH}
                    width={barWidth}
                    height={monthlyH}
                    className={"stats-bar monthly" + (isCurrent ? " current" : "")}
                    rx="2"
                  />
                )}
                <title>
                  {weekRangeLabel(r.week)}
                  {"\n"}주간 수익 {formatMeso(weekly)}
                  {monthly > 0 && `\n월간 보스 ${formatMeso(monthly)}`}
                  {"\n결정 " + r.crystals + "개 · 캐릭터 " + r.characterCount + "개"}
                </title>
              </g>
            );
          })}

          {/* X축 라벨: 시작·중간·끝 3개만 (혼잡 방지) */}
          {data.length > 0 &&
            [0, Math.floor(data.length / 2), data.length - 1]
              .filter((i, idx, arr) => arr.indexOf(i) === idx)
              .map((i) => {
                const label = shortWeekLabel(data[i].week);
                return (
                  <text
                    key={i}
                    x={xFor(i)}
                    y={CHART_HEIGHT - 8}
                    className="stats-x-label"
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                );
              })}
        </svg>
      </div>
      <div className="stats-legend">
        <span className="legend-chip weekly">주간 수익</span>
        {showMonthly && <span className="legend-chip monthly">월간 보스</span>}
        <span className="stats-hint">
          막대에 마우스를 올리면 해당 주 상세가 표시됩니다
        </span>
      </div>
    </div>
  );
}

/** "12/26" 같은 짧은 라벨 */
function shortWeekLabel(week: string): string {
  const [, m, d] = week.split("-").map(Number);
  return `${m}/${d}`;
}

/** "12.3억", "1.2조" 같은 축약 표기 (Y축 눈금용) */
function abbreviateMeso(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const JO = 1_0000_0000_0000;
  const EOK = 1_0000_0000;
  const MAN = 1_0000;
  if (n >= JO) return round1(n / JO) + "조";
  if (n >= EOK) return round1(n / EOK) + "억";
  if (n >= MAN) return round1(n / MAN) + "만";
  return String(Math.round(n));
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/* ───── 베스트 / 워스트 주 ───── */

function BestWorst({
  records,
  showMonthly,
}: {
  records: WeekRecord[];
  showMonthly: boolean;
}) {
  if (records.length === 0) return null;
  const value = (r: WeekRecord) =>
    r.revenue + (showMonthly ? r.monthlyBossRevenue : 0);
  const sorted = [...records].sort((a, b) => value(b) - value(a));
  const top = sorted.slice(0, 3);
  const bottom = sorted.slice(-3).reverse();
  return (
    <div className="stats-rank">
      <section>
        <h3>수익 상위 주</h3>
        <ol className="rank-list">
          {top.map((r) => (
            <li key={r.week}>
              <span className="rank-week">{weekRangeLabel(r.week)}</span>
              <strong>{formatMeso(value(r))}</strong>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3>수익 하위 주</h3>
        <ol className="rank-list">
          {bottom.map((r) => (
            <li key={r.week}>
              <span className="rank-week">{weekRangeLabel(r.week)}</span>
              <strong>{formatMeso(value(r))}</strong>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
