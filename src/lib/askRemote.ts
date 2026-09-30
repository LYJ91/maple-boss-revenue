import type { AskContext, AskPlan } from "./ask";
import { authRequest } from "./sync";

function isPlan(value: unknown): value is AskPlan {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "call" || kind === "refuse";
}

export async function requestAskPlan(
  question: string,
  context: AskContext,
): Promise<AskPlan> {
  const body = await authRequest<unknown>("/api/ask", {
    method: "POST",
    body: JSON.stringify({
      question,
      characters: context.characters,
      today: context.today,
    }),
  });
  if (!isPlan(body)) throw new Error("질의 응답 형식이 올바르지 않습니다.");
  return body;
}
