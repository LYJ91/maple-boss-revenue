import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  calculatorStateEqual,
  mergeCalculatorState,
} from "../lib/calculatorMerge";
import { pushMergedCalculator } from "../lib/calculatorSync";
import {
  loadState,
  normalizeAppState,
  readCalculatorBase,
  writeCalculatorBase,
  writeStateCache,
  type AppState,
} from "../lib/storage";
import {
  emptyTodoState,
  loadTodoState,
  normalizeTodoState,
  writeTodoCache,
  type LoadedTodoState,
  type TodoState,
} from "../lib/todoStorage";
import { unifyCharacters } from "../lib/unifyState";
import {
  loadHistory,
  writeHistoryCache,
  type WeekRecord,
} from "../lib/history";
import {
  createServerAccount,
  getRemoteHistory,
  getRemoteState,
  HISTORY_EVENT,
  putRemoteHistory,
  putRemoteState,
  SYNC_EVENT,
  type SyncScope,
} from "../lib/sync";
import {
  backupLocalData,
  hasCalculatorData,
  hasHistoryData,
  hasTodoData,
  markCacheOwner,
  readCacheOwner,
  redactTodoKeys,
  toStoredTodoState,
  type LegacyTodoState,
} from "../lib/localMigration";
import { authClient } from "../lib/auth";

interface SyncContextValue {
  status: "loading" | "saved" | "saving" | "offline" | "error";
  message?: string;
}
const SyncContext = createContext<SyncContextValue>({ status: "loading" });
export const useSyncStatus = () => useContext(SyncContext);

