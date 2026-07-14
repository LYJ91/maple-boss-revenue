import { useEffect, useMemo, useState } from 'react';
import type { BossEntry, Character, CharacterMeta, Difficulty } from './types';
import { BOSS_MAP, DATA_SOURCE, RULES } from './data/crystalData';
import type { BossPreset } from './data/presets';
import { computeAccount } from './lib/calc';
import { loadState, saveState, type AppState } from './lib/storage';
import { loadTodoState } from './lib/todoStorage';
import {
  completedBossKeys,
  entriesEqual,
  entriesFromSchedule,
  fetchScheduler,
  type SchedulerState,
} from './lib/scheduler';
import { todayISO } from './lib/format';
import { loadHistory, recordCurrentWeek, type WeekRecord } from './lib/history';
import { SummaryBar } from './components/SummaryBar';
import { RevenueHistory } from './components/RevenueHistory';
import { CharacterSidebar } from './components/CharacterSidebar';
import { BossPanel } from './components/BossPanel';
import { PriceTable } from './components/PriceTable';
import { LimitModal } from './components/LimitModal';
import { ImportModal } from './components/ImportModal';
import { CharacterPage } from './pages/CharacterPage';
import { TodoPage } from './pages/TodoPage';
import {
  gotoCharacter,
  gotoHome,
  gotoLookup,
  gotoTodo,
  useRoute,
  type Route,
} from './lib/router';

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `c-${Date.now().toString(36)}-${idCounter}`;
}

function HeaderSearch() {
  const [term, setTerm] = useState('');
  const submit = () => {
    if (term.trim()) {
      gotoCharacter(term);
      setTerm('');
    }
  };
  return (
    <div className="header-search">
      <input
        className="text-input sm"
        placeholder="캐릭터 검색"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        aria-label="캐릭터 검색"
      />
      <button className="btn sm" onClick={submit} disabled={!term.trim()}>
        검색
      </button>
    </div>
  );
}

type MainTab = 'calc' | 'equip' | 'todo';

function activeTab(route: Route): MainTab {
  if (route.view === 'todo') return 'todo';
  if (route.view === 'character' || route.view === 'lookup') return 'equip';
  return 'calc';
}

