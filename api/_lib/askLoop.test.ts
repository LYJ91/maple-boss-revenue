import { describe, expect, it, vi } from "vitest";
import { readGeminiTurn, runAskLoop } from "./askLoop";

function textBody(text: string) {
  return {
    candidates: [
      { finishReason: "STOP", content: { parts: [{ text }] } },
    ],
  };
}

function callBody(calls: { name: string; args: Record<string, unknown> }[]) {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: calls.map((call) => ({ functionCall: call })) },
      },
    ],
  };
}

describe("ask loop", () => {
  it("첫 응답이 문장이면 도구를 실행하지 않는다", async () => {
    const execute = vi.fn();
    const result = await runAskLoop({
      question: "질문",
      systemInstruction: "지시",
      tools: [],
      deadlineAt: Date.now() + 20_000,
      generate: vi.fn().mockResolvedValue(textBody("답변")),
      execute,
    });
    expect(result).toEqual({ answer: "답변" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("한 턴의 호출 두 개를 순서대로 실행하고 다음 요청에 넣는다", async () => {
    const snapshots: { parts?: { functionResponse?: { name: string } }[] }[][] = [];
    const generate = vi.fn().mockImplementation(async (request: {
      contents: { parts?: { functionResponse?: { name: string } }[] }[];
    }) => {
      snapshots.push(request.contents.map((item) => ({ parts: item.parts ? [...item.parts] : [] })));
      if (snapshots.length === 1) {
        return callBody([
          { name: "weeklyClears", args: { characterId: "c1" } },
          { name: "weeklyClears", args: { characterId: "c2" } },
        ]);
      }
      return textBody("합산 답변");
    });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ clears: ["하나"] })
      .mockResolvedValueOnce({ clears: ["둘"] });
    const result = await runAskLoop({
      question: "질문",
      systemInstruction: "지시",
      tools: [],
      deadlineAt: Date.now() + 20_000,
      generate,
      execute,
    });
    expect(execute).toHaveBeenNthCalledWith(1, "weeklyClears", { characterId: "c1" });
    expect(execute).toHaveBeenNthCalledWith(2, "weeklyClears", { characterId: "c2" });
    const responses = snapshots[1].at(-1)?.parts?.map((part) => part.functionResponse?.name);
    expect(responses).toEqual(["weeklyClears", "weeklyClears"]);
    expect(result).toEqual({ answer: "합산 답변" });
  });

  it("마지막 턴은 도구 없이 문장을 요구한다", async () => {
    const modes: string[] = [];
    const generate = vi.fn().mockImplementation(async (request: { toolMode: string }) => {
      modes.push(request.toolMode);
      if (modes.length < 4) return callBody([{ name: "characterBasic", args: { name: "가나다" } }]);
      return textBody("끝");
    });
    const result = await runAskLoop({
      question: "질문",
      systemInstruction: "지시",
      tools: [],
      deadlineAt: Date.now() + 20_000,
      generate,
      execute: vi.fn().mockResolvedValue({ level: 1 }),
    });
    expect(modes).toEqual(["AUTO", "AUTO", "AUTO", "NONE"]);
    expect(result).toEqual({ answer: "끝" });
  });

  it("마지막 턴에도 문장이 없으면 실패한다", async () => {
    const result = await runAskLoop({
      question: "질문",
      systemInstruction: "지시",
      tools: [],
      deadlineAt: Date.now() + 20_000,
      generate: vi.fn().mockResolvedValue(callBody([{ name: "characterBasic", args: {} }])),
      execute: vi.fn().mockResolvedValue({ error: "실패" }),
    });
    expect(result).toEqual({ error: "Gemini가 답변 문장을 만들지 않았습니다." });
  });

  it("차단된 응답은 실패한다", () => {
    expect(readGeminiTurn({ promptFeedback: { blockReason: "SAFETY" } }).type).toBe("error");
    expect(readGeminiTurn({ candidates: [{ finishReason: "MAX_TOKENS" }] }).type).toBe("error");
    expect(readGeminiTurn({ candidates: [] }).type).toBe("error");
  });

  it("마감이 지나면 호출하지 않는다", async () => {
    const generate = vi.fn();
    const result = await runAskLoop({
      question: "질문",
      systemInstruction: "지시",
      tools: [],
      deadlineAt: Date.now() - 1,
      generate,
      execute: vi.fn(),
    });
    expect(generate).not.toHaveBeenCalled();
    expect("error" in result).toBe(true);
  });
});
