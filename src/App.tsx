import { useEffect, useMemo, useState } from "react";
import type {
  BossEntry,
  Character,
  CharacterMeta,
  Difficulty,
  ResetDay,
} from "./types";
import {
  BOSS_MAP,
  clampPartySize,
  DATA_SOURCE,
  RULES,
} from "./data/crystalData";
import type { BossPreset } from "./data/presets";
import { computeAccount } from "./lib/calc";
import {
  toggleBossSelection,
  weeklySelectionCount,
} from "./lib/bossSelection";
import { loadState, saveState, type AppState } from "./lib/storage";
import {
  forgetCharacter,
  loadTodoState,
  saveTodoState,
  type TodoState,
} from "./lib/todoStorage";
import { unifyCharacters } from "./lib/unifyState";
import {
  adoptApiSelection,
  conflictKeys,
  detectWeeklyConflicts,
  keepManualSelection,
  verifyAllWeekly,
} from "./lib/bossConflict";
import {
  applyLiveIdentity,
  applyRosters,
  loadAccountRosters,
} from "./lib/characterIdentity";
import { searchCharacter, type LookupCharacter } from "./lib/nexon";
import { createServerAccount, deleteServerAccount } from "./lib/sync";
import {
  bossKey,
  completedBossKeys,
  entriesEqual,
  fetchScheduler,
  schedulerReliability,
  SCHEDULER_STATE_EVENT,
  type SchedulerStateEventDetail,
  type SchedulerState,
} from "./lib/scheduler";
import {
  applyLiveSchedule,
  applyMonthlyEvidence,
  dropUnconfirmedMonthly,
  findMonthlyEvidenceThisMonth,
  monthKey,
  monthlySyncStatusFor,
  needsMonthlyHistory,
} from "./lib/monthlyBoss";
import {
  dropStaleWeekly,
  rememberWeekly,
  weeklyEntriesOf,
  withWeeklyArchive,
} from "./lib/weeklyBoss";
import { parseISODate, weekKey } from "./lib/week";
import { todayISO } from "./lib/format";
import {
  loadHistory,
  recordCurrentWeek,
  visibleHistory,
  type WeekRecord,
} from "./lib/history";
import { finalizePendingWeeks } from "./lib/weekFinalize";
import { SummaryBar } from "./components/SummaryBar";
import { RevenueHistory } from "./components/RevenueHistory";
import { CharacterSidebar } from "./components/CharacterSidebar";
import { BossPanel } from "./components/BossPanel";
import { PriceTable } from "./components/PriceTable";
import { LimitModal } from "./components/LimitModal";
import { ImportModal } from "./components/ImportModal";
import { ConflictModal } from "./components/ConflictModal";
import { CharacterPage } from "./pages/CharacterPage";
import { TodoPage } from "./pages/TodoPage";
import { StatsPage } from "./pages/StatsPage";
import { PotentialPage } from "./pages/PotentialPage";
import {
  gotoPotential,
  gotoCharacter,
  gotoHome,
  gotoLookup,
  gotoStats,
  gotoTodo,
  useRoute,
  type Route,
} from "./lib/router";

function newId(): string {
  return crypto.randomUUID();
}

/** 이미 알린 충돌 (브라우저 세션 동안만 유지). 새로 생긴 차이는 다시 알린다. */
const CONFLICT_PROMPT_KEY = "maple-boss-revenue:conflict-prompted";

