import { useEffect, useMemo, useState } from "react";
import type { Character } from "../types";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { GradeBadge, gradeKey } from "../components/character/shared";
import { fetchDetail } from "../lib/nexon";
import {
  pickCombatEquipment,
  reclassifySlots,
  type DisplayLine,
  type SlotPotential,
} from "../lib/potentialOverview";
import {
  analyzeGoalGap,
  analyzeSlotUsefulEv,
  fmtPct,
  fmtTries,
  GOAL_KIND_OPTIONS,
  type EvCubeMode,
  type GoalKind,
} from "../lib/potentialEv";
import type { CubeAnalysis } from "../lib/cube";
import { gotoCharacter, gotoTodo } from "../lib/router";

interface CharLoadState {
  status: "loading" | "ready" | "error";
  slots?: SlotPotential[];
  error?: string;
}

type ViewMode = "overview" | "useful-ev" | "goal-line";

const CACHE_KEY = "maple-boss-revenue:potential-overview:v4";
const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheMap = Record<string, { fetchedAt: number; slots: SlotPotential[] }>;

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CacheMap;
  } catch {
    // ignore
  }
  return {};
}

function writeCache(cache: CacheMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

function LineList({ lines }: { lines: DisplayLine[] }) {
  if (lines.length === 0) {
    return <div className="pot-line other">옵션 없음</div>;
  }
  return (
    <>
      {lines.map((line, index) => (
        <div
          key={`${line.short}-${index}`}
          className={`pot-line ${line.priority} tone-${line.tone}`}
          title={line.text}
        >
          {line.short}
        </div>
      ))}
    </>
  );
}

function EvMetric({ analysis }: { analysis: CubeAnalysis | null }) {
  if (!analysis) return null;
  if (!analysis.supported) {
    return (
      <div className="pot-ev unsupported" title={analysis.note}>
        {analysis.note ?? "분석 불가"}
      </div>
    );
  }
  return (
    <div className={`pot-ev ${analysis.done ? "done" : ""}`}>
      <span>
        유효 {analysis.usefulLines}/{analysis.targetLines}
        {analysis.usefulLabels.length > 0
          ? ` · ${analysis.usefulLabels.join(", ")}`
          : ""}
      </span>
      <strong>{fmtTries(analysis.expectedTries, analysis.done)}</strong>
      {!analysis.done && Number.isFinite(analysis.expectedTries) ? (
        <em>1회 {fmtPct(analysis.pReach)}</em>
      ) : null}
    </div>
  );
}

function SlotCard({
  slot,
  view,
  job,
  cubeMode,
  targetLines,
  goalKinds,
}: {
  slot: SlotPotential;
  view: ViewMode;
  job?: string;
  cubeMode: EvCubeMode;
  targetLines: 1 | 2 | 3;
  goalKinds: GoalKind[];
}) {
  const potGrade = gradeKey(slot.potentialGrade);
  const useful =
    view === "useful-ev"
      ? analyzeSlotUsefulEv(slot, job, cubeMode, targetLines)
      : null;
  const goal =
    view === "goal-line"
      ? analyzeGoalGap(slot, job, goalKinds, cubeMode)
      : null;

  if (!slot.name) {
    return (
      <div className="pot-slot empty">
        <div className="pot-slot-label">{slot.label}</div>
        <p className="pot-slot-empty">미착용</p>
      </div>
    );
  }
  return (
    <div className={`pot-slot ${potGrade ? `grade-${potGrade}` : ""}`}>
      <div className="pot-slot-label">{slot.label}</div>
      <div className="pot-slot-head">
        {slot.icon ? <img src={slot.icon} alt="" /> : null}
        <strong className={potGrade ? `text-${potGrade}` : undefined}>
          {slot.name}
        </strong>
      </div>
      <div className="pot-block">
        <div className="pot-block-title">
          본잠 <GradeBadge grade={slot.potentialGrade} />
        </div>
        <LineList lines={slot.potential} />
      </div>
      {view === "overview" && (
        <div className="pot-block">
          <div className="pot-block-title">
            에디 <GradeBadge grade={slot.additionalGrade} />
          </div>
          <LineList lines={slot.additional} />
        </div>
      )}
      {view === "useful-ev" && <EvMetric analysis={useful} />}
      {view === "goal-line" && goal && (
        <>
          <div className="pot-gaps">
            {goal.gaps.map((g) => (
              <span
                key={g.kind}
                className={
                  !g.applicable
                    ? "pot-gap na"
                    : g.present
                      ? "pot-gap ok"
                      : "pot-gap miss"
                }
                title={
                  !g.applicable
                    ? "이 슬롯에는 해당 없음"
                    : g.present
                      ? "보유"
                      : "없음"
                }
              >
                {!g.applicable ? "—" : g.present ? "✓" : "✗"} {g.label}
              </span>
            ))}
          </div>
          <div className="pot-ev-note">
            갭 {goal.missingCount} · 유효 {goal.approxTargetLines}줄 근사
          </div>
          <EvMetric analysis={goal.analysis} />
        </>
      )}
    </div>
  );
}

function viewSubtitle(view: ViewMode): string {
  if (view === "useful-ev") {
    return "잠재탭1 · 큐브 유효 n줄 기대 횟수. 등급이 큐브 대상과 같은 장비만 분석합니다.";
  }
  if (view === "goal-line") {
    return "잠재탭2 · 선택한 종류(공%/보공/방무) 보유 여부와, 유효 n줄 EV 근사. 특정 옵션 세트 EV는 아닙니다.";
  }
  return "무기 · 보조무기 · 엠블렘의 본잠/에디를 한눈에 봅니다.";
}

/** 등록 캐릭터의 무기/보조/엠블렘 잠재를 한눈에 보는 탭 */
export function PotentialPage({ characters }: { characters: Character[] }) {
  const linked = useMemo(
    () => characters.filter((c) => c.meta?.ocid),
    [characters],
  );
  const linkedKey = useMemo(
    () =>
      linked
        .map(
          (c) => `${c.id}:${c.meta?.ocid ?? ""}:${c.meta?.job ?? ""}:${c.name}`,
        )
        .join("|"),
    [linked],
  );
  const [loads, setLoads] = useState<Record<string, CharLoadState>>({});
  const [reloadToken, setReloadToken] = useState(0);
  const [view, setView] = useState<ViewMode>("overview");
  const [cubeMode, setCubeMode] = useState<EvCubeMode>("gold");
  const [targetLines, setTargetLines] = useState<1 | 2 | 3>(2);
  const [goalKinds, setGoalKinds] = useState<GoalKind[]>([
    "att_pct",
    "boss",
    "ied",
  ]);

  useEffect(() => {
    if (linked.length === 0) {
      setLoads({});
      return;
    }
    let cancelled = false;
    const cache = readCache();
    const initial: Record<string, CharLoadState> = {};
    const needFetch: Character[] = [];

    for (const character of linked) {
      const ocid = character.meta!.ocid!;
      const cached = cache[ocid];
      if (
        reloadToken === 0 &&
        cached &&
        Date.now() - cached.fetchedAt < CACHE_TTL_MS
      ) {
        initial[character.id] = {
          status: "ready",
          slots: reclassifySlots(cached.slots, character.meta?.job),
        };
      } else {
        initial[character.id] = { status: "loading" };
        needFetch.push(character);
      }
    }
    setLoads(initial);

    void mapPool(needFetch, 3, async (character) => {
      const ocid = character.meta!.ocid!;
      try {
        const detail = await fetchDetail(ocid, ["item"]);
        if (cancelled) return;
        const item = detail.item;
        if (item?.error) throw new Error(String(item.error));
        const equipment = (item?.item_equipment ?? []) as Parameters<
          typeof pickCombatEquipment
        >[0];
        const slots = reclassifySlots(
          pickCombatEquipment(equipment, character.meta?.job),
          character.meta?.job,
        );
        const nextCache = readCache();
        nextCache[ocid] = { fetchedAt: Date.now(), slots };
        writeCache(nextCache);
        setLoads((prev) => ({
          ...prev,
          [character.id]: { status: "ready", slots },
        }));
      } catch (error) {
        if (cancelled) return;
        setLoads((prev) => ({
          ...prev,
          [character.id]: {
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "장비를 불러오지 못했습니다.",
          },
        }));
      }
    });

    return () => {
      cancelled = true;
    };
    // linkedKey로 캐릭터 구성 변경만 감지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedKey, reloadToken]);

  const toggleGoalKind = (kind: GoalKind) => {
    setGoalKinds((prev) => {
      if (prev.includes(kind)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== kind);
      }
      return [...prev, kind];
    });
  };

  if (characters.length === 0) {
    return (
      <div className="empty-board">
        <h2>등록된 캐릭터가 없어요</h2>
        <p>체크리스트에서 계정을 연동하면 장비 잠재를 한눈에 볼 수 있습니다.</p>
        <button className="btn primary" onClick={gotoTodo}>
          체크리스트로 이동
        </button>
      </div>
    );
  }

  if (linked.length === 0) {
    return (
      <div className="empty-board">
        <h2>API 연동 캐릭터가 없어요</h2>
        <p>
          수동으로만 추가된 캐릭터는 장비 조회가 불가합니다. 체크리스트에서
          계정을 연결해 주세요.
        </p>
        <button className="btn primary" onClick={gotoTodo}>
          체크리스트로 이동
        </button>
      </div>
    );
  }

  return (
    <div className="potential-page">
      <div className="potential-head">
        <div>
          <h2>장비잠재</h2>
          <p className="potential-sub">
            {viewSubtitle(view)}
            {view === "overview" && (
              <span className="pot-legend">
                <em className="tone-legendary">레전급</em> /{" "}
                <em className="tone-unique">유니크급(이탈)</em>
                <em className="p1">1순위</em> 강한 테두리
                <em className="p2">2순위</em> 약한 테두리
              </span>
            )}
          </p>
        </div>
        <button
          className="btn ghost sm"
          onClick={() => setReloadToken((n) => n + 1)}
        >
          새로고침
        </button>
      </div>

      <div className="pot-view-tabs" role="tablist" aria-label="장비잠재 보기">
        {(
          [
            ["overview", "한눈"],
            ["useful-ev", "유효줄 EV"],
            ["goal-line", "목표 라인"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={"pot-view-tab" + (view === id ? " on" : "")}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {(view === "useful-ev" || view === "goal-line") && (
        <div className="pot-ev-controls">
          <span className="flame-toggle">
            {(
              [
                ["silver", "실버"],
                ["gold", "골드"],
                ["black", "블랙"],
                ["bronze", "브론즈"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={"flame-toggle-btn" + (cubeMode === id ? " on" : "")}
                onClick={() => setCubeMode(id)}
              >
                {label}
              </button>
            ))}
          </span>
          {view === "useful-ev" && (
            <span className="flame-toggle" title="목표 유효 줄 수">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={
                    "flame-toggle-btn" + (targetLines === n ? " on" : "")
                  }
                  onClick={() => setTargetLines(n)}
                >
                  유효 {n}줄
                </button>
              ))}
            </span>
          )}
          {view === "goal-line" && (
            <span className="flame-toggle" title="목표 옵션 종류">
              {GOAL_KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  className={
                    "flame-toggle-btn" +
                    (goalKinds.includes(opt.kind) ? " on" : "")
                  }
                  onClick={() => toggleGoalKind(opt.kind)}
                >
                  {opt.label}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      <div className="potential-list">
        {linked.map((character) => {
          const load = loads[character.id];
          return (
            <article key={character.id} className="potential-card">
              <header className="potential-card-head">
                <button
                  type="button"
                  className="potential-char"
                  onClick={() => gotoCharacter(character.name)}
                >
                  <CharacterAvatar src={character.meta?.image} size={44} />
                  <div>
                    <strong>{character.name}</strong>
                    <span>
                      Lv.{character.meta?.level ?? "?"} ·{" "}
                      {character.meta?.job ?? "직업 미상"}
                      {character.meta?.world
                        ? ` · ${character.meta.world}`
                        : ""}
                    </span>
                  </div>
                </button>
              </header>

              {load?.status === "loading" && (
                <p className="potential-status">장비 불러오는 중…</p>
              )}
              {load?.status === "error" && (
                <p className="potential-status error">{load.error}</p>
              )}
              {load?.status === "ready" && load.slots && (
                <div className="potential-slots">
                  {load.slots.map((slot) => (
                    <SlotCard
                      key={slot.slot}
                      slot={slot}
                      view={view}
                      job={character.meta?.job}
                      cubeMode={cubeMode}
                      targetLines={targetLines}
                      goalKinds={goalKinds}
                    />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
