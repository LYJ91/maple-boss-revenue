import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser, authError } from "./_lib/auth.js";
import {
  buildAskTools,
  buildSystemInstruction,
  executeAskTool,
  type AskToolContext,
} from "./_lib/askTools.js";
import { runAskLoop } from "./_lib/askLoop.js";
import { generateContent } from "./_lib/gemini.js";
import { fetchCharacterPart, lookupOcid } from "./_lib/nexonSite.js";
import { getNexonKey } from "./_lib/nexon.js";
import { fetchNexonScheduler } from "./_lib/schedulerFetch.js";
import { askRequestSchema, bodyWithinLimit } from "./_lib/validation.js";

const ASK_DEADLINE_MS = 25_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  }
  try {
    const user = await requireUser(req);
    if (!bodyWithinLimit(req.body)) {
      return res.status(413).json({ error: "질문이 너무 깁니다." });
    }
    const parsed = askRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "질문 형식이 올바르지 않습니다." });
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "서버에 Gemini API 키가 설정되지 않았습니다." });
    }
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
    const characters = parsed.data.characters;
    const context: AskToolContext = {
      characters,
      today: parsed.data.today,
      userId: user.subject,
      siteKey: process.env.NEXON_API_KEY,
      ocidByName: new Map(),
      lookupOcid,
      fetchPart: fetchCharacterPart,
      fetchScheduler: fetchNexonScheduler,
      getNexonKey,
    };
    const result = await runAskLoop({
      question: parsed.data.question,
      systemInstruction: buildSystemInstruction(characters, parsed.data.today),
      tools: buildAskTools(characters),
      deadlineAt: Date.now() + ASK_DEADLINE_MS,
      generate: (request) =>
        generateContent({
          apiKey: key,
          model,
          systemInstruction: buildSystemInstruction(characters, parsed.data.today),
          contents: request.contents,
          tools: buildAskTools(characters),
          toolMode: request.toolMode,
          timeoutMs: request.timeoutMs,
        }),
      execute: (name, args) => executeAskTool(name, args, context),
    });
    if ("error" in result) return res.status(502).json({ error: result.error });
    console.error("ask done");
    return res.status(200).json({ answer: result.answer });
  } catch (error) {
    const auth = authError(error);
    return res.status(auth.status).json({ error: auth.message });
  }
}
