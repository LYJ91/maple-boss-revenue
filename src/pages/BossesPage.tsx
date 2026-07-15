import { useMemo, useState } from "react";
import type { Character, Difficulty, ResetType } from "../types";
import {
  BOSSES,
  DATA_SOURCE,
  DIFFICULTY_LABEL,
  RESET_LABEL,
} from "../data/crystalData";
import { priceAt } from "../lib/calc";
import { formatFull, formatMeso, todayISO } from "../lib/format";

type ResetFilter = "all" | "weekly" | "monthly";
type SortKey = "price-desc" | "price-asc" | "name";

interface Row {
  bossId: string;
  bossName: string;
  reset: ResetType;
  difficulty: Difficulty;
  maxPartySize: number;
  price: number;
  since: string;
  /** 이 (보스, 난이도)를 잡는 것으로 등록된 내 캐릭터 이름들 */
  clearers: string[];
  /** 다음에 예정된 가격 변동 (있으면 표시) */
  upcoming?: { price: number; since: string };
}

/**
 * 전체 보스 도감 탭.
 * - 모든 보스 × 난이도의 결정석 가격을 정렬/필터해서 보여준다
 * - "내 캐릭터"가 잡는 (보스, 난이도)에는 캐릭터 이름 칩을 표시
 * - 다음 가격 변동이 예정된 항목에는 배너를 띄운다
 */
