import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser, authError } from "./_lib/auth.js";
import { planFromGeminiResponse, buildAskTools, buildSystemInstruction } from "./_lib/askPlan.js";
import { askRequestSchema, bodyWithinLimit } from "./_lib/validation.js";

const GEMINI_TIMEOUT_MS = 20_000;

function geminiFailure(status: number): string {
  if (status === 400 || status === 403) return "Gemini API 키 또는 요청이 올바르지 않습니다.";
  if (status === 429) return "Gemini 호출 한도를 초과했습니다.";
  return `Gemini API 오류 (${status})`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  }
  try {
    await requireUser(req);
    if (!bodyWithinLimit(req.body)) {
      return res.status(413).json({ error: "질문이 너무 깁니다." });
    }
    const parsed = askRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "질문 형식이 올바르지 않습니다." });
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(200).json({
        kind: "refuse",
        reason: "서버에 Gemini API 키가 설정되지 않았습니다.",
      });
    }
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const context = {
      characters: parsed.data.characters,
      today: parsed.data.today,
    };
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: buildSystemInstruction(context) }],
            },
            contents: [
              { role: "user", parts: [{ text: parsed.data.question }] },
            ],
            tools: [{ functionDeclarations: buildAskTools(context) }],
            toolConfig: { functionCallingConfig: { mode: "AUTO" } },
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 1024,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      );
    } catch (error) {
      console.error("gemini fetch failed", error instanceof Error ? error.name : "error");
      return res.status(200).json({
        kind: "refuse",
        reason: "Gemini 호출에 실패했습니다.",
      });
    }
    if (!response.ok) {
      console.error("gemini http", response.status);
      return res.status(200).json({
        kind: "refuse",
        reason: geminiFailure(response.status),
      });
    }
    const body: unknown = await response.json();
    const plan = planFromGeminiResponse(body, context);
    const finish =
      body && typeof body === "object" && "candidates" in body
        ? "ok"
        : "empty";
    console.error("gemini done", finish);
    return res.status(200).json(plan);
  } catch (error) {
    const auth = authError(error);
    return res.status(auth.status).json({ error: auth.message });
  }
}
