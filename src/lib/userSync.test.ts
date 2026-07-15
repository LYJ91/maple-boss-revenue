import { beforeEach, describe, expect, it } from "vitest";
import { decryptText, encryptText } from "../../api/_lib/crypto";
import { mergeHistory, mergeTodoChecks } from "../context/UserStateProvider";
import { redactTodoKeys, type LegacyTodoState } from "./localMigration";
import type { TodoState } from "./todoStorage";

beforeEach(() => {
  process.env.NEXON_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
});

describe("AES-256-GCM credentials", () => {
  it("round-trips with AAD and rejects tampering", () => {
    const encrypted = encryptText("live_secret", "user:account:v1");
    expect(decryptText(encrypted, "user:account:v1")).toBe("live_secret");
    encrypted.tag[0] ^= 1;
    expect(() => decryptText(encrypted, "user:account:v1")).toThrow();
  });
});

describe("legacy migration", () => {
  it("removes API keys from synchronized todo payloads", () => {
    const state = {
      items: [],
      characters: [],
      checks: {},
      accounts: [{ id: "a", label: "본계정", apiKey: "live_secret" }],
    } satisfies LegacyTodoState;
    expect(redactTodoKeys(state).accounts).toEqual([
      { id: "a", label: "본계정", connected: true },
    ]);
    expect(JSON.stringify(redactTodoKeys(state))).not.toContain("live_secret");
  });
});

describe("conflict merging", () => {
  const empty: TodoState = {
    items: [],
    characters: [],
    checks: {},
    accounts: [],
  };

  it("merges todo checks by key and keeps the latest week", () => {
    const merged = mergeTodoChecks(
      { ...empty, checks: { a: "2026-07-09", b: "2026-07-16" } },
      { ...empty, checks: { a: "2026-07-16", c: "2026-07-16" } },
    );
    expect(merged.checks).toEqual({
      a: "2026-07-16",
      b: "2026-07-16",
      c: "2026-07-16",
    });
  });

  it("selects the latest weekly record per week", () => {
    const base = {
      week: "2026-07-09",
      revenue: 1,
      crystals: 1,
      monthlyBossRevenue: 0,
      characterCount: 1,
    };
    const merged = mergeHistory(
      [{ ...base, revenue: 10, updatedAt: "2026-07-10T00:00:00.000Z" }],
      [{ ...base, revenue: 20, updatedAt: "2026-07-11T00:00:00.000Z" }],
    );
    expect(merged[0].revenue).toBe(20);
  });
});
