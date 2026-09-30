/**
 * 자연어 질문을 허용된 조회 하나로 바꾸거나 거절한다.
 * 네트워크와 날짜 생성은 하지 않는다.
 */

import { BOSSES } from "../data/crystalData";

export interface AskCharacter {
  id: string;
  name: string;
  ocid?: string;
  accountId?: string;
}

export interface AskContext {
  characters: AskCharacter[];
  today: string;
}

export type AskTool =
  | { tool: "characterBasic"; name: string }
  | { tool: "revenue"; characterId: string | null }
  | {
      tool: "weeklyClear";
      characterId: string;
      name: string;
      ocid: string;
      accountId: string;
      bossId: string;
    };

export type AskPlan =
  | { kind: "call"; call: AskTool }
  | { kind: "refuse"; reason: string };

/** 보스 이름과 캐릭터 이름은 여기 두지 않는다. */
export const ASK_VOCABULARY = {
  basic: ["경험치", "레벨", "직업", "월드"],
  revenue: ["수익"],
  clear: ["격파", "잡았", "클리어"],
  refuse: ["창고", "메소얼마", "경매"],
  mine: ["내캐릭터"],
  skipName: ["메소", "이번", "이번주"],
  particles: [
    "으로",
    "에서",
    "에게",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "도",
    "만",
    "과",
    "와",
    "로",
  ],
} as const;

const REFUSE_UNSUPPORTED =
  "지원하는 질문이 아닙니다. 가능한 질문: 경험치·레벨·직업·월드, 이번 주 수익, 보스 격파 여부.";

function squash(value: string): string {
  return value.replace(/\s+/g, "");
}

function includesAny(compact: string, words: readonly string[]): boolean {
  return words.some((word) => compact.includes(squash(word)));
}

function stripParticle(token: string): string {
  const particles = [...ASK_VOCABULARY.particles].sort(
    (a, b) => b.length - a.length,
  );
  for (const particle of particles) {
    if (token.endsWith(particle) && token.length - particle.length >= 2) {
      return token.slice(0, -particle.length);
    }
  }
  return token;
}

function reserved(token: string): boolean {
  const compact = squash(token);
  const words = [
    ...ASK_VOCABULARY.basic,
    ...ASK_VOCABULARY.revenue,
    ...ASK_VOCABULARY.clear,
    ...ASK_VOCABULARY.refuse,
    ...ASK_VOCABULARY.mine,
    ...ASK_VOCABULARY.skipName,
    "이번",
    "이번주",
  ];
  if (words.some((word) => squash(word) === compact)) return true;
  return BOSSES.some((boss) => squash(boss.name) === compact);
}

function nameToken(token: string): string | undefined {
  const name = stripParticle(token);
  if (!/^[가-힣]{2,6}$/.test(name) || reserved(name)) return undefined;
  return name;
}

function findAppCharacter(
  compact: string,
  characters: AskCharacter[],
): AskCharacter | undefined {
  const sorted = [...characters].sort(
    (a, b) => squash(b.name).length - squash(a.name).length,
  );
  return sorted.find((character) => {
    const name = squash(character.name);
    return name.length > 0 && compact.includes(name);
  });
}

function arbitraryName(text: string): string | undefined {
  const tokens = text.split(" ").filter(Boolean);
  const intent = [
    ...ASK_VOCABULARY.basic,
    ...ASK_VOCABULARY.revenue,
    ...ASK_VOCABULARY.clear,
  ];
  for (let index = 1; index < tokens.length; index += 1) {
    const current = squash(tokens[index]);
    if (!intent.some((word) => current.includes(squash(word)))) continue;
    const name = nameToken(tokens[index - 1]);
    if (name) return name;
  }
  for (const token of tokens) {
    if (!token.endsWith("의")) continue;
    const name = nameToken(token);
    if (name) return name;
  }
  return undefined;
}

