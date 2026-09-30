import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  Character,
  ResetDay,
  TodoAccount,
  TodoItem,
} from "../types";
import {
  fetchAccountCharacters,
  searchCharacter,
  type LookupCharacter,
} from "../lib/nexon";
import { AUTO_ITEM_PROGRESS, type SchedulerState } from "../lib/scheduler";
import type { WeeklyVerification } from "../lib/bossConflict";
import { RULES } from "../data/crystalData";
import { weeklySelectionCount } from "../lib/weeklyBoss";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { RESET_DAY_LABEL, weekKey } from "../lib/week";
import { checkKey, type TodoState } from "../lib/todoStorage";
import { gotoHome } from "../lib/router";

export interface TodoPageProps {
  /** 보스수익과 공유하는 단일 캐릭터 목록 */
  characters: Character[];
  todo: TodoState;
  /** 캐릭터 id → 내 선택과 API 처치 내역의 대조 결과 */
  verifications: Record<string, WeeklyVerification>;
  /** ocid → 최신 스케줄러 응답 */
  schedules: Record<string, SchedulerState>;
  scheduleErrors: Record<string, string>;
  refreshing: boolean;
  /** 주간 보스 주차 키 (목요일) */
  week: string;
  conflictCount: number;
  onOpenConflicts(): void;
  onRefresh(): void;
  onAddAccount(label: string, apiKey: string): Promise<TodoAccount>;
  onRemoveAccount(id: string): Promise<void>;
  onAddCharacters(accountId: string, list: LookupCharacter[]): void;
  onRemoveCharacter(id: string): void;
  onSelectCharacter(id: string): void;
  onToggleCheck(itemId: string, characterId: string, itemWeek: string): void;
  onAddItem(label: string, resetDay: ResetDay): void;
  onRemoveItem(itemId: string): void;
  onToggleItemForCharacter(characterId: string, itemId: string): void;
}

