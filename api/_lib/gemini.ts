const MODEL_FALLBACKS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
];

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
  let lastStatus = 0;
  for (const model of models) {
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
        signal: AbortSignal.timeout(input.timeoutMs),
      },
    );
    if (response.ok) return response.json();
    lastStatus = response.status;
    if (response.status !== 503 && response.status !== 404) break;
  }
  throw Object.assign(new Error(`Gemini API 오류 (${lastStatus})`), {
    status: lastStatus,
  });
}
