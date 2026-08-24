import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "../types";
import { loadHistory, upsertWeekRecord } from "./history";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.restoreAllMocks();
  vi.resetModules();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

const linked: Character = {
  id: "c1",
  name: "테스트",
  entries: [],
  partyPrefs: { lotus: 2 },
  meta: {
    world: "스카니아",
    job: "히어로",
    level: 280,
    image: "",
    ocid: "ocid1",
    accountId: "acc1",
  },
};

describe("finalizePendingWeeks", () => {
  it("이미 finalized된 주는 API를 호출하지 않는다", async () => {
    const fetchScheduler = vi.fn();
    vi.doMock("./scheduler", async () => {
      const actual =
        await vi.importActual<typeof import("./scheduler")>("./scheduler");
      return { ...actual, fetchScheduler };
    });
    const { finalizePendingWeeks } = await import("./weekFinalize");

    upsertWeekRecord({
      week: "2026-07-09",
      revenue: 100,
      crystals: 1,
      monthlyBossRevenue: 0,
      characterCount: 1,
      updatedAt: "2026-07-15T00:00:00.000Z",
      finalized: true,
    });
    // 2주 전(2026-07-02)도 확정해 두면 호출이 없어야 한다
    upsertWeekRecord({
      week: "2026-07-02",
      revenue: 50,
      crystals: 1,
      monthlyBossRevenue: 0,
      characterCount: 1,
      updatedAt: "2026-07-08T00:00:00.000Z",
      finalized: true,
    });

    const result = await finalizePendingWeeks(
      [linked],
      new Date(2026, 6, 16, 12, 0, 0),
    );
    expect(fetchScheduler).not.toHaveBeenCalled();
    expect(result.finalizedWeeks).toEqual([]);
  });

  it("미확정 지난 주는 date로 조회해 finalized로 저장한다", async () => {
    const fetchScheduler = vi.fn().mockResolvedValue({
      date: "2026-07-15",
      weeklyBossClearCount: 1,
      weeklyBossClearLimit: 12,
      bosses: [
        {
          name: "스우",
          difficulty: "hard",
          cycle: "bossWeekly",
          complete: true,
        },
      ],
      contents: [],
    });
    vi.doMock("./scheduler", async () => {
      const actual =
        await vi.importActual<typeof import("./scheduler")>("./scheduler");
      return { ...actual, fetchScheduler };
    });
    const { finalizePendingWeeks } = await import("./weekFinalize");

    const result = await finalizePendingWeeks(
      [linked],
      new Date(2026, 6, 16, 12, 0, 0),
    );

    expect(fetchScheduler).toHaveBeenCalledWith("ocid1", "acc1", {
      date: "2026-07-15",
      force: true,
    });
    expect(result.finalizedWeeks).toContain("2026-07-09");
    const past = loadHistory().find((r) => r.week === "2026-07-09");
    expect(past?.finalized).toBe(true);
    expect(past?.unrecoverable).toBe(false);
    expect(past!.revenue).toBeGreaterThan(0);
  });

  it("벨로나 과거 처치 수익도 3인 상한으로 확정한다", async () => {
    const fetchScheduler = vi.fn().mockResolvedValue({
      date: "2026-08-26",
      weeklyBossClearCount: 1,
      weeklyBossClearLimit: 12,
      bosses: [
        {
          name: "벨로나",
          difficulty: "hard",
          cycle: "bossWeekly",
          complete: true,
        },
      ],
      contents: [],
    });
    vi.doMock("./scheduler", async () => {
      const actual =
        await vi.importActual<typeof import("./scheduler")>("./scheduler");
      return { ...actual, fetchScheduler };
    });
    const { finalizePendingWeeks } = await import("./weekFinalize");

    // 두 주 전은 미리 확정해 직전 주 벨로나 계산만 검증한다.
    upsertWeekRecord({
      week: "2026-08-13",
      revenue: 0,
      crystals: 0,
      monthlyBossRevenue: 0,
      characterCount: 1,
      updatedAt: "2026-08-19T00:00:00.000Z",
      finalized: true,
    });
    const character: Character = {
      ...linked,
      partyPrefs: { bellona: 6 },
    };

    const result = await finalizePendingWeeks(
      [character],
      new Date(2026, 7, 27, 12, 0, 0),
    );

    expect(fetchScheduler).toHaveBeenCalledWith("ocid1", "acc1", {
      date: "2026-08-26",
      force: true,
    });
    expect(result.finalizedWeeks).toContain("2026-08-20");
    const past = loadHistory().find((r) => r.week === "2026-08-20");
    expect(past?.revenue).toBe(Math.floor(2_950_000_000 / 3));
    expect(past?.crystals).toBe(1);
  });

  it("복구 창 밖이고 기존 스냅샷이 있으면 그 값을 확정하고 API는 생략한다", async () => {
    const fetchScheduler = vi.fn();
    vi.doMock("./scheduler", async () => {
      const actual =
        await vi.importActual<typeof import("./scheduler")>("./scheduler");
      return { ...actual, fetchScheduler };
    });
    const { finalizePendingWeeks } = await import("./weekFinalize");

    // now=2026-08-19(수) → current=2026-08-13, past2=2026-07-30(수요일=08-05는 14일 전 → 창 밖)
    upsertWeekRecord({
      week: "2026-07-30",
      revenue: 777,
      crystals: 3,
      monthlyBossRevenue: 0,
      characterCount: 1,
      updatedAt: "2026-08-05T00:00:00.000Z",
      finalized: false,
    });
    // past1도 확정해 API 경로를 타지 않게 한다
    upsertWeekRecord({
      week: "2026-08-06",
      revenue: 1,
      crystals: 1,
      monthlyBossRevenue: 0,
      characterCount: 1,
      updatedAt: "2026-08-12T00:00:00.000Z",
      finalized: true,
    });

    const result = await finalizePendingWeeks(
      [linked],
      new Date(2026, 7, 19, 12, 0, 0),
    );

    expect(fetchScheduler).not.toHaveBeenCalled();
    expect(result.finalizedWeeks).toContain("2026-07-30");
    const locked = loadHistory().find((r) => r.week === "2026-07-30");
    expect(locked?.finalized).toBe(true);
    expect(locked?.revenue).toBe(777);
    expect(locked?.unrecoverable).toBe(false);
  });
});