export function TodoPage({
  characters,
  todo,
  verifications,
  schedules,
  scheduleErrors,
  refreshing,
  week,
  conflictCount,
  onOpenConflicts,
  onRefresh,
  onAddAccount,
  onRemoveAccount,
  onAddCharacters,
  onRemoveCharacter,
  onSelectCharacter,
  onToggleCheck,
  onAddItem,
  onRemoveItem,
  onToggleItemForCharacter,
}: TodoPageProps) {
  const [showImport, setShowImport] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [settingsCharId, setSettingsCharId] = useState<string | null>(null);

  const accountById = useMemo(
    () => new Map(todo.accounts.map((a) => [a.id, a])),
    [todo.accounts],
  );

  const anyLinked = characters.some(
    (c) =>
      c.meta?.ocid && c.meta.accountId && accountById.has(c.meta.accountId),
  );

  // 항목별 현재 주차 키 (리셋 요일이 달라 항목마다 주차가 다를 수 있다)
  const weekKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of todo.items) map.set(item.id, weekKey(item.resetDay));
    return map;
  }, [todo.items]);

  const isEnabled = (item: TodoItem, c: Character) =>
    !(todo.disabledItems[c.id] ?? []).includes(item.id);

  const isChecked = (item: TodoItem, c: Character) =>
    todo.checks[checkKey(item.id, c.id)] === weekKeys.get(item.id);

  /**
   * 자동 항목의 진행 상황.
   * 주간보스는 보스수익과 같은 주간 선택을 세므로 두 탭의 숫자가 항상 일치한다.
   * API가 확인해주지 않은 보스가 있으면 그 수를 함께 내려보내,
   * 실제로 안 잡은 보스가 완료로만 보이지 않게 한다.
   */
  const autoProgress = (item: TodoItem, c: Character) => {
    if (item.id === "weekly-boss") {
      const done = weeklySelectionCount(c, week);
      const total = RULES.weeklyBossSellLimitPerCharacter;
      const verification = verifications[c.id];
      return {
        done,
        total,
        complete: done >= total,
        linked: true,
        apiCount: verification?.reliable ? verification.apiCount : null,
        unverified: verification?.reliable
          ? verification.unverified.length
          : 0,
      };
    }
    const fn = AUTO_ITEM_PROGRESS[item.id];
    const sched = c.meta?.ocid ? schedules[c.meta.ocid] : undefined;
    if (!fn || !sched) return null;
    return { ...fn(sched), linked: false, apiCount: null, unverified: 0 };
  };

  const progress = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const item of todo.items) {
      for (const c of characters) {
        if (!isEnabled(item, c)) continue;
        total += 1;
        const auto = autoProgress(item, c);
        if (auto ? auto.complete : isChecked(item, c)) done += 1;
      }
    }
    return {
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, todo, weekKeys, schedules, week, verifications]);

  const addAccount = async (
    label: string,
    apiKey: string,
  ): Promise<TodoAccount> => onAddAccount(label, apiKey);

  const removeAccount = async (id: string) => {
    const target = todo.accounts.find((a) => a.id === id);
    if (!target) return;
    if (
      !window.confirm(
        `'${target.label}' 계정(API 키)을 삭제할까요? 이 계정에서 불러온 캐릭터의 자동 체크가 중단됩니다.`,
      )
    ) {
      return;
    }
    try {
      await onRemoveAccount(id);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "계정 삭제에 실패했습니다.",
      );
    }
  };

  const addSearchedCharacter = (c: LookupCharacter) => {
    onAddCharacters("", [c]);
  };

  const removeCharacter = (id: string) => {
    const target = characters.find((c) => c.id === id);
    if (!target) return;
    if (
      !window.confirm(
        `'${target.name}' 캐릭터를 제거할까요? 보스수익의 보스 설정과 체크 기록이 함께 사라집니다.`,
      )
    ) {
      return;
    }
    onRemoveCharacter(id);
    if (settingsCharId === id) setSettingsCharId(null);
  };

  const openBossTab = (characterId: string) => {
    onSelectCharacter(characterId);
    gotoHome();
  };

  const settingsChar = characters.find((c) => c.id === settingsCharId) ?? null;

  const gridStyle = {
    "--todo-character-count": characters.length,
  } as CSSProperties;

  return (
    <div className="todo-page">
      <div className="todo-toolbar">
        <div className="todo-progress">
          <h2>주간 체크리스트</h2>
          <div className="todo-progress-meta">
            <span>
              주간 진행률 {progress.pct}% ({progress.done}/{progress.total})
            </span>
            <span className="todo-progress-bar">
              <span style={{ width: `${progress.pct}%` }} />
            </span>
          </div>
        </div>
        <div className="todo-toolbar-actions">
          {conflictCount > 0 && (
            <button className="btn warn-chip" onClick={onOpenConflicts}>
              API와 다른 캐릭터 {conflictCount}명 — 비교
            </button>
          )}
          {anyLinked && (
            <button
              className="btn ghost"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? "갱신 중…" : "현황 새로고침"}
            </button>
          )}
          <button className="btn primary" onClick={() => setShowImport(true)}>
            캐릭터 목록 가져오기
          </button>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="empty-board">
          <h2>캐릭터를 추가해주세요</h2>
          <p>
            넥슨 API 키로 계정을 연결하면 계정 전체 캐릭터를 한 번에 불러오고,
            <br />
            주간보스·수로·에픽던전 진행 상황이 자동으로 체크됩니다.
          </p>
          <button className="btn primary" onClick={() => setShowImport(true)}>
            캐릭터 목록 가져오기
          </button>
        </div>
      ) : (
        <div className="todo-scroll">
          <div className="todo-grid" style={gridStyle}>
            {/* 헤더 행: 캐릭터 */}
            <div className="todo-corner" />
            {characters.map((c) => {
              const error = c.meta?.ocid
                ? scheduleErrors[c.meta.ocid]
                : undefined;
              const account = c.meta?.accountId
                ? accountById.get(c.meta.accountId)
                : undefined;
              return (
                <div key={c.id} className="todo-char-head">
                  <CharacterAvatar src={c.meta?.image} size={52} />
                  <strong>{c.name}</strong>
                  {c.meta && (
                    <span className="todo-char-sub">
                      Lv.{c.meta.level} · {c.meta.world}
                    </span>
                  )}
                  {account && (
                    <span
                      className={"todo-sync-badge" + (error ? " warn" : "")}
                      title={
                        error ?? `'${account.label}' 계정 API로 자동 체크 중`
                      }
                    >
                      {error ? "연동 오류" : refreshing ? "조회 중…" : "API 연동"}
                    </span>
                  )}
                  <div className="todo-char-actions">
                    <button
                      className="icon-btn"
                      title="사용할 항목 설정"
                      onClick={() => setSettingsCharId(c.id)}
                    >
                      항목 설정
                    </button>
                    <button
                      className="icon-btn danger"
                      title="캐릭터 제거"
                      onClick={() => removeCharacter(c.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}

            {/* 항목 행 */}
            {todo.items.map((item) => (
              <TodoRow
                key={item.id}
                item={item}
                characters={characters}
                isEnabled={isEnabled}
                isChecked={isChecked}
                autoProgress={autoProgress}
                onToggle={(target, character) =>
                  onToggleCheck(
                    target.id,
                    character.id,
                    weekKeys.get(target.id)!,
                  )
                }
                onOpenBossTab={openBossTab}
                onRemove={() => {
                  if (
                    window.confirm(
                      `'${item.label}' 항목을 삭제할까요? 체크 기록도 함께 사라집니다.`,
                    )
                  ) {
                    onRemoveItem(item.id);
                  }
                }}
              />
            ))}

            {/* 항목 추가 행 */}
            <button
              className="todo-add-row"
              onClick={() => setShowAddItem(true)}
            >
              ＋ 체크리스트 항목 추가
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <ImportCharactersModal
          accounts={todo.accounts}
          existingNames={characters.map((c) => c.name)}
          existingOcids={characters
            .map((c) => c.meta?.ocid)
            .filter((o): o is string => Boolean(o))}
          onAddAccount={addAccount}
          onRemoveAccount={removeAccount}
          onAddCharacters={onAddCharacters}
          onAddSearched={addSearchedCharacter}
          onClose={() => setShowImport(false)}
        />
      )}
      {showAddItem && (
        <AddItemModal
          onAdd={(label, resetDay) => {
            onAddItem(label, resetDay);
            setShowAddItem(false);
          }}
          onClose={() => setShowAddItem(false)}
        />
      )}
      {settingsChar && (
        <CharacterSettingsModal
          name={settingsChar.name}
          items={todo.items}
          disabledItemIds={todo.disabledItems[settingsChar.id] ?? []}
          onToggle={(itemId) =>
            onToggleItemForCharacter(settingsChar.id, itemId)
          }
          onClose={() => setSettingsCharId(null)}
        />
      )}
    </div>
  );
}

function TodoRow({
  item,
  characters,
  isEnabled,
  isChecked,
  autoProgress,
  onToggle,
  onOpenBossTab,
  onRemove,
}: {
  item: TodoItem;
  characters: Character[];
  isEnabled(item: TodoItem, c: Character): boolean;
  isChecked(item: TodoItem, c: Character): boolean;
  autoProgress(
    item: TodoItem,
    c: Character,
  ): {
    done: number;
    total: number;
    complete: boolean;
    /** 보스수익의 보스 선택과 같은 값인지 (클릭하면 그 탭으로 이동) */
    linked: boolean;
    /** API가 처치로 확인한 수 (판정 불가면 null) */
    apiCount: number | null;
    /** 내 선택 중 API가 확인해주지 않은 수 */
    unverified: number;
  } | null;
  onToggle(item: TodoItem, c: Character): void;
  onOpenBossTab(characterId: string): void;
  onRemove(): void;
}) {
  return (
    <>
      <div className="todo-item-label">
        <span className={`reset-badge ${item.resetDay}`}>
          {RESET_DAY_LABEL[item.resetDay]}
        </span>
        <span className="todo-item-name">{item.label}</span>
        <button
          className="icon-btn danger todo-item-remove"
          title="항목 삭제"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      {characters.map((c) => {
        if (!isEnabled(item, c)) {
          return (
            <div
              key={c.id}
              className="todo-cell off"
              title={`${c.name}은(는) 이 항목을 사용하지 않습니다`}
            />
          );
        }
        const auto = autoProgress(item, c);
        if (auto?.linked) {
          return (
            <button
              key={c.id}
              className={
                "todo-cell auto linked" +
                (auto.complete ? " done" : "") +
                (auto.unverified > 0 ? " unverified" : "")
              }
              onClick={() => onOpenBossTab(c.id)}
              title={
                `${c.name} · ${item.label} — 보스수익의 보스 선택 ${auto.done}/${auto.total}` +
                (auto.apiCount != null
                  ? `\n넥슨 API 확인 ${auto.apiCount}개` +
                    (auto.unverified > 0
                      ? `\n내 선택 중 ${auto.unverified}개는 API가 확인하지 않았습니다.`
                      : "")
                  : "\n넥슨 API 대조 불가 (미조회 또는 축약 응답)") +
                "\n클릭하면 보스수익에서 수정합니다."
              }
            >
              <span className="todo-check-circle">
                {auto.complete ? "✓" : ""}
              </span>
              <span className="todo-count">
                {auto.done}/{auto.total}
              </span>
              {auto.unverified > 0 && (
                <span className="todo-unverified">API {auto.apiCount}</span>
              )}
            </button>
          );
        }
        if (auto) {
          return (
            <div
              key={c.id}
              className={"todo-cell auto" + (auto.complete ? " done" : "")}
              title={`${c.name} · ${item.label} — API 자동 (${auto.done}/${auto.total})`}
            >
              <span className="todo-check-circle">
                {auto.complete ? "✓" : ""}
              </span>
              {auto.total > 1 && (
                <span className="todo-count">
                  {auto.done}/{auto.total}
                </span>
              )}
            </div>
          );
        }
        const done = isChecked(item, c);
        return (
          <button
            key={c.id}
            className={"todo-cell" + (done ? " done" : "")}
            onClick={() => onToggle(item, c)}
            aria-pressed={done}
            title={`${c.name} · ${item.label}`}
          >
            <span className="todo-check-circle">{done ? "✓" : ""}</span>
          </button>
        );
      })}
    </>
  );
}

/* ───── 캐릭터 목록 가져오기 모달 ───── */

function ImportCharactersModal({
  accounts,
  existingNames,
  existingOcids,
  onAddAccount,
  onRemoveAccount,
  onAddCharacters,
  onAddSearched,
  onClose,
}: {
  accounts: TodoAccount[];
  existingNames: string[];
  existingOcids: string[];
  onAddAccount(label: string, apiKey: string): Promise<TodoAccount>;
  onRemoveAccount(id: string): void | Promise<void>;
  onAddCharacters(accountId: string, list: LookupCharacter[]): void;
  onAddSearched(c: LookupCharacter): void;
  onClose(): void;
}) {
  const [tab, setTab] = useState<"account" | "search">("account");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>캐릭터 목록 가져오기</h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="tab-bar">
          <button
            className={"tab" + (tab === "account" ? " on" : "")}
            onClick={() => setTab("account")}
          >
            계정에서 가져오기
          </button>
          <button
            className={"tab" + (tab === "search" ? " on" : "")}
            onClick={() => setTab("search")}
          >
            캐릭터명 검색
          </button>
        </div>

        {tab === "account" ? (
          <AccountImportTab
            accounts={accounts}
            existingNames={existingNames}
            existingOcids={existingOcids}
            onAddAccount={onAddAccount}
            onRemoveAccount={onRemoveAccount}
            onAddCharacters={onAddCharacters}
          />
        ) : (
          <SearchImportTab
            existingNames={existingNames}
            onAdd={onAddSearched}
          />
        )}
      </div>
    </div>
  );
}

function AccountImportTab({
  accounts,
  existingNames,
  existingOcids,
  onAddAccount,
  onRemoveAccount,
  onAddCharacters,
}: {
  accounts: TodoAccount[];
  existingNames: string[];
  existingOcids: string[];
  onAddAccount(label: string, apiKey: string): Promise<TodoAccount>;
  onRemoveAccount(id: string): void | Promise<void>;
  onAddCharacters(accountId: string, list: LookupCharacter[]): void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    accounts[0]?.id ?? null,
  );
  const [showKeyForm, setShowKeyForm] = useState(accounts.length === 0);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<LookupCharacter[] | null>(null);
  const [listAccountId, setListAccountId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  const submitAccount = async () => {
    if (!label.trim() || !apiKey.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const account = await onAddAccount(label.trim(), apiKey.trim());
      setSelectedId(account.id);
      setShowKeyForm(false);
      setLabel("");
      setApiKey("");
      await loadList(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계정 등록에 실패했습니다.");
      setLoading(false);
    }
  };

  const loadList = async (account: TodoAccount) => {
    setLoading(true);
    setError(null);
    setAddedCount(null);
    try {
      const characters = await fetchAccountCharacters(account.id);
      setList(characters);
      setListAccountId(account.id);
      setChecked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (ocid: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(ocid)) next.delete(ocid);
      else next.add(ocid);
      return next;
    });
  };

  const addSelected = () => {
    if (!list || !listAccountId) return;
    const chosen = list.filter((c) => checked.has(c.ocid));
    onAddCharacters(listAccountId, chosen);
    setAddedCount(chosen.length);
    setChecked(new Set());
  };

  return (
    <div className="import-body">
      <p className="import-desc">
        계정별{" "}
        <a href="https://openapi.nexon.com" target="_blank" rel="noreferrer">
          넥슨 Open API
        </a>{" "}
        키(live_로 시작)를 등록하면 해당 계정의 전체 캐릭터를 불러오고,
        주간보스·수로· 에픽던전 진행 상황이 자동으로 체크됩니다. 키는 서버에서
        암호화되어 저장되며 브라우저로 다시 전송되지 않습니다.
      </p>

      {accounts.length > 0 && (
        <div className="account-select-row">
          {accounts.map((a) => (
            <span
              key={a.id}
              className={"account-chip" + (a.id === selectedId ? " on" : "")}
            >
              <button
                className="account-chip-name"
                onClick={() => setSelectedId(a.id)}
              >
                {a.label}
              </button>
              <button
                className="account-chip-remove"
                title="계정 삭제"
                onClick={() => onRemoveAccount(a.id)}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            className="btn ghost sm"
            onClick={() => setShowKeyForm((v) => !v)}
          >
            ＋ 계정 추가
          </button>
        </div>
      )}

      {(showKeyForm || accounts.length === 0) && (
        <div className="account-key-form">
          <input
            className="text-input"
            placeholder="계정 이름 (예: 본계정)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="text-input"
            type="password"
            placeholder="live_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAccount()}
          />
          <button
            className="btn primary"
            onClick={() => void submitAccount()}
            disabled={!label.trim() || !apiKey.trim()}
          >
            계정 등록
          </button>
        </div>
      )}

      {selected && (
        <div className="search-row">
          <button
            className="btn primary"
            onClick={() => loadList(selected)}
            disabled={loading}
          >
            {loading ? "조회 중…" : `'${selected.label}' 캐릭터 목록 불러오기`}
          </button>
        </div>
      )}

      {error && <p className="notice warn">{error}</p>}
      {addedCount != null && (
        <p className="import-hint">
          캐릭터 {addedCount}개를 체크리스트에 추가했습니다.
        </p>
      )}

      {list && listAccountId === selectedId && (
        <>
          <div className="account-toolbar">
            <span className="import-hint">
              캐릭터 {list.length}개 · 선택 {checked.size}개
            </span>
            <button
              className="btn primary sm"
              disabled={checked.size === 0}
              onClick={addSelected}
            >
              선택한 캐릭터 추가
            </button>
          </div>
          <div className="account-list">
            {list.map((c) => {
              const exists =
                existingNames.includes(c.name) ||
                existingOcids.includes(c.ocid);
              return (
                <label
                  key={c.ocid}
                  className={"account-row" + (checked.has(c.ocid) ? " on" : "")}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(c.ocid)}
                    disabled={exists}
                    onChange={() => toggle(c.ocid)}
                  />
                  <span className="account-name">
                    {c.name}
                    {exists && <em className="dup-mark"> (등록됨)</em>}
                  </span>
                  <span className="account-sub">
                    {c.world} · {c.job} · Lv.{c.level}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SearchImportTab({
  existingNames,
  onAdd,
}: {
  existingNames: string[];
  onAdd(c: LookupCharacter): void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupCharacter | null>(null);
  const [added, setAdded] = useState(false);

  const search = async () => {
    if (!name.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAdded(false);
    try {
      setResult(await searchCharacter(name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const duplicated = result != null && existingNames.includes(result.name);

  return (
    <div className="import-body">
      <p className="import-desc">
        캐릭터명으로 개별 추가합니다. 이렇게 추가한 캐릭터는 API 자동 체크 없이
        수동으로 체크합니다.
      </p>
      <div className="search-row">
        <input
          className="text-input"
          placeholder="캐릭터명을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          autoFocus
        />
        <button
          className="btn primary"
          onClick={search}
          disabled={loading || !name.trim()}
        >
          {loading ? "조회 중…" : "검색"}
        </button>
      </div>

      {error && <p className="notice warn">{error}</p>}

      {result && (
        <div className="lookup-card">
          {result.image && <CharacterAvatar src={result.image} size={64} />}
          <div className="lookup-info">
            <strong>{result.name}</strong>
            <span className="lookup-sub">
              {result.world} · {result.job} · Lv.{result.level}
            </span>
          </div>
          <button
            className="btn primary sm"
            disabled={added || duplicated}
            onClick={() => {
              onAdd(result);
              setAdded(true);
            }}
          >
            {added ? "추가됨" : duplicated ? "등록됨" : "추가"}
          </button>
        </div>
      )}
      {duplicated && !added && (
        <p className="import-hint">
          이미 같은 이름의 캐릭터가 등록되어 있습니다.
        </p>
      )}
    </div>
  );
}

function AddItemModal({
  onAdd,
  onClose,
}: {
  onAdd(label: string, resetDay: ResetDay): void;
  onClose(): void;
}) {
  const [label, setLabel] = useState("");
  const [resetDay, setResetDay] = useState<ResetDay>("thu");

  const submit = () => {
    if (label.trim()) onAdd(label.trim(), resetDay);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal todo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>체크리스트 항목 추가</h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="import-body">
          <div className="search-row">
            <input
              className="text-input"
              placeholder="항목 이름 (예: 헤이븐 주간퀘)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
            <select
              className="text-input todo-reset-select"
              value={resetDay}
              onChange={(e) => setResetDay(e.target.value as ResetDay)}
              aria-label="리셋 요일"
            >
              <option value="thu">{RESET_DAY_LABEL.thu}</option>
              <option value="mon">{RESET_DAY_LABEL.mon}</option>
            </select>
          </div>
          <p className="import-hint">
            추가한 항목은 모든 캐릭터에서 기본 활성화되며, 캐릭터별 '항목
            설정'에서 사용 여부를 바꿀 수 있습니다.
          </p>
          <button
            className="btn primary"
            onClick={submit}
            disabled={!label.trim()}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

function CharacterSettingsModal({
  name,
  items,
  disabledItemIds,
  onToggle,
  onClose,
}: {
  name: string;
  items: TodoItem[];
  disabledItemIds: string[];
  onToggle(itemId: string): void;
  onClose(): void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal todo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{name} · 항목 설정</h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="modal-sub">
          이 캐릭터의 체크리스트에 사용할 항목을 선택하세요. 해제한 항목은
          표에서 비활성화 표시됩니다.
        </p>
        <div className="todo-settings-list">
          {items.map((item) => {
            const enabled = !disabledItemIds.includes(item.id);
            return (
              <label
                key={item.id}
                className={"todo-settings-row" + (enabled ? " on" : "")}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => onToggle(item.id)}
                />
                <span className={`reset-badge ${item.resetDay}`}>
                  {RESET_DAY_LABEL[item.resetDay]}
                </span>
                <span className="todo-settings-name">{item.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
