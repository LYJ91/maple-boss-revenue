const MODEL_FALLBACKS = ["gemini-3.6-flash", "gemini-3.1-flash-lite"];
const PER_MODEL_TIMEOUT_MS = 6_000;
const MIN_ATTEMPT_MS = 1_000;

export async function generateContent(input: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: unknown[];
  tools: unknown;
  toolMode: "AUTO" | "NONE";
  timeoutMs: number;
}): Promise<unknown> {
  const models = [input.model, ...MODEL_FALLBACKS.filter((name) => name !== input.model)];
  const budgetEnd = Date.now() + input.timeoutMs;
  let lastStatus = 0;
  for (const model of models) {
    const left = budgetEnd - Date.now();
    if (left < MIN_ATTEMPT_MS) break;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": input.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.systemInstruction }] },
            contents: input.contents,
            tools: [{ functionDeclarations: input.tools }],
            toolConfig: { functionCallingConfig: { mode: input.toolMode } },
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 2048,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(Math.min(PER_MODEL_TIMEOUT_MS, left)),
        },
      );
      if (response.ok) return response.json();
      lastStatus = response.status;
      await response.body?.cancel();
      console.warn("gemini request failed", model, response.status);
      if (response.status === 400 || response.status === 401 || response.status === 403) break;
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      console.warn("gemini request failed", model, name);
    }
  }
  throw Object.assign(new Error(`Gemini API 오류 (${lastStatus})`), {
    status: lastStatus,
  });
}
