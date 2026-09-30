import { useRef, useState } from "react";
import { requestAskAnswer } from "../lib/askRemote";
import type { Character } from "../types";

interface Props {
  characters: Character[];
  connectedAccountIds: string[];
  today: string;
}

export function AskPage({ characters, connectedAccountIds, today }: Props) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const requestId = useRef(0);
  const accounts = new Set(connectedAccountIds);

  const submit = () => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    const id = requestId.current + 1;
    requestId.current = id;
    setPending(true);
    setAnswer(null);
    void requestAskAnswer({
      question: trimmed,
      today,
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        ocid: character.meta?.ocid,
        accountId:
          character.meta?.accountId && accounts.has(character.meta.accountId)
            ? character.meta.accountId
            : undefined,
        partyPrefs: character.partyPrefs,
      })),
    })
      .then((text) => {
        if (requestId.current !== id) return;
        setAnswer(text);
        setPending(false);
      })
      .catch((error: unknown) => {
        if (requestId.current !== id) return;
        setAnswer(error instanceof Error ? error.message : "질의에 실패했습니다.");
        setPending(false);
      });
  };

  return (
    <div className="empty-board lookup-page">
      <h2>질의</h2>
      <p>
        질문을 보내면 필요한 메이플 조회와 결정석 계산을 한 뒤, 그 결과로 답을 만듭니다.
        조회할 수 없으면 그렇게 알려 줍니다.
      </p>
      <div className="search-row lookup-search">
        <input
          className="text-input"
          value={question}
          placeholder="질문을 입력하세요"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <button
          className="btn primary"
          type="button"
          disabled={pending || !question.trim()}
          onClick={submit}
        >
          {pending ? "조회 중" : "전송"}
        </button>
      </div>
      {answer && <div className="notice info">{answer}</div>}
    </div>
  );
}
