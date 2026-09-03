import { useEffect, useMemo, useRef, useState } from "react";
import type { WeekRecord } from "../lib/history";
import { weekRangeLabel } from "../lib/history";
import { weekKey } from "../lib/week";
import { formatMeso } from "../lib/format";
import { gotoHome } from "../lib/router";
import {
  chartWindow,
  computeStatMetrics,
  niceChartMaximum,
} from "../lib/stats";
import {
  attributedWeekRevenue,
  monthlyBossDeltaByWeek,
} from "../lib/monthlyAttribution";

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
  const monthlyDelta = useMemo(
    () => monthlyBossDeltaByWeek(sortedDesc),
    [sortedDesc],
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
          사이트에 접속하면 이번 주 수익이 자동으로 기록되고,
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
            보스수익 탭에서 자동 기록된 주간 수익 데이터를 시각화합니다.
            로그인한 계정 기준이라 어느 기기에서든 동일하게 보입니다.
          </p>
        </div>
        <div className="stats-toolbar">
          <div className="stats-range" role="tablist" aria-label="기간 선택">
            {(Object.keys(RANGE_LABEL) as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={range === key}
                className={
                  "stats-range-btn" + (range === key ? " active" : "")
                }
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
            <span className="stats-toggle-track" aria-hidden="true">
              <span />
            </span>
            월간 수익 포함
          </label>
        </div>
      </div>

      <div className="stats-metrics">
        {metrics.map((m) => (
          <div
            key={m.label}
            className={"metric-card" + (m.tone ? " " + m.tone : "")}
          >
            <span className="metric-label">{m.label}</span>
            <strong className="metric-value">{m.value}</strong>
            {m.sub && <span className="metric-sub">{m.sub}</span>}
          </div>
        ))}
      </div>

      <RevenueChart
        data={view}
        monthlyDelta={monthlyDelta}
        showMonthly={showMonthly}
        currentWeek={currentWeek}
        rangeLabel={RANGE_LABEL[range]}
      />

      <BestWorst
        records={sortedDesc.slice(0, RANGE_SIZE[range])}
        monthlyDelta={monthlyDelta}
        showMonthly={showMonthly}
        currentWeek={currentWeek}
      />
    </div>
  );
}

/* ───── 차트 ───── */

const CHART_HEIGHT = 296;
const CHART_PAD_TOP = 24;
const CHART_PAD_BOTTOM = 42;
const CHART_PAD_LEFT = 64;
const CHART_PAD_RIGHT = 24;

function RevenueChart({
  data,
  monthlyDelta,
  showMonthly,
  currentWeek,
  rangeLabel,
}: {
  data: WeekRecord[];
  monthlyDelta: ReadonlyMap<string, number>;
  showMonthly: boolean;
  currentWeek: string;
  rangeLabel: string;
}) {
  const [activeWeek, setActiveWeek] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [data.length]);
  if (data.length === 0) return null;

  // 선 높이는 항상 주간 수익 기준으로 유지한다. 월간 수익은 보라 표식으로
  // 분리해 큰 월간 정산액이 주간 흐름을 납작하게 만들지 않게 한다.
  const values = data.map((record) => record.revenue);
  const hasRevenue = values.some((value) => value > 0);
  const max = niceChartMaximum(values);
  const gridSteps = 4;
  const pointGap = data.length > 24 ? 28 : data.length > 8 ? 52 : 120;
  const width = Math.max(
    640,
    CHART_PAD_LEFT +
      CHART_PAD_RIGHT +
      Math.max(1, data.length - 1) * pointGap,
  );
  const innerH = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const innerW = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const baselineY = CHART_PAD_TOP + innerH;
  const xFor = (index: number) =>
    data.length === 1
      ? CHART_PAD_LEFT + innerW / 2
      : CHART_PAD_LEFT + (innerW / (data.length - 1)) * index;
  const yFor = (value: number) =>
    CHART_PAD_TOP + innerH * (1 - Math.min(1, value / max));

  const points = data.map((record, index) => {
    const monthly = showMonthly ? (monthlyDelta.get(record.week) ?? 0) : 0;
    const total = record.revenue + monthly;
    return {
      record,
      weekly: record.revenue,
      monthly,
      total,
      x: xFor(index),
      y: yFor(record.revenue),
    };
  });
  const selectedIndex = activeWeek
    ? points.findIndex((point) => point.record.week === activeWeek)
    : -1;
  const activeIndex = selectedIndex >= 0 ? selectedIndex : points.length - 1;
  const active = points[activeIndex];
  const previous = activeIndex > 0 ? points[activeIndex - 1] : null;
  const trend =
    previous && previous.weekly > 0
      ? ((active.weekly - previous.weekly) / previous.weekly) * 100
      : null;
  const currentIndex = points.findIndex(
    (point) => point.record.week === currentWeek,
  );
  const settledPoints =
    currentIndex === points.length - 1 && points.length > 1
      ? points.slice(0, -1)
      : points;
  const linePath = settledPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${settledPoints[settledPoints.length - 1].x} ${baselineY} L ${settledPoints[0].x} ${baselineY} Z`;
  const labelStep = Math.max(1, Math.ceil(data.length / 7));
  const spansYears = new Set(data.map((record) => record.week.slice(0, 4)))
    .size > 1;
  const hitWidth =
    data.length === 1 ? innerW : Math.max(24, innerW / (data.length - 1));

  return (
    <div className="stats-chart-panel">
      <div className="stats-chart-head">
        <div>
          <span className="stats-chart-kicker">{rangeLabel}</span>
          <h3>주간 수익 흐름</h3>
        </div>
        <div className="stats-chart-active" aria-live="polite">
          <span>{weekRangeLabel(active.record.week)}</span>
          <strong>
            {formatMeso(active.total)}
            <small> 메소</small>
          </strong>
          <span
            className={
              "stats-chart-trend" +
              (trend == null
                ? ""
                : trend > 0
                  ? " up"
                  : trend < 0
                    ? " down"
                    : "")
            }
          >
            {active.record.week === currentWeek
              ? "이번 주 집계 중"
              : trend == null
                ? "이전 기록 없음"
                : `${trend > 0 ? "+" : ""}${trend.toFixed(1)}%`}
          </span>
        </div>
      </div>
      <div className="stats-chart-breakdown">
        <span>
          주간 <strong>{formatMeso(active.weekly)}</strong>
        </span>
        {active.monthly > 0 && (
          <span className="monthly">
            월간 반영 <strong>{formatMeso(active.monthly)}</strong>
          </span>
        )}
      </div>
      <div ref={scrollRef} className="stats-chart-scroll">
        <svg
          className="stats-chart"
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          style={{
            width: data.length <= 4 ? "100%" : `${width}px`,
            minWidth: "100%",
          }}
          role="img"
          aria-label={`${rangeLabel} 주간 수익 추이`}
        >
          <defs>
            <linearGradient
              id="stats-area-fill"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          <rect
            className="stats-plot-bg"
            x={CHART_PAD_LEFT}
            y={CHART_PAD_TOP}
            width={innerW}
            height={innerH}
            rx="8"
          />

          {Array.from({ length: gridSteps + 1 }).map((_, i) => {
            const y = CHART_PAD_TOP + (innerH / gridSteps) * i;
            const value = max * (1 - i / gridSteps);
            return (
              <g key={`grid-${i}`}>
                <line
                  x1={CHART_PAD_LEFT}
                  x2={width - CHART_PAD_RIGHT}
                  y1={y}
                  y2={y}
                  className="stats-grid-line"
                />
                <text
                  x={CHART_PAD_LEFT - 10}
                  y={y + 4}
                  className="stats-grid-label"
                  textAnchor="end"
                >
                  {hasRevenue
                    ? abbreviateMeso(value)
                    : i === gridSteps
                      ? "0"
                      : ""}
                </text>
              </g>
            );
          })}

          <path
            className="stats-area"
            d={areaPath}
            fill="url(#stats-area-fill)"
          />
          <path className="stats-line" d={linePath} />
          {currentIndex === points.length - 1 && points.length > 1 && (
            <line
              className="stats-current-link"
              x1={points[currentIndex - 1].x}
              y1={points[currentIndex - 1].y}
              x2={points[currentIndex].x}
              y2={points[currentIndex].y}
            />
          )}

          <line
            className="stats-active-guide"
            x1={active.x}
            x2={active.x}
            y1={CHART_PAD_TOP}
            y2={baselineY}
          />

          {points.map((point, index) => (
            <g key={`point-${point.record.week}`}>
              {point.monthly > 0 && (
                <circle
                  className="stats-monthly-halo"
                  cx={point.x}
                  cy={point.y}
                  r="8"
                />
              )}
              <circle
                className={
                  "stats-point" +
                  (point.record.week === currentWeek ? " current" : "") +
                  (index === activeIndex ? " active" : "")
                }
                cx={point.x}
                cy={point.y}
                r={index === activeIndex ? 5 : 3}
              />
            </g>
          ))}

          {points.map((point, index) =>
            index === 0 ||
            index === points.length - 1 ||
            index % labelStep === 0 ? (
              <text
                key={`label-${point.record.week}`}
                x={point.x}
                y={CHART_HEIGHT - 12}
                className={
                  "stats-x-label" +
                  (point.record.week === currentWeek ? " current" : "")
                }
                textAnchor="middle"
              >
                {shortWeekLabel(point.record.week, spansYears)}
              </text>
            ) : null,
          )}

          {points.map((point, index) => (
            <rect
              key={`hit-${point.record.week}`}
              className="stats-hit-area"
              x={
                points.length === 1
                  ? CHART_PAD_LEFT
                  : Math.max(
                      CHART_PAD_LEFT,
                      point.x - (index === 0 ? 0 : hitWidth / 2),
                    )
              }
              y={CHART_PAD_TOP}
              width={
                points.length === 1
                  ? innerW
                  : index === 0 || index === points.length - 1
                  ? hitWidth / 2
                  : hitWidth
              }
              height={innerH}
              tabIndex={0}
              role="button"
              aria-label={`${weekRangeLabel(point.record.week)} ${formatMeso(point.total)} 메소`}
              onMouseEnter={() => setActiveWeek(point.record.week)}
              onFocus={() => setActiveWeek(point.record.week)}
              onClick={() => setActiveWeek(point.record.week)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveWeek(point.record.week);
                }
              }}
            >
              <title>
                {weekRangeLabel(point.record.week)}
                {"\n"}주간 수익 {formatMeso(point.weekly)}
                {point.monthly > 0 &&
                  `\n월간 보스 증가분 ${formatMeso(point.monthly)}`}
              </title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="stats-legend">
        <span className="legend-chip weekly">주간 수익 흐름</span>
        {showMonthly && (
          <span className="legend-chip monthly">월간 보스 반영 주</span>
        )}
        {currentIndex >= 0 && (
          <span className="legend-chip current">이번 주 집계 중</span>
        )}
        <span className="stats-hint">
          포인트에 마우스를 올리거나 탭하면 상세가 바뀝니다
        </span>
      </div>
    </div>
  );
}

/** "12/26" 같은 짧은 라벨 */
function shortWeekLabel(week: string, includeYear = false): string {
  const [year, month, day] = week.split("-").map(Number);
  return includeYear
    ? `${String(year).slice(2)}.${month}/${day}`
    : `${month}/${day}`;
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
  monthlyDelta,
  showMonthly,
  currentWeek,
}: {
  records: WeekRecord[];
  monthlyDelta: ReadonlyMap<string, number>;
  showMonthly: boolean;
  currentWeek: string;
}) {
  const comparable = records.filter(
    (record) => record.week !== currentWeek || record.finalized,
  );
  if (comparable.length === 0) return null;
  const value = (r: WeekRecord) =>
    attributedWeekRevenue(r, monthlyDelta, showMonthly);
  const sorted = [...comparable].sort((a, b) => value(b) - value(a));
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