function MainNav({ route }: { route: Route }) {
  const current = activeTab(route);
  const tabs: { key: MainTab; label: string; go(): void }[] = [
    { key: 'todo', label: '체크리스트', go: gotoTodo },
    { key: 'calc', label: '보스수익', go: gotoHome },
    { key: 'equip', label: '장비확인', go: gotoLookup },
  ];
  return (
    <nav className="main-nav" aria-label="주요 기능">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={'main-nav-tab' + (current === t.key ? ' on' : '')}
          onClick={t.go}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function LookupPage() {
  const [term, setTerm] = useState('');
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
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
        <button className="btn primary" onClick={submit} disabled={!term.trim()}>
          검색
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const [state, setState] = useState<AppState>(loadState);
  const [showPrices, setShowPrices] = useState(false);
  const [showWeeklyLimit, setShowWeeklyLimit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  /** 캐릭터 id → 이번 주 스케줄러 현황 (체크리스트에서 연동된 캐릭터만) */
  const [schedules, setSchedules] = useState<Record<string, SchedulerState>>({});
  const [history, setHistory] = useState<WeekRecord[]>(loadHistory);
  const today = useMemo(todayISO, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // 보스수익 탭 진입 시 체크리스트 캐릭터를 목록에 동기화 (ocid/이름 기준)
  useEffect(() => {
    if (route.view !== 'home') return;
    const todo = loadTodoState();
    setState((prev) => {
      let changed = false;
      // 이미 있는 캐릭터에는 ocid/계정 메타를 보강해 API 연동을 살린다
      const characters = prev.characters.map((c) => {
        const t = todo.characters.find(
          (tc) =>
            (c.meta?.ocid && tc.meta?.ocid === c.meta.ocid) || tc.name === c.name,
        );
        if (
          t?.meta?.ocid &&
          (c.meta?.ocid !== t.meta.ocid || c.meta?.accountId !== t.meta.accountId)
        ) {
          changed = true;
          return { ...c, meta: { ...c.meta, ...t.meta } };
        }
        return c;
      });
      const existingOcids = new Set(
        characters.map((c) => c.meta?.ocid).filter(Boolean),
      );
      const existingNames = new Set(characters.map((c) => c.name));
      const room = Math.max(0, RULES.maxCharacters - characters.length);
      const toAdd = todo.characters
        .filter(
          (tc) =>
            !(tc.meta?.ocid && existingOcids.has(tc.meta.ocid)) &&
            !existingNames.has(tc.name),
        )
        .slice(0, room)
        .map(
          (tc): Character => ({
            id: newId(),
            name: tc.name,
            entries: [],
            meta: tc.meta,
          }),
        );
      if (toAdd.length > 0) changed = true;
      if (!changed) return prev;
      const all = [...characters, ...toAdd];
      return {
        characters: all,
        selectedId: prev.selectedId ?? all[0]?.id ?? null,
      };
    });
  }, [route.view]);

  const summary = useMemo(
    () => computeAccount(state.characters, BOSS_MAP, today),
    [state.characters, today],
  );

  // 판매 제한 그룹 표시용 계정 이름 (체크리스트에서 등록한 계정)
  const accountLabels = useMemo(
    () => new Map(loadTodoState().accounts.map((a) => [a.id, a.label])),
    // 보스수익 탭에 들어올 때마다 최신 계정 목록을 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route.view],
  );

  const selected =
    state.characters.find((c) => c.id === state.selectedId) ?? null;
  const selectedSummary = selected
    ? summary.characters.find((s) => s.id === selected.id)
    : undefined;

  // 연동 캐릭터 전체의 이번 주 처치 현황을 조회해 보스 선택(entries)에 자동 반영한다.
  // 이렇게 해야 "주간 보스 n/12"와 총 수익이 실제 처치 기준으로 계산된다.
  const linkedKey = state.characters
    .map((c) => `${c.id}:${c.meta?.ocid ?? ''}:${c.meta?.accountId ?? ''}`)
    .join('|');
  useEffect(() => {
    if (route.view !== 'home') return;
    const accounts = new Map(loadTodoState().accounts.map((a) => [a.id, a]));
    let cancelled = false;

    const applyCleared = (charId: string, st: SchedulerState) => {
      setState((prev) => {
        const index = prev.characters.findIndex((c) => c.id === charId);
        if (index < 0) return prev;
        const character = prev.characters[index];
        const next = entriesFromSchedule(character.entries, st);
        if (entriesEqual(character.entries, next)) return prev;
        const characters = [...prev.characters];
        characters[index] = { ...character, entries: next };
        return { ...prev, characters };
      });
    };

    for (const c of state.characters) {
      const ocid = c.meta?.ocid;
      const account = c.meta?.accountId ? accounts.get(c.meta.accountId) : undefined;
      if (!ocid || !account) continue;
      const charId = c.id;
      fetchScheduler(ocid, account.apiKey)
        .then((st) => {
          if (cancelled) return;
          setSchedules((prev) => ({ ...prev, [charId]: st }));
          applyCleared(charId, st);
        })
        .catch(() => {
          // 조회 실패 시 처치 현황 반영만 생략한다
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.view, linkedKey]);

  const selectedSchedule = selected ? schedules[selected.id] : undefined;
  const clearedBossKeys = useMemo(
    () => (selectedSchedule ? completedBossKeys(selectedSchedule) : null),
    [selectedSchedule],
  );

  // 이번 주 수익 기록 갱신 (캐릭터가 하나도 없을 땐 기존 기록을 덮지 않는다)
  useEffect(() => {
    if (route.view !== 'home' || state.characters.length === 0) return;
    setHistory(
      recordCurrentWeek({
        revenue: summary.weeklyRevenue,
        crystals: summary.weeklyCrystalCount,
        monthlyBossRevenue: summary.monthlyBossRevenue,
        characterCount: state.characters.length,
      }),
    );
  }, [route.view, summary, state.characters.length]);

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

  const addImportedCharacters = (list: { name: string; meta: CharacterMeta }[]) => {
    setState((prev) => {
      const room = RULES.maxCharacters - prev.characters.length;
      const toAdd = list.slice(0, room).map(
        ({ name, meta }): Character => ({ id: newId(), name, entries: [], meta }),
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
      };
      const characters = [...prev.characters];
      characters.splice(index + 1, 0, copy);
      return { characters, selectedId: copy.id };
    });
  };

  const renameCharacter = (id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === id ? { ...c, name } : c)),
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
    if (current && BOSS_MAP.get(bossId)?.reset === 'weekly') {
      const alreadySelected = current.entries.some((e) => e.bossId === bossId);
      const weeklyCount = current.entries.filter(
        (e) => BOSS_MAP.get(e.bossId)?.reset === 'weekly',
      ).length;
      if (!alreadySelected && weeklyCount >= RULES.weeklyBossSellLimitPerCharacter) {
        setShowWeeklyLimit(true);
        return;
      }
    }

    updateSelected((c) => {
      const existing = c.entries.find((e) => e.bossId === bossId);
      if (existing && existing.difficulty === difficulty) {
        // 같은 난이도를 다시 누르면 해제
        return { ...c, entries: c.entries.filter((e) => e.bossId !== bossId) };
      }
      const entry: BossEntry = {
        bossId,
        difficulty,
        partySize: existing?.partySize ?? 1,
        clearsPerWeek: existing?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
      };
      const entries = existing
        ? c.entries.map((e) => (e.bossId === bossId ? entry : e))
        : [...c.entries, entry];
      return { ...c, entries };
    });
  };

  const applyPreset = (preset: BossPreset) => {
    updateSelected((c) => {
      // 일일/월간 보스 설정은 유지하고 주간 보스만 프리셋으로 교체
      const nonWeekly = c.entries.filter(
        (e) => BOSS_MAP.get(e.bossId)?.reset !== 'weekly',
      );
      const weekly: BossEntry[] = preset.entries.map(({ bossId, difficulty }) => {
        const prev = c.entries.find((e) => e.bossId === bossId);
        return {
          bossId,
          difficulty,
          partySize: prev?.partySize ?? 1,
          clearsPerWeek: prev?.clearsPerWeek ?? RULES.maxDailyClearsPerWeek,
        };
      });
      return { ...c, entries: [...nonWeekly, ...weekly] };
    });
  };

  const updateEntry = (bossId: string, patch: Partial<BossEntry>) => {
    updateSelected((c) => ({
      ...c,
      entries: c.entries.map((e) =>
        e.bossId === bossId ? { ...e, ...patch } : e,
      ),
    }));
  };

  const isHome = route.view === 'home';

  return (
    <div className="app">
      <header className="app-header">
        <div className="title-block">
          <h1 className={!isHome ? 'clickable' : undefined} onClick={!isHome ? gotoHome : undefined}>
            메이플 보스 결정석 수익 계산기
          </h1>
          <p className="subtitle">
            강렬한 힘의 결정 주간·월간 수익 계산 — 공식 공지 기준 최신 가격 반영
          </p>
        </div>
        <div className="header-actions">
          <HeaderSearch />
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

      {route.view === 'character' ? (
        <CharacterPage
          name={route.name}
          initialTab={route.tab}
          onAddToCalc={(c) => addImportedCharacters([c])}
        />
      ) : route.view === 'lookup' ? (
        <LookupPage />
      ) : route.view === 'todo' ? (
        <TodoPage />
      ) : (
        <>
      <SummaryBar summary={summary} accountLabels={accountLabels} />

      <main className="layout">
        <CharacterSidebar
          characters={state.characters}
          summaries={summary.characters}
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
              onToggle={toggleEntry}
              onUpdateEntry={updateEntry}
              onApplyPreset={applyPreset}
              onRename={(name) => renameCharacter(selected.id, name)}
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

      <RevenueHistory records={history} />

      <footer className="app-footer">
        <h3>계산 기준</h3>
        <ul>
          <li>
            결정석 가격:{' '}
            <a href={DATA_SOURCE.url} target="_blank" rel="noreferrer">
              메이플스토리 공식 업데이트 공지 (2026-06-18)
            </a>{' '}
            기준. 검은 마법사는 2026-07-01 적용 가격이 날짜에 맞춰 자동
            반영됩니다. (데이터 확인일 {DATA_SOURCE.verifiedAt})
          </li>
          <li>파티 격파 시 결정석 가격은 입장 인원수로 1/n 분배되며 소수점은 버립니다.</li>
          <li>
            주간 보스 결정은 캐릭터당 주{' '}
            {RULES.weeklyBossSellLimitPerCharacter}개까지만 판매 가능하므로, 초과
            선택 시 가격 높은 순으로 {RULES.weeklyBossSellLimitPerCharacter}개만
            집계합니다.
          </li>
          <li>
            결정석은 계정×월드당 주 {RULES.worldWeeklySellLimit}개까지만 판매
            가능하므로, 그룹별 초과 생산 시 가격 높은 순으로{' '}
            {RULES.worldWeeklySellLimit}개만 집계합니다. 계정을 여러 개 연동한
            경우 제한은 계정마다 따로 적용됩니다.
          </li>
          <li>
            월간 수익 = 주간 수익 × {RULES.weeksPerMonth} + 월간 보스(검은 마법사)
            수익. 월간 보스 결정은 주간 판매 제한 계산에서 제외했습니다.
          </li>
        </ul>
        <p className="disclaimer">
          본 도구는 팬 제작 계산기로 넥슨코리아와 무관합니다. 실제 판매 가격은
          게임 내 NPC 콜렉터 기준이 우선합니다.
        </p>
      </footer>

      {showPrices && <PriceTable today={today} onClose={() => setShowPrices(false)} />}
      {showWeeklyLimit && <LimitModal onClose={() => setShowWeeklyLimit(false)} />}
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
    </div>
  );
}
