import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadState, writeStateCache } from "../lib/storage";
import {
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
  hasCalculatorData,
  hasTodoData,
  redactTodoKeys,
  type LegacyTodoState,
} from "../lib/localMigration";

interface SyncContextValue {
  status: "loading" | "saved" | "saving" | "offline" | "error";
  message?: string;
}
const SyncContext = createContext<SyncContextValue>({ status: "loading" });
export const useSyncStatus = () => useContext(SyncContext);

export function UserStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncContextValue>({
    status: "loading",
  });
  const revisions = useRef<Record<SyncScope, number>>({
    calculator: 0,
    todo: 0,
  });
  const baselines = useRef<Record<SyncScope, string>>({
    calculator: "",
    todo: "",
  });
  const timers = useRef<Partial<Record<SyncScope, number>>>({});
  const pending = useRef<Partial<Record<SyncScope, unknown>>>({});
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hydrate().catch((error) => {
      if (!cancelled) {
        setSyncStatus({
          status: "error",
          message:
            error instanceof Error ? error.message : "동기화 초기화 실패",
        });
        setReady(true);
      }
    });
    async function hydrate() {
      const localCalculator = loadState();
      const localTodo = loadTodoState() as LegacyTodoState;
      const localHistory = loadHistory();
      const [remoteCalc, remoteTodo, remoteHistory] = await Promise.all([
        getRemoteState("calculator"),
        getRemoteState<TodoState>("todo"),
        getRemoteHistory(),
      ]);
      if (cancelled) return;

      let calculator = localCalculator;
      if (remoteCalc.exists && remoteCalc.payload) {
        const differs =
          JSON.stringify(remoteCalc.payload) !==
          JSON.stringify(localCalculator);
        const overwrite =
          differs &&
          hasCalculatorData(localCalculator) &&
          window.confirm(
            "이 기기에 기존 보스수익 데이터가 있습니다. 이 기기 데이터로 서버를 덮어쓸까요?\n취소하면 서버 데이터를 사용합니다.",
          );
        if (overwrite) {
          const saved = await putRemoteState(
            "calculator",
            localCalculator,
            remoteCalc.revision,
            true,
          );
          revisions.current.calculator = saved.revision;
        } else {
          calculator = remoteCalc.payload as typeof localCalculator;
          revisions.current.calculator = remoteCalc.revision;
        }
      } else if (hasCalculatorData(localCalculator)) {
        const saved = await putRemoteState("calculator", localCalculator, 0);
        revisions.current.calculator = saved.revision;
      }

      let todo = redactTodoKeys(localTodo);
      if (remoteTodo.exists && remoteTodo.payload) {
        const differs =
          JSON.stringify(remoteTodo.payload) !== JSON.stringify(todo);
        const overwrite =
          differs &&
          hasTodoData(localTodo) &&
          window.confirm(
            "이 기기에 기존 체크리스트 데이터가 있습니다. 이 기기 데이터로 서버를 덮어쓸까요?\n취소하면 서버 데이터를 사용합니다.",
          );
        if (overwrite) {
          todo = await migrateAccounts(localTodo);
          const saved = await putRemoteState(
            "todo",
            todo,
            remoteTodo.revision,
            true,
          );
          revisions.current.todo = saved.revision;
        } else {
          todo = remoteTodo.payload;
          revisions.current.todo = remoteTodo.revision;
        }
      } else if (hasTodoData(localTodo)) {
        todo = await migrateAccounts(localTodo);
        const saved = await putRemoteState("todo", todo, 0);
        revisions.current.todo = saved.revision;
      }

      const remoteRecords = remoteHistory.records as WeekRecord[];
      const history = mergeHistory(remoteRecords, localHistory);
      const remoteByWeek = new Map(
        remoteRecords.map((record) => [record.week, record]),
      );
      await Promise.all(
        history
          .filter(
            (record) =>
              record ===
              localHistory.find((local) => local.week === record.week),
          )
          .filter(
            (record) =>
              JSON.stringify(record) !==
              JSON.stringify(remoteByWeek.get(record.week)),
          )
          .map(putRemoteHistory),
      );
      writeStateCache(calculator);
      writeTodoCache(todo);
      writeHistoryCache(history);
      baselines.current.calculator = JSON.stringify(calculator);
      baselines.current.todo = JSON.stringify(todo);
      setSyncStatus({ status: "saved" });
      setReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

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
      void putRemoteHistory((event as CustomEvent).detail).catch(() =>
        setSyncStatus({ status: "offline", message: "주간 기록 재시도 대기" }),
      );
    const onOnline = () => {
      for (const scope of Object.keys(pending.current) as SyncScope[])
        void saveScope(scope);
    };
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("maple-user-state");
      channel.current.onmessage = () => {
        if (Object.keys(pending.current).length === 0) window.location.reload();
        else
          setSyncStatus({
            status: "error",
            message: "다른 탭 변경과 충돌했습니다. 저장 후 새로고침하세요.",
          });
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
  }, [ready]);

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
      channel.current?.postMessage({ scope, revision: result.revision });
    } catch (error) {
      const status =
        typeof error === "object" && error && "status" in error
          ? error.status
          : 0;
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
            revisions.current.todo = result.revision;
            baselines.current.todo = JSON.stringify(merged);
            pending.current.todo = merged;
            writeTodoCache(merged);
            delete pending.current.todo;
            setSyncStatus({ status: "saved" });
            channel.current?.postMessage({ scope, revision: result.revision });
            window.location.reload();
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
        } else {
          window.location.reload();
        }
      } else
        setSyncStatus({
          status: "offline",
          message: "연결되면 자동 재시도합니다.",
        });
    }
  }

  return (
    <SyncContext.Provider value={syncStatus}>
      {ready ? (
        children
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
