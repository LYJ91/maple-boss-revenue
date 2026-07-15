import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadState, writeStateCache, type AppState } from "../lib/storage";
import {
  DEFAULT_TODO_ITEMS,
  loadTodoState,
  writeTodoCache,
  type TodoState,
} from "../lib/todoStorage";
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
  const channel = useRef<BroadcastChannel | null>(null);
  const rehydrate = useRef<() => void>(() => undefined);

  useEffect(() => {
    let cancelled = false;
    const runHydrate = () =>
      void hydrate().catch((error) => {
        if (!cancelled) {
          if (warmStart.current) {
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
      }

      let todo: TodoState = importLocal
        ? redactTodoKeys(localTodo)
        : {
            items: [...DEFAULT_TODO_ITEMS],
            characters: [],
            checks: {},
            accounts: [],
          };
      if (remoteTodo.exists && remoteTodo.payload) {
        todo = remoteTodo.payload;
        revisions.current.todo = remoteTodo.revision;
      } else {
        if (importLocal && hasTodoData(localTodo)) {
          todo = await migrateAccounts(localTodo);
        }
        const saved = await putRemoteState("todo", todo, 0);
        revisions.current.todo = saved.revision;
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
      if (pending.current.calculator != null) {
        calculator = pending.current.calculator as AppState;
      }
      if (pending.current.todo != null) {
        todo = pending.current.todo as TodoState;
      }
      writeStateCache(calculator);
      writeTodoCache(todo);
      writeHistoryCache(history);
      baselines.current.calculator = JSON.stringify(calculator);
      baselines.current.todo = JSON.stringify(todo);
      markCacheOwner(userId);
      setSyncStatus({ status: "saved" });
      setReady(true);
      if (
        warmStart.current &&
        (localSnapshot.calculator !== JSON.stringify(calculator) ||
          localSnapshot.todo !== JSON.stringify(todo) ||
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
      if (serialized === baselines.current[scope]) return;
      pending.current[scope] = payload;
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
    return () => {
      window.removeEventListener(SYNC_EVENT, onChange);
      window.removeEventListener(HISTORY_EVENT, onHistory);
      window.removeEventListener("online", onOnline);
      channel.current?.close();
      channel.current = null;
    };
  }, [ready, userId]);

  async function saveScope(scope: SyncScope) {
    const payload = pending.current[scope];
    if (payload == null) return;
    setSyncStatus({ status: "saving" });
    try {
      const result = await putRemoteState(
        scope,
        payload,
        revisions.current[scope],
      );
      revisions.current[scope] = result.revision;
      baselines.current[scope] = JSON.stringify(payload);
      delete pending.current[scope];
      setSyncStatus({ status: "saved" });
      channel.current?.postMessage({
        userId,
        scope,
        revision: result.revision,
        payload,
      });
    } catch (error) {
      const status =
        typeof error === "object" && error && "status" in error
          ? error.status
          : 0;
      if (handleAuthenticationFailure(error)) return;
      if (status === 409) {
        if (scope === "todo") {
          const remote = await getRemoteState<TodoState>("todo");
          if (remote.exists && remote.payload) {
            const merged = mergeTodoChecks(
              remote.payload,
              payload as TodoState,
            );
            const result = await putRemoteState(
              "todo",
              merged,
              remote.revision,
            );
            applyCachedScope("todo", merged, result.revision);
            delete pending.current.todo;
            setSyncStatus({ status: "saved" });
            channel.current?.postMessage({
              userId,
              scope,
              revision: result.revision,
              payload: merged,
            });
            return;
          }
        }
        const force = window.confirm(
          "다른 기기에서 같은 데이터가 변경되었습니다. 현재 기기 데이터로 덮어쓸까요?\n취소하면 서버 데이터를 다시 불러옵니다.",
        );
        if (force) {
          const result = await putRemoteState(
            scope,
            payload,
            revisions.current[scope],
            true,
          );
          revisions.current[scope] = result.revision;
          baselines.current[scope] = JSON.stringify(payload);
          delete pending.current[scope];
          setSyncStatus({ status: "saved" });
          channel.current?.postMessage({
            userId,
            scope,
            revision: result.revision,
            payload,
          });
        } else {
          const remote = await getRemoteState(scope);
          if (remote.exists && remote.payload) {
            applyCachedScope(scope, remote.payload, remote.revision);
            delete pending.current[scope];
            setSyncStatus({ status: "saved" });
          }
        }
      } else
        setSyncStatus({
          status: "offline",
          message: "연결되면 자동 재시도합니다.",
        });
    }
  }

  function applyCachedScope(
    scope: SyncScope,
    payload: unknown,
    revision: number,
  ): void {
    if (scope === "calculator") {
      writeStateCache(payload as AppState);
    } else {
      writeTodoCache(payload as TodoState);
    }
    revisions.current[scope] = revision;
    baselines.current[scope] = JSON.stringify(payload);
    setContentVersion((version) => version + 1);
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

async function migrateAccounts(local: LegacyTodoState): Promise<TodoState> {
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
  return { ...local, accounts } as TodoState;
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

export function mergeHistory(
  server: WeekRecord[],
  local: WeekRecord[],
): WeekRecord[] {
  const records = new Map(server.map((record) => [record.week, record]));
  for (const record of local) {
    const current = records.get(record.week);
    if (!current || record.updatedAt > current.updatedAt)
      records.set(record.week, record);
  }
  return [...records.values()]
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, 52);
}
