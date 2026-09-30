import { describe, expect, it } from "vitest";
import { BOSSES } from "../data/crystalData";
import { planAsk, type AskCharacter, type AskContext } from "./ask";

const NAME_A = "테스트";
const NAME_B = "샘플명";

const boss = BOSSES.find((item) => item.reset === "weekly");
if (!boss) throw new Error("주간 보스 데이터가 없습니다.");

function context(characters: AskCharacter[]): AskContext {
  return { characters, today: "2026-09-30" };
}

function linked(name: string, id = "c1"): AskCharacter {
  return { id, name, ocid: "ocid-1", accountId: "acc-1" };
}

describe("planAsk", () => {
  it("이름과 경험치는 캐릭터 기본 조회로 보낸다", () => {
    const plan = planAsk(`${NAME_A} 경험치`, context([]));
    expect(plan).toEqual({
      kind: "call",
      call: { tool: "characterBasic", name: NAME_A },
    });
  });

  it("앱에 있는 이름과 경험치도 그 이름으로 조회한다", () => {
    const plan = planAsk(`${NAME_A} 경험치`, context([linked(NAME_A)]));
    expect(plan).toEqual({
      kind: "call",
      call: { tool: "characterBasic", name: NAME_A },
    });
  });

  it("내 캐릭터가 한 명이면 그 캐릭터의 레벨을 조회한다", () => {
    const plan = planAsk("내 캐릭터 레벨", context([linked(NAME_A)]));
    expect(plan).toEqual({
      kind: "call",
      call: { tool: "characterBasic", name: NAME_A },
    });
  });

  it("내 캐릭터가 여러 명이면 이름을 고르라고 거절한다", () => {
    const plan = planAsk(
      "내 캐릭터 레벨",
      context([linked(NAME_A, "c1"), linked(NAME_B, "c2")]),
    );
    expect(plan.kind).toBe("refuse");
    if (plan.kind !== "refuse") return;
    expect(plan.reason).toContain(NAME_A);
    expect(plan.reason).toContain(NAME_B);
  });

  it("내 캐릭터가 없으면 거절한다", () => {
    const plan = planAsk("내 캐릭터 레벨", context([]));
    expect(plan.kind).toBe("refuse");
  });

  it("창고 메소는 수익 조회로 보내지 않고 거절한다", () => {
    const plan = planAsk("창고에 메소 얼마 있어?", context([linked(NAME_A)]));
    expect(plan.kind).toBe("refuse");
    if (plan.kind !== "refuse") return;
    expect(plan.reason).toContain("메소");
    expect(plan.reason).not.toContain("수익을 계산");
  });

  it("이번 주 수익은 계정 전체 수익이다", () => {
    expect(planAsk("이번 주 수익", context([linked(NAME_A)]))).toEqual({
      kind: "call",
      call: { tool: "revenue", characterId: null },
    });
  });

  it("이번 주 메소 수익도 계정 전체 수익이다", () => {
    expect(planAsk("이번 주 메소 수익", context([]))).toEqual({
      kind: "call",
      call: { tool: "revenue", characterId: null },
    });
  });

  it("연동된 앱 캐릭터의 보스 격파를 조회한다", () => {
    const plan = planAsk(`${NAME_A} ${boss.name} 잡았어?`, context([linked(NAME_A)]));
    expect(plan).toEqual({
      kind: "call",
      call: {
        tool: "weeklyClear",
        characterId: "c1",
        name: NAME_A,
        ocid: "ocid-1",
        accountId: "acc-1",
        bossId: boss.id,
      },
    });
  });

  it("계정 연동이 없으면 보스 격파를 거절한다", () => {
    const plan = planAsk(`${NAME_A} ${boss.name} 잡았어?`, context([
      { id: "c1", name: NAME_A, ocid: "ocid-1" },
    ]));
    expect(plan.kind).toBe("refuse");
  });

  it("보스 이름의 공백을 빼도 같은 보스로 조회한다", () => {
    const plan = planAsk(
      `${NAME_A} ${boss.name.replace(/\s+/g, "")} 클리어`,
      context([linked(NAME_A)]),
    );
    expect(plan.kind).toBe("call");
    if (plan.kind !== "call" || plan.call.tool !== "weeklyClear") return;
    expect(plan.call.bossId).toBe(boss.id);
  });

  it("보스 공략은 거절한다", () => {
    const plan = planAsk(`${boss.name} 공략 알려줘`, context([linked(NAME_A)]));
    expect(plan.kind).toBe("refuse");
    if (plan.kind !== "refuse") return;
    expect(plan.reason).toContain("지원하는 질문이 아닙니다");
  });
});