export function BossesPage({ characters }: { characters: Character[] }) {
  const today = useMemo(todayISO, []);
  const [reset, setReset] = useState<ResetFilter>("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [minPrice, setMinPrice] = useState<number>(0);
  const [sortKey, setSortKey] = useState<SortKey>("price-desc");
  const [query, setQuery] = useState<string>("");

  const rows = useMemo(() => buildRows(characters, today), [characters, today]);
  const upcomingCount = rows.filter((r) => r.upcoming).length;

  const filtered = useMemo(() => {
    const q = query.trim();
    let list = rows.filter((r) => {
      if (reset !== "all" && r.reset !== reset) return false;
      if (difficulty !== "all" && r.difficulty !== difficulty) return false;
      if (minPrice > 0 && r.price < minPrice) return false;
      if (q && !r.bossName.includes(q)) return false;
      return true;
    });
    list = sortRows(list, sortKey);
    return list;
  }, [rows, reset, difficulty, minPrice, sortKey, query]);

  return (
    <div className="bosses-page">
      <div className="bosses-head">
        <div>
          <h2>보스 정보</h2>
          <p className="bosses-sub">
            결정석 가격 · 파티 인원 · 내 캐릭터 격파 현황을 한눈에. 가격 출처:{" "}
            <a href={DATA_SOURCE.url} target="_blank" rel="noreferrer">
              {DATA_SOURCE.label}
            </a>{" "}
            (확인일 {DATA_SOURCE.verifiedAt}, 오늘 {today} 기준)
          </p>
        </div>
      </div>

      {upcomingCount > 0 && (
        <p className="notice info bosses-upcoming">
          다음 가격 변동이 예정된 항목이 {upcomingCount}건 있습니다. 표에서{" "}
          <em>“예정”</em> 배지를 확인해주세요.
        </p>
      )}

      <div className="bosses-filters">
        <label className="filter-item">
          <span>사이클</span>
          <select
            value={reset}
            onChange={(e) => setReset(e.target.value as ResetFilter)}
          >
            <option value="all">전체</option>
            <option value="weekly">주간</option>
            <option value="monthly">월간</option>
          </select>
        </label>
        <label className="filter-item">
          <span>난이도</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty | "all")}
          >
            <option value="all">전체</option>
            {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-item">
          <span>최소 가격 (억)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={minPrice / 100_000_000 || ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinPrice(Number.isFinite(v) && v > 0 ? v * 100_000_000 : 0);
            }}
            placeholder="0"
            className="text-input sm"
          />
        </label>
        <label className="filter-item grow">
          <span>보스명</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 칼로스"
            className="text-input sm"
          />
        </label>
        <label className="filter-item">
          <span>정렬</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="price-desc">가격 높은순</option>
            <option value="price-asc">가격 낮은순</option>
            <option value="name">이름순</option>
          </select>
        </label>
      </div>

      <div className="bosses-count">
        {filtered.length}개 항목 · 전체 {rows.length}개
      </div>

      {filtered.length === 0 ? (
        <div className="empty-board sm">
          <p>조건에 맞는 보스가 없습니다.</p>
        </div>
      ) : (
        <div className="bosses-table-wrap">
          <table className="bosses-table">
            <thead>
              <tr>
                <th>보스</th>
                <th>사이클</th>
                <th>난이도</th>
                <th className="num">결정석 가격</th>
                <th className="num">파티 최대</th>
                <th>가격 정보</th>
                <th>내 캐릭터 격파</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.bossId}-${r.difficulty}`}>
                  <td className="boss-name">{r.bossName}</td>
                  <td>
                    <span
                      className={"chip sm reset-" + r.reset}
                      title={RESET_LABEL[r.reset] + " 보스"}
                    >
                      {RESET_LABEL[r.reset]}
                    </span>
                  </td>
                  <td>
                    <span className={"pill static " + r.difficulty}>
                      {DIFFICULTY_LABEL[r.difficulty]}
                    </span>
                  </td>
                  <td className="num">
                    <strong>{formatMeso(r.price)}</strong>
                    <span className="num-sub">{formatFull(r.price)}</span>
                  </td>
                  <td className="num">{r.maxPartySize}인</td>
                  <td className="price-notes">
                    <span className="price-since">{r.since} 발효</span>
                    {r.upcoming && (
                      <span
                        className="chip warn sm"
                        title={`${r.upcoming.since}부터 ${formatMeso(r.upcoming.price)} 메소`}
                      >
                        {r.upcoming.since} 예정 {r.upcoming.price > r.price ? "↑" : "↓"}
                      </span>
                    )}
                  </td>
                  <td className="clearers">
                    {r.clearers.length === 0 ? (
                      <span className="dim">-</span>
                    ) : (
                      <div className="chip-wrap">
                        {r.clearers.map((name) => (
                          <span key={name} className="chip sm">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 정적 보스 데이터 + 사용자 캐릭터 선택으로 행 배열을 만든다 */
export function buildRows(characters: Character[], today: string): Row[] {
  const rows: Row[] = [];
  const clearersByKey = new Map<string, string[]>();
  for (const c of characters) {
    for (const entry of c.entries) {
      const key = `${entry.bossId}:${entry.difficulty}`;
      const list = clearersByKey.get(key) ?? [];
      if (!list.includes(c.name)) list.push(c.name);
      clearersByKey.set(key, list);
    }
  }

  for (const boss of BOSSES) {
    for (const variant of boss.variants) {
      const price = priceAt(variant, today);
      const current = variant.prices.reduce(
        (best, p) =>
          p.since <= today && (!best || p.since > best.since) ? p : best,
        undefined as { price: number; since: string } | undefined,
      );
      const upcoming = variant.prices
        .filter((p) => p.since > today)
        .sort((a, b) => a.since.localeCompare(b.since))[0];
      const key = `${boss.id}:${variant.difficulty}`;
      rows.push({
        bossId: boss.id,
        bossName: boss.name,
        reset: boss.reset,
        difficulty: variant.difficulty,
        maxPartySize: boss.maxPartySize,
        price,
        since: current?.since ?? variant.prices[0]?.since ?? "",
        clearers: clearersByKey.get(key) ?? [],
        upcoming: upcoming ? { price: upcoming.price, since: upcoming.since } : undefined,
      });
    }
  }
  return rows;
}

export function sortRows(rows: Row[], key: SortKey): Row[] {
  const list = [...rows];
  if (key === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (key === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (key === "name")
    list.sort((a, b) => a.bossName.localeCompare(b.bossName, "ko"));
  return list;
}
