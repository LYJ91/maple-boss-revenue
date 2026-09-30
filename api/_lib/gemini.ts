export async function generateContent(input: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: unknown[];
  tools: unknown;
  toolMode: "AUTO" | "NONE";
  timeoutMs: number;
}): Promise<unknown> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
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
  if (!response.ok) {
    throw Object.assign(new Error(`Gemini API 오류 (${response.status})`), {
      status: response.status,
    });
  }
  return response.json();
}