describe("planFromFunctionCall", () => {
  const linked = {
    id: "c1",
    name: NAME_A,
    ocid: "ocid-1",
    accountId: "acc-1",
  };
  const askContext = { characters: [linked], today: "2026-09-30" };

  it("characterBasic 이름이 있으면 호출로 만든다", async () => {
    const { planFromFunctionCall } = await import("../../api/_lib/askPlan");
    expect(
      planFromFunctionCall({ name: "characterBasic", args: { name: NAME_A } }, askContext),
    ).toEqual({ kind: "call", call: { tool: "characterBasic", name: NAME_A } });
  });

  it("characterBasic 이름이 비어 있으면 거절한다", async () => {
    const { planFromFunctionCall } = await import("../../api/_lib/askPlan");
    expect(
      planFromFunctionCall({ name: "characterBasic", args: { name: "  " } }, askContext).kind,
    ).toBe("refuse");
  });

  it("revenue 는 캐릭터 id 가 없으면 계정 전체다", async () => {
    const { planFromFunctionCall } = await import("../../api/_lib/askPlan");
    expect(planFromFunctionCall({ name: "revenue", args: {} }, askContext)).toEqual({
      kind: "call",
      call: { tool: "revenue", characterId: null },
    });
  });

  it("revenue 는 목록에 있는 캐릭터만 받는다", async () => {
    const { planFromFunctionCall } = await import("../../api/_lib/askPlan");
    expect(
      planFromFunctionCall({ name: "revenue", args: { characterId: "c1" } }, askContext),
    ).toEqual({ kind: "call", call: { tool: "revenue", characterId: "c1" } });
    expect(
      planFromFunctionCall({ name: "revenue", args: { characterId: "없는id" } }, askContext)
        .kind,
    ).toBe("refuse");
  });

  it("weeklyClear 는 연동 정보와 보스 id 를 채운다", async () => {
    const { planFromFunctionCall } = await import("../../api/_lib/askPlan");
    expect(
      planFromFunctionCall(
        { name: "weeklyClear", args: { characterId: "c1", bossId: boss.id } },
        askContext,
      ),
    ).toEqual({
      kind: "call",
      call: {
        tool: "weeklyClear",
        characterId: "c1",
        name: NAME_A,
        ocid: "ocid-1",
        accountId: "acc-1",
        bossId: boss.id,
      },
    });
  });

  it("weeklyClear 는 연동이 없거나 없는 보스면 거절한다", async () => {
    const { planFromFunctionCall } = await import("../../api/_lib/askPlan");
    const unlinked = { characters: [{ id: "c1", name: NAME_A }], today: "2026-09-30" };
    expect(
      planFromFunctionCall(
        { name: "weeklyClear", args: { characterId: "c1", bossId: boss.id } },
        unlinked,
      ).kind,
    ).toBe("refuse");
    expect(
      planFromFunctionCall(
        { name: "weeklyClear", args: { characterId: "없는", bossId: boss.id } },
        askContext,
      ).kind,
    ).toBe("refuse");
    expect(
      planFromFunctionCall(
        { name: "weeklyClear", args: { characterId: "c1", bossId: "없는보스" } },
        askContext,
      ).kind,
    ).toBe("refuse");
  });

  it("알 수 없는 도구나 잘못된 인자는 거절한다", async () => {
    const { planFromFunctionCall } = await import("../../api/_lib/askPlan");
    expect(planFromFunctionCall({ name: "searchWeb", args: {} }, askContext).kind).toBe(
      "refuse",
    );
    expect(planFromFunctionCall({ name: "revenue", args: "문자열" }, askContext).kind).toBe(
      "refuse",
    );
  });
});
