import { useRef, useState } from "react";
import { BOSS_MAP } from "../data/crystalData";
import { planAsk, type AskPlan } from "../lib/ask";
import { runAsk, type AskResult } from "../lib/askRun";
import type { AccountSummary } from "../lib/calc";
import { searchCharacter } from "../lib/nexon";
import { fetchScheduler } from "../lib/scheduler";
import type { Character } from "../types";

const TOOL_LABEL = {
  characterBasic: "캐릭터 기본",
  revenue: "수익",
  weeklyClear: "보스 격파",
} as const;

interface Props {
  characters: Character[];
  connectedAccountIds: string[];
  summary: AccountSummary;
  today: string;
}

export function AskPage({
  characters,
  connectedAccountIds,
  summary,
  today,
}: Props) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState<AskPlan | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const requestId = useRef(0);
  const accounts = new Set(connectedAccountIds);
  const askCharacters = characters.map((character) => ({
    id: character.id,
    name: character.name,
    ocid: character.meta?.ocid,
    accountId:
      character.meta?.accountId && accounts.has(character.meta.accountId)
        ? character.meta.accountId
        : undefined,
  }));
  const expExample = characters[0]
    ? `${characters[0].name} 경험치`
    : "내 캐릭터 경험치";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setQuestion(trimmed);
    const id = requestId.current + 1;
    requestId.current = id;
    setPending(true);
    const nextPlan = planAsk(trimmed, { characters: askCharacters, today });
    void runAsk(nextPlan, {
      searchCharacter,
      fetchScheduler,
      summary,
      bossMap: BOSS_MAP,
      today,
    }).then((next) => {
      if (requestId.current !== id) return;
      setPlan(nextPlan);
      setResult(next);
      setPending(false);
    });
  };

  return (
    <div className="empty-board lookup-page">
      <h2>질의</h2>
      <p>
        경험치·레벨·직업·월드, 이번 주 수익, 연동 캐릭터의 보스 격파만 조회합니다.
        언어 모델은 쓰지 않으며, 그 밖은 불가능하다고 답합니다.
      </p>
      <div className="search-row lookup-search">
        <input
          className="text-input"
          value={question}
          placeholder="질문을 입력하세요"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit(question);
          }}
        />
        <button
          className="btn primary"
          type="button"
          disabled={pending || !question.trim()}
          onClick={() => submit(question)}
        >
          {pending ? "조회 중" : "전송"}
        </button>
      </div>
      <div className="preset-chips">
        <button className="btn ghost" type="button" onClick={() => submit(expExample)}>
          {expExample}
        </button>
        <button className="btn ghost" type="button" onClick={() => submit("이번 주 수익")}>
          이번 주 수익
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => submit("창고에 메소 얼마 있어?")}
        >
          창고에 메소 얼마 있어?
        </button>
      </div>
      {result?.kind === "value" && plan?.kind === "call" && (
        <div className="notice info">
          <div>
            도구 {TOOL_LABEL[result.tool]} · {result.args}
          </div>
          {result.rows.map((row) => (
            <div key={row.label}>
              {row.label}: {row.value}
            </div>
          ))}
        </div>
      )}
      {result?.kind === "refuse" && (
        <div className="notice warn">불가능. {result.reason}</div>
      )}
    </div>
  );
}
