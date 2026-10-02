import { describe, expect, it, vi } from "vitest";
import type { CharacterMeta } from "../types";
import type { LookupCharacter } from "./nexon";
import {
  applyLiveIdentity,
  applyRosterToCharacters,
  applyRosters,
  canQueryScheduler,
  loadAccountRosters,
  shouldReplaceMeta,
  unlinkAccount,
} from "./characterIdentity";

function live(partial: Partial<LookupCharacter> = {}): LookupCharacter {
  return {
    ocid: "new-ocid",
    name: "꿀꾸리렌",
    world: "루나",
    job: "렌",
    level: 275,
    ...partial,
  };
}

function character(
  partial: {
    name?: string;
    meta?: CharacterMeta;
  } = {},
) {
  return {
    id: "c1",
    name: partial.name ?? "꿀꾸리렌",
    meta: partial.meta,
  };
}

describe("canQueryScheduler", () => {
  it("ocid와 accountId가 있으면 계정 목록에 없어도 조회 대상이다", () => {
    expect(
      canQueryScheduler({
        meta: { ocid: "ocid", accountId: "missing-from-list" },
      }),
    ).toBe(true);
  });

  it("ocid나 accountId나 meta가 없으면 조회 대상이 아니다", () => {
    expect(canQueryScheduler({ meta: { ocid: "ocid" } })).toBe(false);
    expect(canQueryScheduler({ meta: { accountId: "acc1" } })).toBe(false);
    expect(canQueryScheduler({})).toBe(false);
  });
});

describe("unlinkAccount", () => {
  it("대상 캐릭터에서는 accountId만 지운다", () => {
    const current = {
      id: "c1",
      name: "7살캡틴",
      entries: [{ bossId: "lotus", difficulty: "hard" as const, partySize: 1, clearsPerWeek: 1 }],
      weeklyConfirmedWeek: "2026-10-01",
      weeklyByWeek: { "2026-10-01": [] },
      meta: { ocid: "ocid", accountId: "acc1", world: "스카니아" },
    };
    const next = unlinkAccount([current], "acc1");
    expect(next[0].meta).toEqual({ ocid: "ocid", world: "스카니아" });
    expect(next[0].entries).toBe(current.entries);
    expect(next[0].weeklyByWeek).toBe(current.weeklyByWeek);
    expect(next[0].weeklyConfirmedWeek).toBe("2026-10-01");
    expect(next[0].id).toBe("c1");
    expect(next[0].name).toBe("7살캡틴");
  });

  it("다른 계정 캐릭터는 같은 객체로 남긴다", () => {
    const other = character({
      meta: { ocid: "other", accountId: "acc2" },
    });
    const next = unlinkAccount([other], "acc1");
    expect(next[0]).toBe(other);
  });

  it("대상이 없으면 같은 배열을 반환한다", () => {
    const list = [character({ meta: { ocid: "a", accountId: "acc2" } })];
    expect(unlinkAccount(list, "acc1")).toBe(list);
  });
});

describe("shouldReplaceMeta", () => {
  it("ocid·월드가 바뀌면 교체가 필요하다", () => {
    expect(
      shouldReplaceMeta(
        { ocid: "old", world: "챌린저스", accountId: "acc1" },
        { ocid: "new", world: "루나", accountId: "acc1" },
      ),
    ).toBe(true);
  });

  it("같은 식별자면 교체하지 않는다", () => {
    const meta = { ocid: "same", world: "루나", accountId: "acc1", level: 200 };
    expect(shouldReplaceMeta(meta, meta)).toBe(false);
  });
});