function readSeenConflicts(week: string): string[] {
  try {
    const raw = sessionStorage.getItem(CONFLICT_PROMPT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { week?: string; keys?: string[] };
    return parsed.week === week && Array.isArray(parsed.keys)
      ? parsed.keys
      : [];
  } catch {
    return [];
  }
}

function markSeenConflicts(week: string, keys: string[]): void {
  try {
    sessionStorage.setItem(
      CONFLICT_PROMPT_KEY,
      JSON.stringify({ week, keys }),
    );
  } catch {
    // 세션 저장이 막혀 있으면 이번 세션에 한 번 더 뜰 수 있다.
  }
}

const monthlyScanInflight = new Set<string>();

function shouldScanMonthly(character: {
  monthlyConfirmedMonth?: string;
  monthlyScanMonth?: string;
}, month: string): boolean {
  return (
    character.monthlyConfirmedMonth !== month &&
    character.monthlyScanMonth !== month
  );
}

function HeaderSearch() {
  const [term, setTerm] = useState("");
  const submit = () => {
    if (term.trim()) {
      gotoCharacter(term);
      setTerm("");
    }
  };
  return (
    <div className="header-search">
      <input
        className="text-input sm"
        placeholder="캐릭터 검색"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        aria-label="캐릭터 검색"
      />
      <button className="btn sm" onClick={submit} disabled={!term.trim()}>
        검색
      </button>
    </div>
  );
}

type MainTab = "calc" | "equip" | "todo" | "stats" | "potential";

function activeTab(route: Route): MainTab {
  if (route.view === "todo") return "todo";
  if (route.view === "stats") return "stats";
  if (route.view === "potential") return "potential";
  if (route.view === "character" || route.view === "lookup") return "equip";
  return "calc";
}

function MainNav({ route }: { route: Route }) {
  const current = activeTab(route);
  const tabs: { key: MainTab; label: string; go(): void }[] = [
    { key: "todo", label: "체크리스트", go: gotoTodo },
    { key: "calc", label: "보스수익", go: gotoHome },
    { key: "stats", label: "수익 통계", go: gotoStats },
    { key: "potential", label: "장비잠재", go: gotoPotential },
    { key: "equip", label: "장비확인", go: gotoLookup },
  ];
  return (
    <nav className="main-nav" aria-label="주요 기능">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={"main-nav-tab" + (current === t.key ? " on" : "")}
          onClick={t.go}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function LookupPage() {
  const [term, setTerm] = useState("");
  const submit = () => {
    if (term.trim()) gotoCharacter(term);
  };
  return (
    <div className="empty-board lookup-page">
      <h2>장비 확인</h2>
      <p>
        캐릭터명을 검색하면 장비 · 스탯 · 유니온 · 스킬 등<br />
        캐릭터 상세 정보를 확인할 수 있습니다.
      </p>
      <div className="search-row lookup-search">
        <input
          className="text-input"
          placeholder="캐릭터명을 입력하세요"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
        <button
          className="btn primary"
          onClick={submit}
          disabled={!term.trim()}
        >
          검색
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  // 캐릭터 목록은 보스수익 상태 하나만 갖고, 체크리스트는 그 id로 체크만 보관한다.
  const [unified] = useState(() => unifyCharacters(loadState(), loadTodoState()));
  const [state, setState] = useState<AppState>(unified.calculator);
  const [todo, setTodo] = useState<TodoState>(unified.todo);
  const [showPrices, setShowPrices] = useState(false);
  const [showWeeklyLimit, setShowWeeklyLimit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  /** ocid → 최신 스케줄러 현황 (체크리스트에서 연동된 캐릭터만) */
  const [schedules, setSchedules] = useState<Record<string, SchedulerState>>(
    {},
  );
  const [history, setHistory] = useState<WeekRecord[]>(loadHistory);
  const [today, setToday] = useState(todayISO);
  const [refreshing, setRefreshing] = useState(false);
  /** ocid → 마지막 스케줄러 조회 오류 메시지 */
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>(
    {},
  );
  /** 월드 이전 후 ocid를 계정 명단으로 맞춘 뒤에만 스케줄러를 친다 */
  const [identitiesReady, setIdentitiesReady] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveTodoState(todo);
  }, [todo]);

  // 챌린저스 종료 등 월드 이전 후 바뀐 ocid·월드를 계정 명단으로 맞춘다.
  useEffect(() => {
    let cancelled = false;
    const accountIds = [
      ...new Set(
        [
          ...todo.accounts.map((account) => account.id),
          ...state.characters.map((character) => character.meta?.accountId),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    void loadAccountRosters(accountIds).then((rosters) => {
      if (cancelled) return;
      if (rosters.size > 0) {
        setState((prev) => {
          const characters = applyRosters(prev.characters, rosters);
          return characters === prev.characters ? prev : { ...prev, characters };
        });
      }
      setIdentitiesReady(true);
    });
    return () => {
      cancelled = true;
    };
    // 탭 이동 시 계정 명단을 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.view]);

  const month = monthKey(today);
  const week = weekKey("thu", parseISODate(today));
  const monthlySyncStatus = useMemo(
    () =>
      Object.fromEntries(
        state.characters.map((character) => {
          const ocid = character.meta?.ocid;
          return [
            character.id,
            monthlySyncStatusFor(
              character,
              month,
              Boolean(ocid && schedules[ocid]),
            ),
          ] as const;
        }),
      ) as Record<string, "manual" | "ready" | "checking">,
    [month, schedules, state.characters],
  );
  const charactersForSummary = useMemo(
    () =>
      state.characters.map((character) =>
        dropStaleWeekly(dropUnconfirmedMonthly(character, month), week),
      ),
    [month, week, state.characters],
  );

  const summary = useMemo(
    () => computeAccount(charactersForSummary, BOSS_MAP, today),
    [charactersForSummary, today],
  );
  const monthlyOverview = useMemo(
    () => ({
      monthLabel: `${Number(today.slice(5, 7))}월`,
      completed: summary.monthlyBossSelected,
      total: summary.monthlyBossTotal,
      revenue: summary.monthlyBossRevenue,
      checking: Object.values(monthlySyncStatus).filter(
        (status) => status === "checking",
      ).length,
    }),
    [monthlySyncStatus, summary, today],
  );

  // 판매 제한 그룹 표시용 계정 이름 (체크리스트에서 등록한 계정)
  const accountLabels = useMemo(
    () => new Map(todo.accounts.map((a) => [a.id, a.label])),
    [todo.accounts],
  );

  // 내 선택과 API 처치 내역의 차이 (아직 결정하지 않은 것만)
  const conflicts = useMemo(
    () => detectWeeklyConflicts(state.characters, schedules, week),
    [state.characters, schedules, week],
  );
  // 결정 여부와 무관한 대조 결과 — 화면 숫자 옆에 항상 표시한다
  const verifications = useMemo(
    () => verifyAllWeekly(state.characters, schedules, week),
    [state.characters, schedules, week],
  );

  // 아직 알리지 않은 차이가 있을 때만 비교 창을 자동으로 띄운다.
  // 같은 차이로 반복해서 뜨지는 않지만, 새로 생긴 차이는 세션 중에도 알린다.
  useEffect(() => {
    const keys = conflictKeys(conflicts);
    if (keys.length === 0) return;
    const seen = readSeenConflicts(week);
    if (keys.every((key) => seen.includes(key))) return;
    markSeenConflicts(week, [...new Set([...seen, ...keys])]);
    setShowConflicts(true);
  }, [conflicts, week]);

  const resolveConflicts = (
    resolve: typeof keepManualSelection,
    characterId?: string,
  ) => {
    const targets = characterId
      ? conflicts.filter((item) => item.characterId === characterId)
      : conflicts;
    if (targets.length === 0) return;
    const byId = new Map(targets.map((item) => [item.characterId, item]));
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((character) => {
        const conflict = byId.get(character.id);
        return conflict ? resolve(character, week, conflict) : character;
      }),
    }));
    if (!characterId || conflicts.length === targets.length) {
      setShowConflicts(false);
    }
  };

  const selected =
    state.characters.find((c) => c.id === state.selectedId) ?? null;
  const selectedSummary = selected
    ? summary.characters.find((s) => s.id === selected.id)
    : undefined;

  // Todo 탭의 강제 갱신을 포함해 모든 스케줄러 응답을 계산기 상태에 즉시 반영한다.
  useEffect(() => {
    const onSchedulerState = (event: Event) => {
      const { ocid, accountId, state: scheduler } = (
        event as CustomEvent<SchedulerStateEventDetail>
      ).detail;
      setSchedules((prev) => ({ ...prev, [ocid]: scheduler }));
      const confirmedMonth = monthKey(todayISO());
      const confirmedWeek = weekKey("thu", parseISODate(todayISO()));
      setState((prev) => {
        const index = prev.characters.findIndex(
          (character) =>
            character.meta?.ocid === ocid &&
            character.meta?.accountId === accountId,
        );
        if (index < 0) return prev;
        const character = prev.characters[index];
        const next = applyLiveSchedule(
          character,
          scheduler,
          confirmedMonth,
          confirmedWeek,
        );
        if (
          entriesEqual(character.entries, next.entries) &&
          character.monthlyConfirmedMonth === next.monthlyConfirmedMonth &&
          character.weeklyConfirmedWeek === next.weeklyConfirmedWeek &&
          JSON.stringify(character.weeklyByWeek ?? {}) ===
            JSON.stringify(next.weeklyByWeek ?? {})
        ) {
          return prev;
        }
        const characters = [...prev.characters];
        characters[index] = next;
        return { ...prev, characters };
      });
    };
    window.addEventListener(SCHEDULER_STATE_EVENT, onSchedulerState);
    return () =>
      window.removeEventListener(SCHEDULER_STATE_EVENT, onSchedulerState);
  }, []);

  // 연동 캐릭터 전체를 최초 접속 및 화면 복귀 시 강제 갱신한다.
  const linkedKey = state.characters
    .map((c) => `${c.id}:${c.meta?.ocid ?? ""}:${c.meta?.accountId ?? ""}`)
    .join("|");
  useEffect(() => {
    if (!identitiesReady) return;
    const accounts = new Map(todo.accounts.map((a) => [a.id, a]));
    const retryTimers: number[] = [];
    const refresh = () => {
      for (const character of state.characters) {
        const ocid = character.meta?.ocid;
        const account = character.meta?.accountId
          ? accounts.get(character.meta.accountId)
          : undefined;
        if (!ocid || !account) continue;
        void fetchScheduler(ocid, account.id, { force: true })
          .then(async (scheduler) => {
            const confirmedMonth = monthKey(todayISO());
            const scanKey = `${account.id}:${ocid}:${confirmedMonth}`;
            if (
              needsMonthlyHistory(scheduler) &&
              shouldScanMonthly(character, confirmedMonth) &&
              !monthlyScanInflight.has(scanKey)
            ) {
              monthlyScanInflight.add(scanKey);
              try {
                const evidence = await findMonthlyEvidenceThisMonth(
                  ocid,
                  account.id,
                  confirmedMonth,
                  todayISO(),
                );
                setState((prev) => {
                  const index = prev.characters.findIndex(
                    (item) =>
                      item.meta?.ocid === ocid &&
                      item.meta?.accountId === account.id,
                  );
                  if (index < 0) return prev;
                  const current = prev.characters[index];
                  const scanned = {
                    ...current,
                    monthlyScanMonth: confirmedMonth,
                  };
                  const next = evidence
                    ? applyMonthlyEvidence(scanned, evidence, confirmedMonth)
                    : scanned;
                  const characters = [...prev.characters];
                  characters[index] = next;
                  return { ...prev, characters };
                });
              } finally {
                monthlyScanInflight.delete(scanKey);
              }
            }
            if (!schedulerReliability(scheduler).truncated) return;
            retryTimers.push(
              window.setTimeout(() => {
                void fetchScheduler(ocid, account.id, { force: true }).catch(
                  () => {},
                );
              }, 3_000),
            );
          })
          .catch(() => {
            // 조회 실패 시 기존 상태를 유지하고 다음 화면 복귀 때 재시도한다.
          });
      }
    };

    refresh();
    let lastRefresh = Date.now();
    const refreshOnReturn = () => {
      if (document.visibilityState === "hidden") return;
      setToday(todayISO());
      if (Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      refresh();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identitiesReady, linkedKey]);

  const selectedSchedule = selected?.meta?.ocid
    ? schedules[selected.meta.ocid]
    : undefined;
  const clearedBossKeys = useMemo(() => {
    const keys = new Set<string>();
    if (selectedSchedule && schedulerReliability(selectedSchedule).weeklyBosses) {
      for (const key of completedBossKeys(selectedSchedule)) keys.add(key);
    }
    if (selected?.monthlyConfirmedMonth === month) {
      for (const entry of selected.entries) {
        if (BOSS_MAP.get(entry.bossId)?.reset === "monthly") {
          keys.add(bossKey(entry.bossId, entry.difficulty));
        }
      }
    }
    if (keys.size === 0 && !selectedSchedule) return null;
    return keys.size > 0 || selectedSchedule ? keys : null;
  }, [month, selected, selectedSchedule]);

  // 이번 주 수익 기록 갱신 (캐릭터가 하나도 없을 땐 기존 기록을 덮지 않는다)
  useEffect(() => {
    if (state.characters.length === 0) return;
    setHistory(
      recordCurrentWeek({
        revenue: summary.weeklyRevenue,
        crystals: summary.weeklyCrystalCount,
        // 누적 스냅샷으로 저장하고 통계에서는 월별 증가분만 한 번 집계한다.
        monthlyBossRevenue: summary.monthlyBossRevenue,
        characterCount: state.characters.length,
      }),
    );
  }, [summary, state.characters.length]);

  // 미확정 지난 주는 스케줄러 과거 조회로 한 번만 확정한다
  useEffect(() => {
    if (state.characters.length === 0) return;
    let cancelled = false;
    void finalizePendingWeeks(state.characters).then((result) => {
      if (!cancelled && result.finalizedWeeks.length > 0) {
        setHistory(result.records);
      }
    });
    return () => {
      cancelled = true;
    };
    // linkedKey 변경 시에만 (캐릭터/연동 구성이 바뀔 때)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedKey]);

  const addCharacter = () => {
    setState((prev) => {
      if (prev.characters.length >= RULES.maxCharacters) return prev;
      const character: Character = {
        id: newId(),
        name: `캐릭터 ${prev.characters.length + 1}`,
        entries: [],
      };
      return {
        characters: [...prev.characters, character],
        selectedId: character.id,
      };
    });
  };

  const addImportedCharacters = (
    list: { name: string; meta: CharacterMeta }[],
  ) => {
    setState((prev) => {
      const room = RULES.maxCharacters - prev.characters.length;
      const toAdd = list.slice(0, room).map(
        ({ name, meta }): Character => ({
          id: newId(),
          name,
          entries: [],
          meta,
        }),
      );
      if (toAdd.length === 0) return prev;
      return {
        characters: [...prev.characters, ...toAdd],
        selectedId: toAdd[toAdd.length - 1].id,
      };
    });
  };

  const removeCharacter = (id: string) => {
    setState((prev) => {
      const characters = prev.characters.filter((c) => c.id !== id);
      const selectedId =
        prev.selectedId === id ? (characters[0]?.id ?? null) : prev.selectedId;
      return { characters, selectedId };
    });
    setTodo((prev) => forgetCharacter(prev, id));
  };

  /** 계정 명단에서 고른 캐릭터를 추가한다 (이미 있으면 식별자만 갱신) */
  const addAccountCharacters = (
    accountId: string,
    list: LookupCharacter[],
  ) => {
    setState((prev) => {
      const characters = prev.characters.map((character) => {
        const live = list.find(
          (item) =>
            (character.meta?.ocid && item.ocid === character.meta.ocid) ||
            item.name === character.name,
        );
        return live
          ? applyLiveIdentity(character, live, accountId)
          : character;
      });
      const existingNames = new Set(characters.map((c) => c.name));
      const existingOcids = new Set(
        characters.map((c) => c.meta?.ocid).filter(Boolean),
      );
      const room = Math.max(0, RULES.maxCharacters - characters.length);
      const toAdd = list
        .filter(
          (item) =>
            !existingNames.has(item.name) && !existingOcids.has(item.ocid),
        )
        .slice(0, room)
        .map(
          (item): Character => ({
            id: newId(),
            name: item.name,
            entries: [],
            meta: {
              world: item.world,
              job: item.job,
              level: item.level,
              image: item.image,
              ocid: item.ocid,
              ...(accountId ? { accountId } : {}),
            },
          }),
        );
      const all = [...characters, ...toAdd];
      return { characters: all, selectedId: prev.selectedId ?? all[0]?.id ?? null };
    });
    // 계정 목록 API에는 이미지가 없어 캐릭터 기본 정보로 아바타를 채운다 (실패해도 무방)
    for (const item of list.filter((c) => !c.image)) {
      void searchCharacter(item.name)
        .then((info) =>
          setState((prev) => ({
            ...prev,
            characters: prev.characters.map((c) =>
              c.name === item.name && !c.meta?.image
                ? { ...c, meta: { ...c.meta, image: info.image } }
                : c,
            ),
          })),
        )
        .catch(() => {});
    }
  };

  const addAccount = async (label: string, apiKey: string) => {
    const { account } = await createServerAccount(label, apiKey);
    setTodo((prev) => ({ ...prev, accounts: [...prev.accounts, account] }));
    return account;
  };

  const removeAccount = async (id: string) => {
    await deleteServerAccount(id);
    setTodo((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a.id !== id),
    }));
  };

  const refreshSchedules = async () => {
    const accounts = new Set(todo.accounts.map((a) => a.id));
    const targets = state.characters.filter(
      (c) =>
        c.meta?.ocid &&
        c.meta.accountId &&
        accounts.has(c.meta.accountId),
    );
    if (targets.length === 0) return;
    setRefreshing(true);
    setScheduleErrors({});
    await Promise.all(
      targets.map((character) =>
        fetchScheduler(character.meta!.ocid!, character.meta!.accountId!, {
          force: true,
        }).catch((error: unknown) =>
          setScheduleErrors((prev) => ({
            ...prev,
            [character.meta!.ocid!]:
              error instanceof Error ? error.message : "조회 실패",
          })),
        ),
      ),
    );
    setRefreshing(false);
  };

  const toggleCheck = (itemId: string, characterId: string, itemWeek: string) => {
    const key = `${itemId}:${characterId}`;
    setTodo((prev) => {
      const checks = { ...prev.checks };
      if (checks[key] === itemWeek) delete checks[key];
      else checks[key] = itemWeek;
      return { ...prev, checks };
    });
  };

  const addTodoItem = (label: string, resetDay: ResetDay) => {
    setTodo((prev) => ({
      ...prev,
      items: [...prev.items, { id: `ti-${newId()}`, label, resetDay }],
    }));
  };

  const removeTodoItem = (itemId: string) => {
    setTodo((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
      disabledItems: Object.fromEntries(
        Object.entries(prev.disabledItems).map(([charId, ids]) => [
          charId,
          ids.filter((id) => id !== itemId),
        ]),
      ),
    }));
  };

  const toggleItemForCharacter = (characterId: string, itemId: string) => {
    setTodo((prev) => {
      const current = prev.disabledItems[characterId] ?? [];
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
      return {
        ...prev,
        disabledItems: { ...prev.disabledItems, [characterId]: next },
      };
    });
  };

  const duplicateCharacter = (id: string) => {
    setState((prev) => {
      if (prev.characters.length >= RULES.maxCharacters) return prev;
      const index = prev.characters.findIndex((c) => c.id === id);
      if (index < 0) return prev;
      const source = prev.characters[index];
      const copy: Character = {
        id: newId(),
        name: `${source.name} 복사`,
        entries: source.entries.map((e) => ({ ...e })),
        partyPrefs: source.partyPrefs ? { ...source.partyPrefs } : undefined,
        meta: source.meta,
      };
      const characters = [...prev.characters];
      characters.splice(index + 1, 0, copy);
      return { characters, selectedId: copy.id };
    });
  };

  const renameCharacter = (id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === id ? { ...c, name } : c,
      ),
    }));
  };

  const selectCharacter = (id: string) =>
    setState((prev) => ({ ...prev, selectedId: id }));

  const updateSelected = (updater: (c: Character) => Character) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === prev.selectedId ? updater(c) : c,
      ),
    }));
  };

  const toggleEntry = (bossId: string, difficulty: Difficulty) => {
    // 게임 규칙: 주간 보스는 캐릭터당 12개까지만 처치 가능.
    // 이미 12개 선택된 상태에서 "새" 주간 보스를 추가하려 하면 모달로 안내한다.
    // (선택된 보스의 난이도 변경이나 해제는 허용)
    const current = state.characters.find((c) => c.id === state.selectedId);
    if (current && BOSS_MAP.get(bossId)?.reset === "weekly") {
      const scoped = dropStaleWeekly(current, week);
      const alreadySelected = scoped.entries.some((e) => e.bossId === bossId);
      const weeklyCount = weeklySelectionCount(scoped);
      if (
        !alreadySelected &&
        weeklyCount >= RULES.weeklyBossSellLimitPerCharacter
      ) {
        setShowWeeklyLimit(true);
        return;
      }
    }

    updateSelected((character) =>
      toggleBossSelection(character, bossId, difficulty, month, week),
    );
  };

  const applyPreset = (preset: BossPreset) => {
    updateSelected((c) => {
      // 일일/월간 보스 설정은 유지하고 주간 보스만 프리셋으로 교체
      const nonWeekly = c.entries.filter(
        (e) => BOSS_MAP.get(e.bossId)?.reset !== "weekly",
      );
      let weeklyByWeek = c.weeklyByWeek;
      if (c.weeklyConfirmedWeek && c.weeklyConfirmedWeek !== week) {
        weeklyByWeek = rememberWeekly(
          weeklyByWeek,
          c.weeklyConfirmedWeek,
          weeklyEntriesOf(c),
          week,
        );
      }
      const partyPrefs = { ...c.partyPrefs };
      const weekly: BossEntry[] = preset.entries.map(
        ({ bossId, difficulty, partySize }) => {
          const prev = c.entries.find((e) => e.bossId === bossId);
          const boss = BOSS_MAP.get(bossId);
          const nextPartySize = boss
            ? clampPartySize(boss, difficulty, partySize)
            : partySize;
          partyPrefs[bossId] = nextPartySize;
          return {
            bossId,
            difficulty,
            partySize: nextPartySize,
            clearsPerWeek: prev?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
          };
        },
      );
      return withWeeklyArchive(
        {
          ...c,
          entries: [...nonWeekly, ...weekly],
          partyPrefs,
          weeklyByWeek,
        },
        week,
        weekly,
      );
    });
  };

  const updateEntry = (bossId: string, patch: Partial<BossEntry>) => {
    updateSelected((c) => {
      const entries = c.entries.map((e) => {
        if (e.bossId !== bossId) return e;
        const next = { ...e, ...patch };
        const boss = BOSS_MAP.get(bossId);
        return boss
          ? {
              ...next,
              partySize: clampPartySize(
                boss,
                next.difficulty,
                next.partySize,
              ),
            }
          : next;
      });
      // 파티 인원 변경은 주차 리셋과 무관하게 선호로 별도 저장한다
      if (patch.partySize != null) {
        const nextEntry = entries.find((e) => e.bossId === bossId);
        return {
          ...c,
          entries,
          partyPrefs: {
            ...c.partyPrefs,
            [bossId]: nextEntry?.partySize ?? patch.partySize,
          },
        };
      }
      return { ...c, entries };
    });
  };

  const isHome = route.view === "home";

  return (
    <div className="app">
      <header className="app-header">
        <div className="title-block">
          <h1
            className={!isHome ? "clickable" : undefined}
            onClick={!isHome ? gotoHome : undefined}
          >
            메이플 보스 결정석 수익 계산기
          </h1>
          <p className="subtitle">
            강렬한 힘의 결정 주간·월간 수익 계산 — 공식 공지 기준 최신 가격 반영
          </p>
        </div>
        <div className="header-actions">
          <HeaderSearch />
          {isHome && conflicts.length > 0 && (
            <button
              className="btn warn-chip"
              onClick={() => setShowConflicts(true)}
            >
              API와 다른 캐릭터 {conflicts.length}명 — 비교
            </button>
          )}
          {isHome && (
            <>
              <a
                className="source-badge"
                href={DATA_SOURCE.url}
                target="_blank"
                rel="noreferrer"
                title="가격 출처 공지 열기"
              >
                {DATA_SOURCE.label}
              </a>
              <button className="btn ghost" onClick={() => setShowPrices(true)}>
                결정석 가격표
              </button>
            </>
          )}
        </div>
      </header>

      <MainNav route={route} />

      {route.view === "character" ? (
        <CharacterPage
          name={route.name}
          initialTab={route.tab}
          onAddToCalc={(c) => addImportedCharacters([c])}
        />
      ) : route.view === "lookup" ? (
        <LookupPage />
      ) : route.view === "todo" ? (
        <TodoPage
          characters={state.characters}
          todo={todo}
          verifications={verifications}
          schedules={schedules}
          scheduleErrors={scheduleErrors}
          refreshing={refreshing}
          week={week}
          conflictCount={conflicts.length}
          onOpenConflicts={() => setShowConflicts(true)}
          onRefresh={() => void refreshSchedules()}
          onAddAccount={addAccount}
          onRemoveAccount={removeAccount}
          onAddCharacters={addAccountCharacters}
          onRemoveCharacter={removeCharacter}
          onSelectCharacter={selectCharacter}
          onToggleCheck={toggleCheck}
          onAddItem={addTodoItem}
          onRemoveItem={removeTodoItem}
          onToggleItemForCharacter={toggleItemForCharacter}
        />
      ) : route.view === "stats" ? (
        <StatsPage records={visibleHistory(history)} />
      ) : route.view === "potential" ? (
        <PotentialPage characters={state.characters} />
      ) : (
        <>
          <SummaryBar summary={summary} accountLabels={accountLabels} />

          <main className="layout">
            <CharacterSidebar
              characters={state.characters}
              summaries={summary.characters}
              verifications={verifications}
              monthlySyncStatus={monthlySyncStatus}
              selectedId={state.selectedId}
              onAdd={addCharacter}
              onImport={() => setShowImport(true)}
              onSelect={selectCharacter}
              onRemove={removeCharacter}
              onDuplicate={duplicateCharacter}
            />
            <section className="board">
              {selected ? (
                <BossPanel
                  character={selected}
                  summary={selectedSummary}
                  today={today}
                  clearedBossKeys={clearedBossKeys}
                  monthlyChecking={
                    monthlySyncStatus[selected.id] === "checking"
                  }
                  onToggle={toggleEntry}
                  onUpdateEntry={updateEntry}
                  onApplyPreset={applyPreset}
                  onRename={(name) => renameCharacter(selected.id, name)}
                  verification={verifications[selected.id]}
                />
              ) : (
                <div className="empty-board">
                  <h2>캐릭터를 추가해주세요</h2>
                  <p>
                    캐릭터를 추가한 뒤 잡는 보스와 난이도, 파티 인원을 설정하면
                    <br />
                    주간/월간 결정석 수익이 자동으로 계산됩니다.
                  </p>
                  <button className="btn primary" onClick={addCharacter}>
                    캐릭터 추가
                  </button>
                </div>
              )}
            </section>
          </main>

          <RevenueHistory
            records={visibleHistory(history)}
            monthly={monthlyOverview}
          />

          <footer className="app-footer">
            <h3>계산 기준</h3>
            <ul>
              <li>
                결정석 가격:{" "}
                <a href={DATA_SOURCE.url} target="_blank" rel="noreferrer">
                  {DATA_SOURCE.label}
                </a>{" "}
                기준. 주간 보스는 2026-09-17, 검은 마법사는 2026-10-01 적용
                가격이 날짜에 맞춰 자동 반영됩니다. (데이터 확인일{" "}
                {DATA_SOURCE.verifiedAt})
              </li>
              <li>
                파티 격파 시 결정석 가격은 입장 인원수로 1/n 분배되며 소수점은
                버립니다.
              </li>
              <li>
                주간 보스 결정은 캐릭터당 주{" "}
                {RULES.weeklyBossSellLimitPerCharacter}개까지만 판매 가능하므로,
                초과 선택 시 가격 높은 순으로{" "}
                {RULES.weeklyBossSellLimitPerCharacter}개만 집계합니다.
              </li>
              <li>
                결정석은 계정×월드당 주 {RULES.worldWeeklySellLimit}개까지만
                판매 가능하므로, 그룹별 초과 생산 시 가격 높은 순으로{" "}
                {RULES.worldWeeklySellLimit}개만 집계합니다. 계정을 여러 개
                연동한 경우 제한은 계정마다 따로 적용됩니다.
              </li>
              <li>
                월간 수익 = 주간 수익 × {RULES.weeksPerMonth} + 월간 보스(검은
                마법사) 수익. 월간 보스 결정은 주간 판매 제한 계산에서
                제외했습니다.
              </li>
            </ul>
            <p className="disclaimer">
              본 도구는 팬 제작 계산기로 넥슨코리아와 무관합니다. 실제 판매
              가격은 게임 내 NPC 콜렉터 기준이 우선합니다.
            </p>
          </footer>

          {showPrices && (
            <PriceTable today={today} onClose={() => setShowPrices(false)} />
          )}
          {showWeeklyLimit && (
            <LimitModal onClose={() => setShowWeeklyLimit(false)} />
          )}
          {showImport && (
            <ImportModal
              remainingSlots={RULES.maxCharacters - state.characters.length}
              existingNames={state.characters.map((c) => c.name)}
              onAdd={addImportedCharacters}
              onClose={() => setShowImport(false)}
            />
          )}
        </>
      )}

      {showConflicts && conflicts.length > 0 && (
        <ConflictModal
          conflicts={conflicts}
          week={week}
          onKeepManual={(id) => resolveConflicts(keepManualSelection, id)}
          onAdoptApi={(id) => resolveConflicts(adoptApiSelection, id)}
          onKeepAll={() => resolveConflicts(keepManualSelection)}
          onAdoptAll={() => resolveConflicts(adoptApiSelection)}
          onClose={() => setShowConflicts(false)}
        />
      )}
    </div>
  );
}
