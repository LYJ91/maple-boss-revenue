/**
 * Gemini 도구 호출을 여러 턴 실행하고, 마지막에는 문장 답을 받는다.
 */

export const MAX_ASK_TURNS = 4;
const MAX_CALLS_PER_TURN = 6;

export type GeminiTurn =
  | { type: "text"; text: string; modelContent: unknown }
  | {
      type: "calls";
      calls: { name: string; args: unknown }[];
      modelContent: unknown;
    }
  | { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readGeminiTurn(body: unknown): GeminiTurn {
  if (!isRecord(body)) return { type: "error", message: "Gemini 응답이 비어 있습니다." };
  const feedback = body.promptFeedback;
  if (isRecord(feedback) && feedback.blockReason) {
    return { type: "error", message: "Gemini 응답이 차단되었습니다." };
  }
  const candidates = body.candidates;
  if (!Array.isArray(candidates) || !isRecord(candidates[0])) {
    return { type: "error", message: "Gemini 응답이 비어 있습니다." };
  }
  const candidate = candidates[0];
  if (candidate.finishReason !== "STOP") {
    return {
      type: "error",
      message: `Gemini 응답이 완료되지 않았습니다. (${String(candidate.finishReason ?? "없음")})`,
    };
  }
  const content = isRecord(candidate.content) ? candidate.content : { parts: [] };
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const calls = parts.flatMap((part) => {
    if (!isRecord(part) || !isRecord(part.functionCall)) return [];
    const call = part.functionCall;
    return [{ name: String(call.name ?? ""), args: call.args }];
  });
  if (calls.length > 0) return { type: "calls", calls, modelContent: content };
  const text = parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (!text) return { type: "error", message: "Gemini가 답변을 만들지 않았습니다." };
  return { type: "text", text, modelContent: content };
}

export async function runAskLoop(input: {
  question: string;
  systemInstruction: string;
  tools: unknown;
  deadlineAt: number;
  now?: () => number;
  generate(request: {
    contents: unknown[];
    toolMode: "AUTO" | "NONE";
    timeoutMs: number;
  }): Promise<unknown>;
  execute(name: string, args: unknown): Promise<Record<string, unknown>>;
}): Promise<{ answer: string } | { error: string }> {
  const now = input.now ?? Date.now;
  const contents: unknown[] = [
    { role: "user", parts: [{ text: input.question }] },
  ];
  for (let turn = 1; turn <= MAX_ASK_TURNS; turn += 1) {
    const remaining = input.deadlineAt - now();
    if (remaining < 1000) return { error: "질의 응답 시간을 초과했습니다." };
    const toolMode = turn === MAX_ASK_TURNS ? "NONE" : "AUTO";
    let body: unknown;
    try {
      body = await input.generate({
        contents,
        toolMode,
        timeoutMs: Math.min(12_000, remaining - 500),
      });
    } catch (error) {
      const status =
        typeof error === "object" && error && "status" in error
          ? Number(error.status)
          : 0;
      if (status === 400 || status === 403) {
        return { error: "Gemini API 키 또는 요청이 올바르지 않습니다." };
      }
      if (status === 429) return { error: "Gemini 호출 한도를 초과했습니다." };
      if (status > 0) return { error: `Gemini API 오류 (${status})` };
      return { error: "Gemini 호출에 실패했습니다." };
    }
    const parsed = readGeminiTurn(body);
    if (parsed.type === "error") return { error: parsed.message };
    contents.push({ role: "model", parts: partList(parsed.modelContent) });
    if (parsed.type === "text") return { answer: parsed.text.slice(0, 4000) };
    if (toolMode === "NONE") return { error: "Gemini가 답변 문장을 만들지 않았습니다." };
    const calls = parsed.calls.slice(0, MAX_CALLS_PER_TURN);
    const responses = [];
    for (const call of calls) {
      const response = await input.execute(call.name, call.args);
      responses.push({
        functionResponse: { name: call.name, response },
      });
    }
    if (parsed.calls.length > MAX_CALLS_PER_TURN) {
      responses.push({
        functionResponse: {
          name: parsed.calls[MAX_CALLS_PER_TURN].name,
          response: { error: "한 번에 호출할 수 있는 도구 수를 넘겼습니다." },
        },
      });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { error: "Gemini가 답변 문장을 만들지 않았습니다." };
}

function partList(content: unknown): unknown[] {
  if (content && typeof content === "object" && "parts" in content) {
    const parts = (content as { parts?: unknown }).parts;
    if (Array.isArray(parts)) return parts;
  }
  return [];
}
