import { describe, expect, it } from "vitest";
import type { WeekRecord } from "./history";
import { chartWindow, computeStatMetrics } from "./stats";

function rec(week: string, revenue: number, monthly = 0): WeekRecord {
  return {
    week,
    revenue,
    crystals: 12,
    monthlyBossRevenue: monthly,
    characterCount: 5,
    updatedAt: `${week}T00:00:00.000Z`,
  };
}

describe("computeStatMetrics", () => {
  it("최근 4주 합계·직전 4주 대비 증감·평균·최고 주를 계산한다", () => {
    // 최신 → 오래된 순
    const sortedDesc: WeekRecord[] = [
      rec("2026-07-16", 10_000_000),
      rec("2026-07-09", 20_000_000),
      rec("2026-07-02", 30_000_000),
      rec("2026-06-25", 40_000_000), // last4 합 = 1억
      rec("2026-06-18", 5_000_000),
      rec("2026-06-11", 5_000_000),
      rec("2026-06-04", 5_000_000),
      rec("2026-05-28", 5_000_000), // prev4 합 = 2000만
    ];
    const metrics = computeStatMetrics(sortedDesc, false);
    expect(metrics).toHaveLength(4);
    expect(metrics[0].label).toBe("최근 4주 합계");
    expect(metrics[0].value.startsWith("1억 ")).toBe(true);
    // 증감: (100_000_000 - 20_000_000) / 20_000_000 = 400%
    expect(metrics[1].tone).toBe("up");
    expect(metrics[1].value).toBe("+400.0%");
    // 평균 = 2500만
    expect(metrics[2].label).toBe("최근 4주 평균");
    expect(metrics[2].value.startsWith("2,500만")).toBe(true);
    // 최고 주 = 4000만
    expect(metrics[3].label).toBe("최고 주 (전체 기록)");
    expect(metrics[3].value.startsWith("4,000만")).toBe(true);
  });

  it("직전 4주 데이터가 없으면 증감 표시는 '-' 이고 tone은 flat", () => {
    const sortedDesc: WeekRecord[] = [rec("2026-07-16", 10_000_000)];
    const metrics = computeStatMetrics(sortedDesc, false);
    expect(metrics[1].value).toBe("-");
    expect(metrics[1].tone).toBe("flat");
  });

  it("월간 보스 포함 옵션을 켜면 그 값이 합산돼 지표가 커진다", () => {
    const sortedDesc: WeekRecord[] = [
      rec("2026-07-16", 10_000_000, 5_000_000),
      rec("2026-07-09", 10_000_000, 5_000_000),
      rec("2026-07-02", 10_000_000, 5_000_000),
      rec("2026-06-25", 10_000_000, 5_000_000),
    ];
    const off = computeStatMetrics(sortedDesc, false)[0].value;
    const on = computeStatMetrics(sortedDesc, true)[0].value;
    // 켰을 때 값이 다르고 더 커야 한다 (4천만 → 6천만)
    expect(off).not.toBe(on);
    expect(off.startsWith("4,000만")).toBe(true);
    expect(on.startsWith("6,000만")).toBe(true);
  });

  it("입력이 비어 있으면 '최고 주' 지표를 만들지 않는다", () => {
    const metrics = computeStatMetrics([], false);
    expect(metrics).toHaveLength(3);
  });
});

describe("chartWindow", () => {
  it("최근 N개를 잘라서 오래된 순으로 뒤집어 반환한다", () => {
    const list = ["a", "b", "c", "d", "e"];
    expect(chartWindow(list, 3)).toEqual(["c", "b", "a"]);
  });

  it("size가 원소 수보다 크면 전체를 뒤집어 반환한다", () => {
    expect(chartWindow(["x", "y"], 5)).toEqual(["y", "x"]);
  });
});