export function UserStateProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const warmStart = useRef(readCacheOwner() === userId);
  const [ready, setReady] = useState(warmStart.current);
  const [contentVersion, setContentVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncContextValue>({
    status: "loading",
  });
  const revisions = useRef<Record<SyncScope, number>>({
    calculator: 0,
    todo: 0,
  });
  const baselines = useRef<Record<SyncScope, string>>(
    warmStart.current
      ? {
          calculator: JSON.stringify(loadState()),
          todo: JSON.stringify(
            redactTodoKeys(loadTodoState() as LegacyTodoState),
          ),
        }
      : { calculator: "", todo: "" },
  );
  const timers = useRef<Partial<Record<SyncScope, number>>>({});
  const pending = useRef<Partial<Record<SyncScope, unknown>>>({});
  /** scope별 저장 요청을 직렬화해 같은 revision으로 동시에 PUT하지 않게 한다. */
  const saving = useRef<Partial<Record<SyncScope, boolean>>>({});
  const channel = useRef<BroadcastChannel | null>(null);
  const rehydrate = useRef<() => void>(() => undefined);
  /** 마지막으로 서버와 맞춘 calculator. 없으면 아직 기준이 없다. */
  const baseState = useRef<AppState | null>(readCalculatorBase(userId));
  const hydrated = useRef(false);
  const pullGate = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const runHydrate = () =>
      void hydrate().catch((error) => {
        if (!cancelled) {
          if (warmStart.current) {
            hydrated.current = true;
            setSyncStatus({
              status: "offline",
              message: "저장된 화면을 표시 중이며 연결되면 다시 동기화합니다.",
            });
            setReady(true);
          } else {
            setSyncStatus({
              status: "error",
              message:
                error instanceof Error ? error.message : "동기화 초기화 실패",
            });
            setReady(false);
          }
        }
      });
    rehydrate.current = runHydrate;
    runHydrate();
    async function hydrate() {
      const localCalculator = loadState();
      const localTodo = loadTodoState() as LegacyTodoState;
      const localHistory = loadHistory();
      const cacheOwner = readCacheOwner();
      const localSnapshot = {
        calculator: JSON.stringify(localCalculator),
        todo: JSON.stringify(redactTodoKeys(localTodo)),
        history: JSON.stringify(localHistory),
      };
      const [remoteCalc, remoteTodo, remoteHistory] = await Promise.all([
        getRemoteState("calculator"),
        getRemoteState<TodoState>("todo"),
        getRemoteHistory(),
      ]);
      if (cancelled) return;

      const remoteIsEmpty =
        !remoteCalc.exists &&
        !remoteTodo.exists &&
        (remoteHistory.records as WeekRecord[]).length === 0;
      const localHasData =
        hasCalculatorData(localCalculator) ||
        hasTodoData(localTodo) ||
        hasHistoryData(localHistory);
      const isLegacyCache = cacheOwner === null;
      let importLocal = remoteIsEmpty && cacheOwner === userId;
      if (isLegacyCache && localHasData) {
        backupLocalData(localCalculator, localTodo, localHistory);
      }
      if (remoteIsEmpty && isLegacyCache && localHasData) {
        importLocal = window.confirm(
          "이 브라우저에 로그인 전부터 저장된 데이터가 있습니다.\n이 데이터를 현재 로그인 계정으로 가져올까요?\n\n취소하면 이 계정은 빈 상태로 시작하며, 기존 데이터는 브라우저 백업에 보존됩니다.",
        );
      }

      let calculator = importLocal
        ? localCalculator
        : { characters: [], selectedId: null };
      if (remoteCalc.exists && remoteCalc.payload) {
        calculator = remoteCalc.payload as typeof localCalculator;
        revisions.current.calculator = remoteCalc.revision;
      } else {
        const saved = await putRemoteState("calculator", calculator, 0);
        revisions.current.calculator = saved.revision;
        baseState.current = normalizeAppState(calculator);
        writeCalculatorBase(userId, baseState.current);
      }

      let todo: LoadedTodoState = importLocal
        ? redactTodoKeys(localTodo)
        : emptyTodoState();
      if (remoteTodo.exists && remoteTodo.payload) {
        todo = normalizeTodoState(remoteTodo.payload);
        revisions.current.todo = remoteTodo.revision;
      } else {
        if (importLocal && hasTodoData(localTodo)) {
          todo = await migrateAccounts(localTodo);
        }
        const saved = await putRemoteState(
          "todo",
          toStoredTodoState(todo),
          0,
        );
        revisions.current.todo = saved.revision;
      }

      // 캐릭터 목록을 보스수익 한 곳으로 모은다 (v3 이전 저장분/서버 payload 이관)
      const unified = unifyCharacters(calculator, todo);
      calculator = unified.calculator;
      let storedTodo = unified.todo;
      if (unified.changed) {
        const savedCalc = await putRemoteState(
          "calculator",
          calculator,
          revisions.current.calculator,
        );
        revisions.current.calculator = savedCalc.revision;
        const savedTodo = await putRemoteState(
          "todo",
          storedTodo,
          revisions.current.todo,
        );
        revisions.current.todo = savedTodo.revision;
      }

      const remoteRecords = remoteHistory.records as WeekRecord[];
      const effectiveLocalHistory = importLocal ? localHistory : [];
      const history = mergeHistory(remoteRecords, effectiveLocalHistory);
      const remoteByWeek = new Map(
        remoteRecords.map((record) => [record.week, record]),
      );
      await Promise.all(
        history
          .filter(
            (record) =>
              record ===
              effectiveLocalHistory.find((local) => local.week === record.week),
          )
          .filter(
            (record) =>
              JSON.stringify(record) !==
              JSON.stringify(remoteByWeek.get(record.week)),
          )
          .map(putRemoteHistory),
      );
      if (pending.current.todo != null) {
        storedTodo = pending.current.todo as TodoState;
      }
      if (remoteCalc.exists && remoteCalc.payload) {
        const remoteNow = normalizeAppState(calculator);
        const mergeLocal = shouldMergeLocalCalculator({
          cacheOwner,
          userId,
          importDeclined:
            isLegacyCache && localHasData && remoteIsEmpty && !importLocal,
        });
        if (!mergeLocal) {
          calculator = remoteNow;
          delete pending.current.calculator;
          baseState.current = calculator;
          writeCalculatorBase(userId, calculator);
        } else {
          const localNow = normalizeAppState(
            (pending.current.calculator as AppState | undefined) ?? loadState(),
          );
          calculator = mergeCalculatorState(
            baseState.current,
            localNow,
            remoteNow,
          );
          if (calculatorStateEqual(calculator, remoteNow)) {
            delete pending.current.calculator;
            baseState.current = calculator;
            writeCalculatorBase(userId, calculator);
          } else {
            pending.current.calculator = calculator;
          }
        }
      } else if (pending.current.calculator != null && importLocal) {
        calculator = normalizeAppState(pending.current.calculator as AppState);
      } else if (!importLocal) {
        delete pending.current.calculator;
      }
      writeStateCache(calculator);
      writeTodoCache(storedTodo);
      writeHistoryCache(history);
      baselines.current.calculator = JSON.stringify(normalizeAppState(calculator));
      baselines.current.todo = JSON.stringify(storedTodo);
      markCacheOwner(userId);
      hydrated.current = true;
      if (pending.current.calculator != null) {
        void saveScope("calculator");
      }
      setSyncStatus({ status: "saved" });
      setReady(true);
      if (
        warmStart.current &&
        (localSnapshot.calculator !== JSON.stringify(calculator) ||
          localSnapshot.todo !== JSON.stringify(storedTodo) ||
          localSnapshot.history !== JSON.stringify(history))
      ) {
        setContentVersion((version) => version + 1);
      }
    }
    return () => {
      cancelled = true;
      rehydrate.current = () => undefined;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    const onChange = (event: Event) => {
      const { scope, payload } = (
        event as CustomEvent<{ scope: SyncScope; payload: unknown }>
      ).detail;
      const serialized = JSON.stringify(payload);
      if (serialized === baselines.current[scope]) {
        delete pending.current[scope];
        if (timers.current[scope]) {
          clearTimeout(timers.current[scope]);
          delete timers.current[scope];
        }
        return;
      }
      pending.current[scope] = payload;
      // hydrate 전에는 옛 캐시로 서버 문서를 덮지 않는다.
      if (scope === "calculator" && !hydrated.current) return;
      // 저장 중 들어온 변경은 실행 중인 drain 루프가 최신 값으로 이어서 처리한다.
      if (saving.current[scope]) return;
      if (timers.current[scope]) clearTimeout(timers.current[scope]);
      timers.current[scope] = window.setTimeout(
        () => void saveScope(scope),
        700,
      );
    };
    const onHistory = (event: Event) =>
      void putRemoteHistory((event as CustomEvent).detail).catch((error) => {
        if (!handleAuthenticationFailure(error)) {
          setSyncStatus({
            status: "offline",
            message: "주간 기록 재시도 대기",
          });
        }
      });
    const onOnline = () => {
      const scopes = Object.keys(pending.current) as SyncScope[];
      if (scopes.length > 0) {
        for (const scope of scopes) void saveScope(scope);
      } else {
        rehydrate.current();
      }
    };
    const flushCalculator = () => {
      if (!hydrated.current || pending.current.calculator == null) return;
      if (timers.current.calculator) {
        clearTimeout(timers.current.calculator);
        delete timers.current.calculator;
      }
      void saveScope("calculator");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushCalculator();
      else void pullCalculator();
    };
    const onFocus = () => {
      void pullCalculator();
    };
    const onPageHide = () => flushCalculator();
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("maple-user-state");
      channel.current.onmessage = (
        event: MessageEvent<{
          userId: string;
          scope: SyncScope;
          revision: number;
          payload: unknown;
        }>,
      ) => {
        const message = event.data;
        if (!message || message.userId !== userId) return;
        if (pending.current[message.scope] != null) {
          setSyncStatus({
            status: "error",
            message: "다른 탭의 변경과 현재 수정 내용이 충돌했습니다.",
          });
          return;
        }
        applyCachedScope(message.scope, message.payload, message.revision);
        setSyncStatus({ status: "saved" });
      };
    }
    window.addEventListener(SYNC_EVENT, onChange);
    window.addEventListener(HISTORY_EVENT, onHistory);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(SYNC_EVENT, onChange);
      window.removeEventListener(HISTORY_EVENT, onHistory);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const timer of Object.values(timers.current)) {
        if (timer) clearTimeout(timer);
      }
      channel.current?.close();
      channel.current = null;
    };
  }, [ready, userId]);

  async function saveScope(scope: SyncScope) {
    if (scope === "calculator" && !hydrated.current) return;
    if (saving.current[scope]) return;
    if (pending.current[scope] == null) return;
    saving.current[scope] = true;
    if (timers.current[scope]) {
      clearTimeout(timers.current[scope]);
      delete timers.current[scope];
    }

    try {
      // 저장 중 새 변경이 들어오면 pending이 교체된다. 현재 요청이 끝난 뒤
      // 최신 payload를 새 revision으로 이어서 저장해 동일 revision 경합을 막는다.
      while (pending.current[scope] != null) {
        const payload = pending.current[scope];
        const serialized = JSON.stringify(payload);
        setSyncStatus({ status: "saving" });
        try {
          const result = await putRemoteState(
            scope,
            payload,
            revisions.current[scope],
          );
          revisions.current[scope] = result.revision;
          baselines.current[scope] = serialized;
          if (scope === "calculator") {
            const synced = normalizeAppState(payload as AppState);
            baseState.current = synced;
            writeCalculatorBase(userId, synced);
          }
          if (JSON.stringify(pending.current[scope]) === serialized) {
            delete pending.current[scope];
          }
          channel.current?.postMessage({
            userId,
            scope,
            revision: result.revision,
            payload,
          });
          continue;
        } catch (error) {
          const status =
            typeof error === "object" && error && "status" in error
              ? error.status
              : 0;
          if (handleAuthenticationFailure(error)) return;
          if (status !== 409) {
            setSyncStatus({
              status: "offline",
              message: "연결되면 자동 재시도합니다.",
            });
            return;
          }

          if (scope === "todo") {
            const remote = await getRemoteState<TodoState>("todo");
            if (remote.exists && remote.payload) {
              const latest = (pending.current.todo ?? payload) as TodoState;
              const latestSerialized = JSON.stringify(latest);
              const merged = mergeTodoChecks(remote.payload, latest);
              const result = await putRemoteState(
                "todo",
                merged,
                remote.revision,
              );
              revisions.current.todo = result.revision;
              baselines.current.todo = JSON.stringify(merged);
              if (
                JSON.stringify(pending.current.todo) === latestSerialized
              ) {
                applyCachedScope("todo", merged, result.revision);
                delete pending.current.todo;
              }
              channel.current?.postMessage({
                userId,
                scope,
                revision: result.revision,
                payload: merged,
              });
              continue;
            }
          }

          if (scope === "calculator") {
            const latest = (pending.current.calculator ?? payload) as AppState;
            const remote = await getRemoteState<AppState>("calculator");
            if (remote.exists && remote.payload) {
              try {
                const outcome = await pushMergedCalculator({
                  base: baseState.current,
                  local: latest,
                  remote: {
                    revision: remote.revision,
                    state: remote.payload,
                  },
                  getRemote: async () => {
                    const next = await getRemoteState<AppState>("calculator");
                    if (!next.exists || !next.payload) {
                      throw new Error("서버 계산기 데이터가 없습니다.");
                    }
                    return { revision: next.revision, state: next.payload };
                  },
                  put: (state, revision) =>
                    putRemoteState("calculator", state, revision),
                });
                const latestSerialized = JSON.stringify(latest);
                revisions.current.calculator = outcome.revision;
                baseState.current = outcome.state;
                writeCalculatorBase(userId, outcome.state);
                if (
                  JSON.stringify(pending.current.calculator) === latestSerialized
                ) {
                  delete pending.current.calculator;
                  applyCachedScope(
                    "calculator",
                    outcome.state,
                    outcome.revision,
                  );
                } else {
                  const newer = pending.current.calculator as AppState;
                  pending.current.calculator = mergeCalculatorState(
                    latest,
                    newer,
                    outcome.state,
                  );
                }
                channel.current?.postMessage({
                  userId,
                  scope,
                  revision: outcome.revision,
                  payload: outcome.state,
                });
                continue;
              } catch (mergeError) {
                if (handleAuthenticationFailure(mergeError)) return;
                setSyncStatus({
                  status: "offline",
                  message: "연결되면 자동 재시도합니다.",
                });
                return;
              }
            }
          }

          if (scope !== "calculator") {
            const force = window.confirm(
              "다른 탭이나 기기에서 같은 데이터가 변경되었습니다. 현재 기기 데이터로 덮어쓸까요?\n취소하면 서버 데이터를 다시 불러옵니다.",
            );
            if (force) {
              const result = await putRemoteState(
                scope,
                payload,
                revisions.current[scope],
                true,
              );
              revisions.current[scope] = result.revision;
              baselines.current[scope] = serialized;
              if (JSON.stringify(pending.current[scope]) === serialized) {
                delete pending.current[scope];
              }
              channel.current?.postMessage({
                userId,
                scope,
                revision: result.revision,
                payload,
              });
              continue;
            }
          }

          const remote = await getRemoteState(scope);
          if (remote.exists && remote.payload) {
            applyCachedScope(scope, remote.payload, remote.revision);
            delete pending.current[scope];
            setSyncStatus({ status: "saved" });
          }
          return;
        }
      }
      setSyncStatus({ status: "saved" });
    } finally {
      saving.current[scope] = false;
    }
  }

  function applyCachedScope(
    scope: SyncScope,
    payload: unknown,
    revision: number,
  ): void {
    if (scope === "calculator") {
      const normalized = normalizeAppState(payload as AppState);
      writeStateCache(normalized);
      baseState.current = normalized;
      writeCalculatorBase(userId, normalized);
      revisions.current.calculator = revision;
      baselines.current.calculator = JSON.stringify(normalized);
    } else {
      writeTodoCache(payload as TodoState);
      revisions.current.todo = revision;
      baselines.current.todo = JSON.stringify(payload);
    }
    setContentVersion((version) => version + 1);
  }

  async function pullCalculator() {
    if (!hydrated.current || saving.current.calculator || pullGate.current) {
      return;
    }
    pullGate.current = true;
    try {
      const remote = await getRemoteState<AppState>("calculator");
      if (!remote.exists || !remote.payload) return;
      const local = normalizeAppState(
        (pending.current.calculator as AppState | undefined) ?? loadState(),
      );
      const remoteState = normalizeAppState(remote.payload);
      if (
        remote.revision === revisions.current.calculator &&
        calculatorStateEqual(local, remoteState) &&
        pending.current.calculator == null
      ) {
        return;
      }
      const merged = mergeCalculatorState(
        baseState.current,
        local,
        remoteState,
      );
      if (calculatorStateEqual(merged, remoteState)) {
        if (
          !calculatorStateEqual(local, merged) ||
          remote.revision !== revisions.current.calculator
        ) {
          applyCachedScope("calculator", merged, remote.revision);
        } else {
          revisions.current.calculator = remote.revision;
        }
        baseState.current = merged;
        writeCalculatorBase(userId, merged);
        if (
          pending.current.calculator != null &&
          calculatorStateEqual(pending.current.calculator as AppState, local)
        ) {
          delete pending.current.calculator;
        }
        return;
      }
      revisions.current.calculator = remote.revision;
      pending.current.calculator = merged;
      await saveScope("calculator");
    } catch (error) {
      if (!handleAuthenticationFailure(error)) {
        setSyncStatus({
          status: "offline",
          message: "연결되면 자동 재시도합니다.",
        });
      }
    } finally {
      pullGate.current = false;
    }
  }

  function handleAuthenticationFailure(error: unknown): boolean {
    const status =
      typeof error === "object" && error && "status" in error
        ? error.status
        : 0;
    if (status !== 401) return false;
    setReady(false);
    setSyncStatus({
      status: "error",
      message:
        "로그인 인증이 만료되었거나 유효하지 않습니다. 로그아웃 후 다시 로그인해주세요.",
    });
    return true;
  }

  return (
    <SyncContext.Provider value={syncStatus}>
      {ready ? (
        <Fragment key={contentVersion}>{children}</Fragment>
      ) : syncStatus.status === "error" ? (
        <div className="auth-screen">
          <div className="auth-card">
            <h2>데이터 동기화에 실패했습니다</h2>
            <p>{syncStatus.message ?? "서버 데이터를 불러오지 못했습니다."}</p>
            <p>
              계정 데이터 보호를 위해 이 브라우저의 기존 캐릭터는 표시하지
              않았습니다.
            </p>
            <button
              className="btn primary"
              onClick={() => window.location.reload()}
            >
              다시 시도
            </button>
            <button
              className="btn ghost"
              onClick={() =>
                void authClient
                  .signOut()
                  .finally(() => window.location.reload())
              }
            >
              로그아웃 후 다시 로그인
            </button>
            <a className="auth-public-link" href="#/lookup">
              로그인 없이 장비 검색
            </a>
          </div>
        </div>
      ) : (
        <div className="auth-screen">
          <div className="auth-card">
            <h2>데이터 불러오는 중…</h2>
            <p>서버에서 내 데이터를 안전하게 동기화하고 있습니다.</p>
          </div>
        </div>
      )}
    </SyncContext.Provider>
  );
}

