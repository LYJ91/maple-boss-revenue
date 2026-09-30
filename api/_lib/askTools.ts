/**
 * 질의 도구 선언, 검증, 실행.
 * 질문 문장 목록은 두지 않는다.
 */

import { PARTS } from "./nexonSite.js";
import {
  BOSSES,
  BOSS_MAP,
  clampPartySize,
  crystalValue,
  DIFFICULTY_LABEL,
  priceAt,
  RULES,
} from "../../src/data/crystalData.js";
import {
  bossKey,
  completedBossKeys,
  schedulerReliability,
  type SchedulerState,
} from "../../src/lib/schedulerMatch.js";
import type { Difficulty } from "../../src/types.js";

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "chaos", "extreme"];
const PART_TEXT_LIMIT = 12_000;
const ENTRY_LIMIT = 24;

export interface AskServerCharacter {
  id: string;
  name: string;
  ocid?: string;
  accountId?: string;
  partyPrefs?: Record<string, number>;
}

export interface AskToolContext {
  characters: AskServerCharacter[];
  today: string;
  userId: string;
  siteKey?: string;
  ocidByName: Map<string, string>;
  lookupOcid(name: string, apiKey: string): Promise<string>;
  fetchPart(ocid: string, part: string, apiKey: string): Promise<unknown>;
  fetchScheduler(ocid: string, apiKey: string): Promise<SchedulerState>;
  getNexonKey(userId: string, accountId: string): Promise<string | null>;
}

type JsonSchema = {
  type: string;
  description?: string;
  enum?: string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function characterField(characters: AskServerCharacter[]): JsonSchema {
  const field: JsonSchema = { type: "STRING", description: "앱 캐릭터 id" };
  if (characters.length > 0) field.enum = characters.map((character) => character.id);
  return field;
}

export function buildAskTools(characters: AskServerCharacter[]): ToolDeclaration[] {
  const characterId = characterField(characters);
  return [
    {
      name: "characterBasic",
      description: "캐릭터 이름에 해당하는 기본 정보를 조회한다.",
      parameters: {
        type: "OBJECT",
        properties: { name: { type: "STRING", description: "캐릭터 이름" } },
        required: ["name"],
      },
    },
    {
      name: "characterPart",
      description: "캐릭터의 지정한 정보 파트를 조회한다.",
      parameters: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "캐릭터 이름" },
          part: {
            type: "STRING",
            description: Object.entries(PARTS)
              .map(([name, path]) => `${name} ${path}`)
              .join(", "),
            enum: Object.keys(PARTS),
          },
        },
        required: ["name", "part"],
      },
    },
    {
      name: "weeklyClears",
      description: "연동된 캐릭터의 이번 주기 보스 처치 목록을 조회한다.",
      parameters: {
        type: "OBJECT",
        properties: { characterId },
        required: ["characterId"],
      },
    },
    {
      name: "crystalRevenue",
      description: "보스 처치 목록의 결정석 수익을 가격표로 계산한다.",
      parameters: {
        type: "OBJECT",
        properties: {
          characterId: { ...characterId, description: "파티 인원 선호를 읽을 캐릭터 id" },
          entries: {
            type: "ARRAY",
            description: "계산할 보스",
            items: {
              type: "OBJECT",
              properties: {
                bossId: { type: "STRING", description: "보스 id", enum: BOSSES.map((boss) => boss.id) },
                difficulty: { type: "STRING", description: "난이도", enum: DIFFICULTIES },
                partySize: { type: "INTEGER", description: "질문에 드러난 파티 인원" },
              },
              required: ["bossId", "difficulty"],
            },
          },
        },
        required: ["entries"],
      },
    },
  ];
}

export function buildSystemInstruction(
  characters: AskServerCharacter[],
  today: string,
): string {
  const roster = characters
    .map(
      (character) =>
        `${character.id} ${character.name} linked:${Boolean(character.ocid && character.accountId)}`,
    )
    .join("\n");
  const bosses = BOSSES.map(
    (boss) =>
      `${boss.id} ${boss.name} ${boss.reset} ${boss.variants.map((variant) => variant.difficulty).join(",")}`,
  ).join("\n");
  return [
    `오늘=${today}`,
    "캐릭터(id, 이름, 연동 여부):",
    roster || "(없음)",
    "보스(id, 이름, 주기, 난이도):",
    bosses,
    "필요한 값은 도구를 호출해 받아라.",
    "금액은 crystalRevenue가 돌려준 값만 사용하라.",
    "파티 인원은 사용자가 질문에 밝힌 경우에만 partySize로 넘겨라.",
    "도구로 알 수 없으면 불가능하다고 한국어로 답하라.",
    "도구 결과에 없는 보스와 숫자를 만들지 마라.",
  ].join("\n");
}

function findCharacter(context: AskToolContext, characterId: unknown) {
  if (typeof characterId !== "string") return undefined;
  return context.characters.find((character) => character.id === characterId);
}

async function ocidForName(context: AskToolContext, name: string): Promise<string> {
  const cached = context.ocidByName.get(name);
  if (cached) return cached;
  if (!context.siteKey) throw new Error("서버에 넥슨 API 키가 설정되지 않았습니다.");
  const ocid = await context.lookupOcid(name, context.siteKey);
  context.ocidByName.set(name, ocid);
  return ocid;
}

function characterName(value: unknown): string | { error: string } {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 20 || /\s/.test(name)) {
    return { error: "캐릭터 이름이 올바르지 않습니다." };
  }
  return name;
}

