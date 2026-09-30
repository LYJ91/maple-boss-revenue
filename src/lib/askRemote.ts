import { authRequest } from "./sync";

export interface AskRequestCharacter {
  id: string;
  name: string;
  ocid?: string;
  accountId?: string;
  partyPrefs?: Record<string, number>;
}

export async function requestAskAnswer(input: {
  question: string;
  today: string;
  characters: AskRequestCharacter[];
}): Promise<string> {
  const body = await authRequest<{ answer?: unknown }>("/api/ask", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (typeof body.answer !== "string" || !body.answer.trim()) {
    throw new Error("질의 응답 형식이 올바르지 않습니다.");
  }
  return body.answer;
}