describe("applyRosterToCharacters", () => {
  it("월드 이전 후 폐기된 ocid는 같은 이름 명단으로 교체한다", () => {
    const stale = character({
      meta: {
        ocid: "challengers-ocid",
        world: "챌린저스",
        accountId: "acc1",
        job: "렌",
        level: 270,
      },
    });
    const next = applyRosterToCharacters(
      [stale],
      [live({ ocid: "luna-ocid" })],
      "acc1",
    );
    expect(next[0].meta).toMatchObject({
      ocid: "luna-ocid",
      world: "루나",
      accountId: "acc1",
      level: 275,
    });
  });

  it("명단에 있는 ocid는 월드·레벨만 갱신한다", () => {
    const current = character({
      meta: {
        ocid: "luna-ocid",
        world: "루나",
        accountId: "acc1",
        level: 270,
      },
    });
    const next = applyRosterToCharacters(
      [current],
      [live({ ocid: "luna-ocid", level: 276 })],
      "acc1",
    );
    expect(next[0].meta?.level).toBe(276);
  });

  it("ocid가 이 명단에 있으면 다른 accountId여도 이 계정으로 다시 묶는다", () => {
    const stale = character({
      meta: { ocid: "new-ocid", accountId: "acc-old", world: "스카니아" },
    });
    const next = applyRosterToCharacters([stale], [live()], "acc1");
    expect(next[0].meta).toMatchObject({
      ocid: "new-ocid",
      accountId: "acc1",
    });
  });

  it("다른 계정 캐릭터는 건드리지 않는다", () => {
    const other = character({
      meta: { ocid: "other", world: "스카니아", accountId: "acc2" },
    });
    const next = applyRosterToCharacters([other], [live()], "acc1");
    expect(next[0]).toBe(other);
  });

  it("같은 이름이 명단에 둘이면 ocid 없이는 추측하지 않는다", () => {
    const stale = character({
      meta: { ocid: "gone", accountId: "acc1" },
    });
    const next = applyRosterToCharacters(
      [stale],
      [
        live({ ocid: "a", world: "루나" }),
        live({ ocid: "b", world: "스카니아" }),
      ],
      "acc1",
    );
    expect(next[0]).toBe(stale);
  });

  it("다른 accountId이고 ocid가 없으면 이름만 같아도 묶지 않는다", () => {
    const other = character({
      meta: { accountId: "acc2", world: "스카니아" },
    });
    const next = applyRosterToCharacters([other], [live()], "acc1");
    expect(next[0]).toBe(other);
  });

  it("계정 없는 수동 캐릭터도 이름이 하나면 연동을 붙인다", () => {
    const manual = character();
    const next = applyRosterToCharacters([manual], [live()], "acc1");
    expect(next[0].meta).toMatchObject({
      ocid: "new-ocid",
      accountId: "acc1",
      world: "루나",
    });
  });

  it("빈 명단은 기존 식별자를 지우지 않는다", () => {
    const current = character({
      meta: { ocid: "keep", accountId: "acc1", world: "루나" },
    });
    const list = [current];
    expect(applyRosterToCharacters(list, [], "acc1")).toBe(list);
  });
});

describe("applyLiveIdentity", () => {
  it("변화가 없으면 같은 객체를 반환한다", () => {
    const current = character({
      meta: {
        ocid: "new-ocid",
        world: "루나",
        job: "렌",
        level: 275,
        accountId: "acc1",
      },
    });
    expect(applyLiveIdentity(current, live(), "acc1")).toBe(current);
  });
});

describe("applyRosters", () => {
  it("계정별 명단을 순서대로 적용한다", () => {
    const chars = [
      character({
        name: "본캐",
        meta: { ocid: "old-a", accountId: "acc1", world: "챌린저스" },
      }),
      character({
        name: "부캐",
        meta: { ocid: "old-b", accountId: "acc2", world: "챌린저스" },
      }),
    ];
    const next = applyRosters(
      chars,
      new Map([
        ["acc1", [live({ ocid: "a", name: "본캐", world: "루나" })]],
        ["acc2", [live({ ocid: "b", name: "부캐", world: "스카니아" })]],
      ]),
    );
    expect(next[0].meta).toMatchObject({ ocid: "a", world: "루나" });
    expect(next[1].meta).toMatchObject({ ocid: "b", world: "스카니아" });
  });

  it("양쪽 명단에 같은 ocid가 있으면 저장 accountId를 유지한다", () => {
    const current = character({
      meta: { ocid: "shared", accountId: "acc1", world: "루나" },
    });
    const shared = live({ ocid: "shared", name: "꿀꾸리렌" });
    const next = applyRosters(
      [current],
      new Map([
        ["acc2", [shared]],
        ["acc1", [{ ...shared, level: 280 }]],
      ]),
    );
    expect(next[0].meta?.accountId).toBe("acc1");
    expect(next[0].meta?.ocid).toBe("shared");
  });

  it("저장 계정 명단이 없으면 다른 명단의 ocid로 다시 묶는다", () => {
    const current = character({
      meta: { ocid: "moved", accountId: "gone", world: "챌린저스" },
    });
    const next = applyRosters(
      [current],
      new Map([["acc1", [live({ ocid: "moved" })]]]),
    );
    expect(next[0].meta).toMatchObject({
      ocid: "moved",
      accountId: "acc1",
    });
  });
});

describe("loadAccountRosters", () => {
  it("실패한 계정은 결과에 넣지 않아 기존 식별자를 지울 수 없다", async () => {
    const fetchRoster = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce([live()]);
    const rosters = await loadAccountRosters(["bad", "good"], fetchRoster);
    expect(rosters.has("bad")).toBe(false);
    expect(rosters.get("good")?.[0].ocid).toBe("new-ocid");
  });
});