async function migrateAccounts(
  local: LegacyTodoState,
): Promise<LoadedTodoState> {
  const accounts = [];
  for (const account of local.accounts) {
    if (account.apiKey) {
      const created = await createServerAccount(
        account.label,
        account.apiKey,
        account.id,
      );
      accounts.push(created.account);
    } else
      accounts.push({
        id: account.id,
        label: account.label,
        connected: account.connected ?? true,
      });
  }
  return { ...redactTodoKeys(local), accounts };
}

export function shouldMergeLocalCalculator(input: {
  cacheOwner: string | null;
  userId: string;
  importDeclined: boolean;
}): boolean {
  if (input.importDeclined) return false;
  return input.cacheOwner === input.userId;
}

export function mergeTodoChecks(
  server: TodoState,
  local: TodoState,
): TodoState {
  const checks = { ...server.checks };
  for (const [key, week] of Object.entries(local.checks)) {
    if (!checks[key] || week > checks[key]) checks[key] = week;
  }
  return { ...local, checks };
}

function historyRank(record: WeekRecord): number {
  if (record.finalized && !record.unrecoverable) return 3;
  if (record.finalized) return 2;
  if (record.unrecoverable) return 1;
  return 0;
}

export function mergeHistory(
  server: WeekRecord[],
  local: WeekRecord[],
): WeekRecord[] {
  const records = new Map(server.map((record) => [record.week, record]));
  for (const record of local) {
    const current = records.get(record.week);
    if (!current) {
      records.set(record.week, record);
      continue;
    }
    const localRank = historyRank(record);
    const currentRank = historyRank(current);
    if (
      localRank > currentRank ||
      (localRank === currentRank && record.updatedAt > current.updatedAt)
    ) {
      records.set(record.week, record);
    }
  }
  return [...records.values()]
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 52);
}
