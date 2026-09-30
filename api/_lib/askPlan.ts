/**
 * Gemini 함수 호출을 질의 계획으로 검증한다.
 * 네트워크와 환경변수는 읽지 않는다.
 */

import { BOSSES, BOSS_MAP } from "../../src/data/crystalData.js";
import type { AskContext, AskPlan } from "../../src/lib/ask.js";

const REFUSE_EMPTY = "Gemini 응답이 차단되었거나 비어 있습니다.";
const REFUSE_DEFAULT =
  "지원하는 질문이 아닙니다. 가능한 질문: 경험치·레벨·직업·월드, 이번 주 수익, 보스 격파 여부.";

type Declaration = {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildAskTools(context: AskContext): Declaration[] {
  const characterIds = context.characters.map((character) => character.id);
  const bossIds = BOSSES.map((boss) => boss.id);
  const characterIdField: Declaration["parameters"]["properties"][string] = {
    type: "STRING",
    description: "앱에 등록된 캐릭터 id",
  };
  if (characterIds.length > 0) characterIdField.enum = characterIds;
  return [
    {
      name: "characterBasic",
      description: "캐릭터의 레벨, 직업, 월드, 경험치를 조회한다.",
      parameters: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "캐릭터 이름" },
        },
        required: ["name"],
      },
    },
    {
      name: "revenue",
      description: "이번 주 보스 결정석 수익을 조회한다. characterId가 없으면 계정 전체다.",
      parameters: {
        type: "OBJECT",
        properties: { characterId: characterIdField },
      },
    },
    {
      name: "weeklyClear",
      description: "연동된 캐릭터의 보스 격파 여부를 조회한다.",
      parameters: {
        type: "OBJECT",
        properties: {
          characterId: { ...characterIdField },
          bossId: {
            type: "STRING",
            description: "보스 id",
            enum: bossIds,
          },
        },
        required: ["characterId", "bossId"],
      },
    },
  ];
}

export function buildSystemInstruction(context: AskContext): string {
  const characters = context.characters
    .map(
      (character) =>
        `${character.id} ${character.name} 연동:${Boolean(character.ocid && character.accountId)}`,
    )
    .join("\n");
  const bosses = BOSSES.map((boss) => `${boss.id} ${boss.name}`).join("\n");
  return [
    `오늘 날짜는 ${context.today}이다.`,
    "앱 캐릭터:",
    characters || "(없음)",
    "보스:",
    bosses,
    "이 세 도구로 답할 수 있는 질문만 함수를 한 번 호출한다.",
    "그 밖에는 함수를 호출하지 말고 한국어 거절 문장 하나만 답한다.",
  ].join("\n");
}

function refuse(reason: string): AskPlan {
  return { kind: "refuse", reason };
}

export function planFromFunctionCall(call: unknown, context: AskContext): AskPlan {
  if (!isRecord(call) || typeof call.name !== "string") {
    return refuse("지원하는 질문이 아닙니다.");
  }
  const args = call.args;
  if (args !== undefined && !isRecord(args)) {
    return refuse("도구 인자가 올바르지 않습니다.");
  }
  const record = isRecord(args) ? args : {};
  if (call.name === "characterBasic") {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name || name.length > 20 || /\s/.test(name)) {
      return refuse("캐릭터 이름을 넣어 주세요.");
    }
    return { kind: "call", call: { tool: "characterBasic", name } };
  }
  if (call.name === "revenue") {
    if (record.characterId == null || record.characterId === "") {
      return { kind: "call", call: { tool: "revenue", characterId: null } };
    }
    if (typeof record.characterId !== "string") {
      return refuse("앱에 등록된 캐릭터만 수익을 계산할 수 있습니다.");
    }
    const found = context.characters.find((character) => character.id === record.characterId);
    if (!found) return refuse("앱에 등록된 캐릭터만 수익을 계산할 수 있습니다.");
    return { kind: "call", call: { tool: "revenue", characterId: found.id } };
  }
  if (call.name === "weeklyClear") {
    if (typeof record.characterId !== "string" || typeof record.bossId !== "string") {
      return refuse("보스 격파는 연동 계정의 앱 캐릭터만 조회할 수 있습니다.");
    }
    const character = context.characters.find((item) => item.id === record.characterId);
    if (!character) {
      return refuse("보스 격파는 연동 계정의 앱 캐릭터만 조회할 수 있습니다.");
    }
    if (!character.ocid || !character.accountId) {
      return refuse("이 캐릭터는 계정 연동이 없어 스케줄러를 조회할 수 없습니다.");
    }
    if (!BOSS_MAP.has(record.bossId)) {
      return refuse("앱 보스 목록에 있는 보스 이름을 넣어 주세요.");
    }
    return {
      kind: "call",
      call: {
        tool: "weeklyClear",
        characterId: character.id,
        name: character.name,
        ocid: character.ocid,
        accountId: character.accountId,
        bossId: record.bossId,
      },
    };
  }
  return refuse(REFUSE_DEFAULT);
}

function textOf(parts: unknown[]): string {
  return parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim()
    .slice(0, 500);
}

export function planFromGeminiResponse(body: unknown, context: AskContext): AskPlan {
  if (!isRecord(body)) return refuse(REFUSE_EMPTY);
  const feedback = body.promptFeedback;
  if (isRecord(feedback) && feedback.blockReason) return refuse(REFUSE_EMPTY);
  const candidates = body.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return refuse(REFUSE_EMPTY);
  const candidate = candidates[0];
  if (!isRecord(candidate)) return refuse(REFUSE_EMPTY);
  if (candidate.finishReason !== "STOP") {
    return refuse(`Gemini 응답이 완료되지 않았습니다. (${String(candidate.finishReason ?? "없음")})`);
  }
  const content = candidate.content;
  const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
  const calls = parts.filter((part) => isRecord(part) && part.functionCall);
  if (calls.length > 1) return refuse("도구는 한 번에 하나만 호출할 수 있습니다.");
  if (calls.length === 1 && isRecord(calls[0])) {
    return planFromFunctionCall(calls[0].functionCall, context);
  }
  const text = textOf(parts);
  return refuse(text || REFUSE_DEFAULT);
}
