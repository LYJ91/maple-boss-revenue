/**
 * 수익 통계 탭에서 사용하는 순수 계산 함수들.
 * (React 밖으로 뽑아 두어 유닛 테스트가 쉬워진다)
 */

import type { WeekRecord } from "./history";
import { weekRangeLabel } from "./history";
import { formatMeso } from "./format";

export interface StatMetric {
  /** 카드 상단 라벨 */
  label: string;
  /** 카드 본문 (포맷 완료된 문자열) */
  value: string;
  /** 부가 설명 (선택) */
  sub?: string;
  /** 상승/하락/보합 표기용 */
  tone?: "up" | "down" | "flat";
}

/**
 * 요약 지표 4종을 계산한다.
 * - 최근 4주 합계
 * - 직전 4주 대비 증감 %
 * - 최근 4주 평균 (주당)
 * - 최고 주 (전체 기록)
 *
 * @param sortedDesc 최신 주가 앞에 오도록 정렬된 WeekRecord 배열
 * @param includeMonthly 월간 보스 수익을 주간 값에 더할지 여부
 */
export function computeStatMetrics(
  sortedDesc: WeekRecord[],
  includeMonthly: boolean,
): StatMetric[] {
  const value = (r: WeekRecord) =>
    r.revenue + (includeMonthly ? r.monthlyBossRevenue : 0);

  const last4 = sortedDesc.slice(0, 4);
  const prev4 = sortedDesc.slice(4, 8);
  const sum = (rs: WeekRecord[]) => rs.reduce((s, r) => s + value(r), 0);
  const thisMonth = sum(last4);
  const lastMonth = sum(prev4);
  const growth =
    lastMonth === 0
      ? null
      : Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;

  const avg4 = last4.length > 0 ? Math.round(thisMonth / last4.length) : 0;
  const best =
    sortedDesc.length > 0
      ? sortedDesc.reduce((best, r) => (value(r) > value(best) ? r : best))
      : null;

  const metrics: StatMetric[] = [
    {
      label: "최근 4주 합계",
      value: formatMeso(thisMonth) + " 메소",
      sub: `${last4.length}주 기록`,
    },
    {
      label: "직전 4주 대비",
      value:
        growth == null
          ? "-"
          : (growth > 0 ? "+" : "") + growth.toFixed(1) + "%",
      sub:
        lastMonth > 0
          ? `직전 4주 ${formatMeso(lastMonth)} 메소`
          : "비교 기간 없음",
      tone:
        growth == null
          ? "flat"
          : growth > 0
            ? "up"
            : growth < 0
              ? "down"
              : "flat",
    },
    {
      label: "최근 4주 평균",
      value: formatMeso(avg4) + " 메소",
      sub: "주당 평균",
    },
  ];
  if (best) {
    metrics.push({
      label: "최고 주 (전체 기록)",
      value: formatMeso(value(best)) + " 메소",
      sub: weekRangeLabel(best.week),
    });
  }
  return metrics;
}

/**
 * 최신 순 → 오래된 순으로 뒤집어 차트에 넘길 데이터를 반환한다.
 * @param sortedDesc 최신 주가 앞에 오도록 정렬된 배열
 * @param size 잘라낼 최근 주 수 (예: 4/12/52)
 */
export function chartWindow<T>(sortedDesc: T[], size: number): T[] {
  return sortedDesc.slice(0, size).reverse();
}