export function quoteCrystalRevenue(
  today: string,
  entries: unknown,
  partyPrefs: Record<string, number> | undefined,
): Record<string, unknown> {
  if (!Array.isArray(entries)) return { error: "entries가 배열이 아닙니다." };
  if (entries.length > ENTRY_LIMIT) return { error: "한 번에 계산할 보스가 너무 많습니다." };
  const lines = [];
  const unknown: string[] = [];
  const errors: string[] = [];
  let weeklyTotal = 0;
  let monthlyTotal = 0;
  let weeklyCount = 0;
  for (const raw of entries) {
    if (!isRecord(raw) || typeof raw.bossId !== "string" || typeof raw.difficulty !== "string") {
      errors.push("항목 형식이 올바르지 않습니다.");
      continue;
    }
    const boss = BOSS_MAP.get(raw.bossId);
    const variant = boss?.variants.find((item) => item.difficulty === raw.difficulty);
    if (!boss || !variant || !DIFFICULTIES.includes(raw.difficulty as Difficulty)) {
      errors.push(`${raw.bossId} 난이도를 계산할 수 없습니다.`);
      continue;
    }
    const requested =
      typeof raw.partySize === "number"
        ? raw.partySize
        : partyPrefs?.[boss.id];
    if (requested == null) {
      unknown.push(boss.id);
      continue;
    }
    const partySize = clampPartySize(boss, variant.difficulty, requested);
    const price = priceAt(variant, today);
    const share = crystalValue(price, partySize);
    if (boss.reset === "weekly") {
      weeklyTotal += share;
      weeklyCount += 1;
    } else if (boss.reset === "monthly") {
      monthlyTotal += share;
    }
    lines.push({
      bossId: boss.id,
      name: boss.name,
      reset: boss.reset,
      difficulty: DIFFICULTY_LABEL[variant.difficulty],
      price,
      partySize,
      partySizeAdjusted: partySize !== requested,
      share,
    });
  }
  return {
    lines,
    weeklyTotal,
    monthlyTotal,
    partySizeUnknown: unknown,
    errors,
    weeklyOverSellLimit: weeklyCount > RULES.weeklyBossSellLimitPerCharacter,
    worldSellLimitApplied: false,
  };
}

export function clearsFromScheduler(state: SchedulerState): Record<string, unknown> {
  const reliability = schedulerReliability(state);
  if (!reliability.weeklyBosses && !reliability.monthlyBosses) {
    return {
      available: false,
      reason: "스케줄러 응답이 축약되어 처치 목록을 확정할 수 없습니다.",
      reliability,
    };
  }
  const keys = completedBossKeys(state);
  const clears = [];
  for (const boss of BOSSES) {
    if (boss.reset === "weekly" && !reliability.weeklyBosses) continue;
    if (boss.reset === "monthly" && !reliability.monthlyBosses) continue;
    if (boss.reset !== "weekly" && boss.reset !== "monthly") continue;
    for (const variant of boss.variants) {
      if (!keys.has(bossKey(boss.id, variant.difficulty))) continue;
      clears.push({
        bossId: boss.id,
        bossName: boss.name,
        reset: boss.reset,
        difficulty: variant.difficulty,
      });
    }
  }
  return { available: true, clears, reliability };
}

export async function executeAskTool(
  name: string,
  args: unknown,
  context: AskToolContext,
): Promise<Record<string, unknown>> {
  const record = isRecord(args) ? args : {};
  if (name === "characterBasic" || name === "characterPart") {
    const nameResult = characterName(record.name);
    if (typeof nameResult !== "string") return nameResult;
    try {
      const ocid = await ocidForName(context, nameResult);
      if (name === "characterBasic") {
        const basic = await context.fetchPart(ocid, "basic", context.siteKey ?? "");
        if (!isRecord(basic)) return { error: "기본 정보를 읽지 못했습니다." };
        return {
          name: basic.character_name,
          world: basic.world_name,
          job: basic.character_class,
          level: basic.character_level,
          exp: basic.character_exp,
          expRate: basic.character_exp_rate,
        };
      }
      if (typeof record.part !== "string" || !(record.part in PARTS)) {
        return { error: "지원하지 않는 조회 파트입니다." };
      }
      const payload = await context.fetchPart(ocid, record.part, context.siteKey ?? "");
      const text = JSON.stringify(payload);
      if (text.length > PART_TEXT_LIMIT) {
        return { truncated: true, excerpt: text.slice(0, PART_TEXT_LIMIT) };
      }
      return { part: record.part, data: payload };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "조회에 실패했습니다." };
    }
  }
  if (name === "weeklyClears") {
    const character = findCharacter(context, record.characterId);
    if (!character) return { available: false, reason: "앱에 없는 캐릭터입니다." };
    if (!character.ocid || !character.accountId) {
      return { available: false, reason: "계정 연동이 없어 스케줄러를 조회할 수 없습니다." };
    }
    const key = await context.getNexonKey(context.userId, character.accountId);
    if (!key) return { available: false, reason: "이 사용자의 넥슨 키를 찾지 못했습니다." };
    try {
      const state = await context.fetchScheduler(character.ocid, key);
      return clearsFromScheduler(state);
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : "조회에 실패했습니다." };
    }
  }
  if (name === "crystalRevenue") {
    const character = findCharacter(context, record.characterId);
    return quoteCrystalRevenue(
      context.today,
      record.entries,
      character?.partyPrefs,
    );
  }
  return { error: "지원하지 않는 도구입니다." };
}
