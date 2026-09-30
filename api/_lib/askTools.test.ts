import { describe, expect, it, vi } from "vitest";
import { BOSSES } from "../../src/data/crystalData";
import type { SchedulerState } from "../../src/lib/schedulerMatch";
import { PARTS } from "./nexonSite";
import {
  buildAskTools,
  buildSystemInstruction,
  clearsFromScheduler,
  executeAskTool,
  quoteCrystalRevenue,
  type AskToolContext,
} from "./askTools";

describe("ask tools", () => {
  it("도구 선언의 보스 id와 파트는 데이터와 같다", () => {
    const tools = buildAskTools([{ id: "c1", name: "가나다" }]);
    const revenue = tools.find((tool) => tool.name === "crystalRevenue");
    const part = tools.find((tool) => tool.name === "characterPart");
    const bossEnum = revenue?.parameters.properties?.entries?.items?.properties?.bossId?.enum;
    const partEnum = part?.parameters.properties?.part?.enum;
    expect(bossEnum).toEqual(BOSSES.map((boss) => boss.id));
    expect(partEnum).toEqual(Object.keys(PARTS));
  });

  it("시스템 지시에는 식별자를 넣지 않는다", () => {
    const text = buildSystemInstruction(
      [{ id: "c1", name: "가나다", ocid: "ocid-value", accountId: "acc-value" }],
      "2026-09-30",
    );
    expect(text).not.toContain("ocid-value");
    expect(text).not.toContain("acc-value");
    expect(text).toContain("linked:true");
  });

  it("알 수 없는 도구는 오류 결과를 돌려준다", async () => {
    const result = await executeAskTool("missing", {}, emptyContext());
    expect(result).toEqual({ error: "지원하지 않는 도구입니다." });
  });

  it("파티 인원이 없으면 금액을 계산하지 않는다", () => {
    const boss = BOSSES.find((item) => item.variants.some((variant) => variant.difficulty === "chaos"));
    if (!boss) throw new Error("난이도 데이터가 없습니다.");
    const quoted = quoteCrystalRevenue("2026-09-17", [
      { bossId: boss.id, difficulty: "chaos" },
    ], undefined);
    expect(quoted.partySizeUnknown).toEqual([boss.id]);
    expect(quoted.weeklyTotal).toBe(0);
    expect(quoted.lines).toEqual([]);
  });

  it("질문의 인원이 저장 인원보다 우선하고 가격은 날짜를 따른다", () => {
    const boss = "zakum-weekly";
    const before = quoteCrystalRevenue(
      "2026-09-16",
      [{ bossId: boss, difficulty: "chaos", partySize: 2 }],
      { "zakum-weekly": 4 },
    );
    const after = quoteCrystalRevenue(
      "2026-09-17",
      [{ bossId: boss, difficulty: "chaos", partySize: 2 }],
      { "zakum-weekly": 4 },
    );
    const beforeLine = (before.lines as { share: number; partySize: number }[])[0];
    const afterLine = (after.lines as { share: number; partySize: number }[])[0];
    expect(beforeLine.partySize).toBe(2);
    expect(afterLine.partySize).toBe(2);
    expect(afterLine.share).not.toBe(beforeLine.share);
    expect(before.weeklyTotal).toBe(beforeLine.share);
  });

  it("저장 인원만 있으면 그 인원으로 계산한다", () => {
    const quoted = quoteCrystalRevenue(
      "2026-09-17",
      [{ bossId: "zakum-weekly", difficulty: "chaos" }],
      { "zakum-weekly": 2 },
    );
    const line = (quoted.lines as { partySize: number }[])[0];
    expect(line.partySize).toBe(2);
    expect(quoted.partySizeUnknown).toEqual([]);
  });

  it("없는 난이도는 오류로 남긴다", () => {
    const quoted = quoteCrystalRevenue(
      "2026-09-17",
      [{ bossId: "zakum-weekly", difficulty: "easy" }],
      { "zakum-weekly": 1 },
    );
    expect(quoted.errors).toEqual(["zakum-weekly 난이도를 계산할 수 없습니다."]);
  });

  it("연동 정보가 없으면 스케줄러를 호출하지 않는다", async () => {
    const fetchScheduler = vi.fn();
    const result = await executeAskTool(
      "weeklyClears",
      { characterId: "c1" },
      emptyContext(fetchScheduler),
    );
    expect(fetchScheduler).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
  });

  it("처치 목록은 앱 보스 id로 맞춘다", () => {
    const state: SchedulerState = {
      date: null,
      weeklyBossClearCount: 1,
      weeklyBossClearLimit: 12,
      bosses: [
        { name: "스우", difficulty: "hard", cycle: "bossWeekly", complete: true },
        { name: "검은 마법사", difficulty: "hard", cycle: "bossMonthly", complete: true },
      ],
      contents: [],
    };
    const result = clearsFromScheduler(state);
    expect(result.available).toBe(true);
    const clears = result.clears as { bossId: string; difficulty: string; reset: string }[];
    expect(clears.map((item) => item.bossId).sort()).toEqual(["black-mage", "lotus"]);
  });

  it("축약된 스케줄러는 목록 대신 사유를 준다", () => {
    const state: SchedulerState = {
      date: null,
      weeklyBossClearCount: 0,
      weeklyBossClearLimit: 12,
      bosses: [
        { name: "검은 마법사", difficulty: "hard", cycle: "bossMonthly", complete: false },
      ],
      contents: [],
    };
    const result = clearsFromScheduler(state);
    expect(result.available).toBe(false);
  });
});

function emptyContext(
  fetchScheduler: AskToolContext["fetchScheduler"] = vi.fn(),
): AskToolContext {
  return {
    characters: [{ id: "c1", name: "가나다" }],
    today: "2026-09-30",
    userId: "user",
    ocidByName: new Map(),
    lookupOcid: vi.fn(),
    fetchPart: vi.fn(),
    fetchScheduler,
    getNexonKey: vi.fn(),
  };
}