function findBosses(haystack: string): { id: string }[] {
  const sorted = [...BOSSES].sort(
    (a, b) => squash(b.name).length - squash(a.name).length,
  );
  const found: { id: string }[] = [];
  let rest = haystack;
  for (const boss of sorted) {
    const name = squash(boss.name);
    if (!name || !rest.includes(name)) continue;
    found.push({ id: boss.id });
    rest = rest.replace(name, "");
  }
  return found;
}

type Subject =
  | { kind: "app"; character: AskCharacter }
  | { kind: "name"; name: string }
  | { kind: "none" };

function resolveSubject(
  text: string,
  compact: string,
  characters: AskCharacter[],
): Subject | AskPlan {
  const app = findAppCharacter(compact, characters);
  if (app) return { kind: "app", character: app };
  if (includesAny(compact, ASK_VOCABULARY.mine)) {
    if (characters.length === 0) {
      return { kind: "refuse", reason: "앱에 등록된 캐릭터가 없습니다." };
    }
    if (characters.length > 1) {
      const names = characters.map((character) => character.name).join(", ");
      return {
        kind: "refuse",
        reason: `캐릭터가 ${characters.length}명입니다. 이름을 넣어 주세요: ${names}`,
      };
    }
    return { kind: "app", character: characters[0] };
  }
  const named = arbitraryName(text);
  if (named) return { kind: "name", name: named };
  return { kind: "none" };
}

export function planAsk(question: string, context: AskContext): AskPlan {
  const text = question.trim().replace(/\s+/g, " ");
  const compact = squash(text);
  if (!compact) return { kind: "refuse", reason: "질문을 입력해 주세요." };
  if (includesAny(compact, ASK_VOCABULARY.refuse)) {
    return {
      kind: "refuse",
      reason:
        "창고·보유 메소·경매장을 조회하는 도구가 없습니다(넥슨 Open API 미제공).",
    };
  }

  const subject = resolveSubject(text, compact, context.characters);
  if ("kind" in subject && subject.kind === "refuse") return subject;
  const who = subject as Subject;

  if (includesAny(compact, ASK_VOCABULARY.clear)) {
    let haystack = compact;
    if (who.kind === "app") haystack = haystack.replace(squash(who.character.name), "");
    const bosses = findBosses(haystack);
    if (bosses.length > 1) {
      return { kind: "refuse", reason: "보스를 하나만 넣어 주세요." };
    }
    if (bosses.length === 0) {
      return {
        kind: "refuse",
        reason: "앱 보스 목록에 있는 보스 이름을 넣어 주세요.",
      };
    }
    if (who.kind !== "app") {
      return {
        kind: "refuse",
        reason: "보스 격파는 연동 계정의 앱 캐릭터만 조회할 수 있습니다.",
      };
    }
    const { ocid, accountId, id, name } = who.character;
    if (!ocid || !accountId) {
      return {
        kind: "refuse",
        reason: "이 캐릭터는 계정 연동이 없어 스케줄러를 조회할 수 없습니다.",
      };
    }
    return {
      kind: "call",
      call: {
        tool: "weeklyClear",
        characterId: id,
        name,
        ocid,
        accountId,
        bossId: bosses[0].id,
      },
    };
  }

  if (includesAny(compact, ASK_VOCABULARY.basic)) {
    if (who.kind === "app") {
      return { kind: "call", call: { tool: "characterBasic", name: who.character.name } };
    }
    if (who.kind === "name") {
      return { kind: "call", call: { tool: "characterBasic", name: who.name } };
    }
    return { kind: "refuse", reason: "캐릭터 이름을 넣어 주세요." };
  }

  if (includesAny(compact, ASK_VOCABULARY.revenue)) {
    if (who.kind === "none") {
      return { kind: "call", call: { tool: "revenue", characterId: null } };
    }
    if (who.kind === "app") {
      return {
        kind: "call",
        call: { tool: "revenue", characterId: who.character.id },
      };
    }
    return {
      kind: "refuse",
      reason: "앱에 등록된 캐릭터만 수익을 계산할 수 있습니다.",
    };
  }

  return { kind: "refuse", reason: REFUSE_UNSUPPORTED };
}
