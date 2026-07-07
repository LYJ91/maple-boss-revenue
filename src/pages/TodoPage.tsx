import { useEffect, useMemo, useState } from 'react';
import type { ResetDay, TodoCharacter, TodoItem } from '../types';
import { searchCharacter, type LookupCharacter } from '../lib/nexon';
import { CharacterAvatar } from '../components/CharacterAvatar';
import { RESET_DAY_LABEL, weekKey } from '../lib/week';
import {
  checkKey,
  loadTodoState,
  saveTodoState,
  type TodoState,
} from '../lib/todoStorage';

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function TodoPage() {
  const [state, setState] = useState<TodoState>(loadTodoState);
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [settingsCharId, setSettingsCharId] = useState<string | null>(null);

  useEffect(() => {
    saveTodoState(state);
  }, [state]);

  // 항목별 현재 주차 키 (리셋 요일이 달라 항목마다 주차가 다를 수 있다)
  const weekKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of state.items) map.set(item.id, weekKey(item.resetDay));
    return map;
  }, [state.items]);

  const isEnabled = (item: TodoItem, c: TodoCharacter) =>
    !c.disabledItemIds.includes(item.id);

  const isChecked = (item: TodoItem, c: TodoCharacter) =>
    state.checks[checkKey(item.id, c.id)] === weekKeys.get(item.id);

  const progress = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const item of state.items) {
      for (const c of state.characters) {
        if (!isEnabled(item, c)) continue;
        total += 1;
        if (isChecked(item, c)) done += 1;
      }
    }
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, weekKeys]);

  const toggleCheck = (item: TodoItem, c: TodoCharacter) => {
    const key = checkKey(item.id, c.id);
    const wk = weekKeys.get(item.id)!;
    setState((prev) => {
      const checks = { ...prev.checks };
      if (checks[key] === wk) {
        delete checks[key];
      } else {
        checks[key] = wk;
      }
      return { ...prev, checks };
    });
  };

  const addCharacter = (c: LookupCharacter) => {
    setState((prev) => ({
      ...prev,
      characters: [
        ...prev.characters,
        {
          id: newId('tc'),
          name: c.name,
          meta: { world: c.world, job: c.job, level: c.level, image: c.image },
          disabledItemIds: [],
        },
      ],
    }));
  };

  const removeCharacter = (id: string) => {
    const target = state.characters.find((c) => c.id === id);
    if (!target) return;
    if (!window.confirm(`'${target.name}' 캐릭터를 체크리스트에서 제거할까요?`)) return;
    setState((prev) => ({
      ...prev,
      characters: prev.characters.filter((c) => c.id !== id),
    }));
    if (settingsCharId === id) setSettingsCharId(null);
  };

  const toggleItemForCharacter = (charId: string, itemId: string) => {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => {
        if (c.id !== charId) return c;
        const disabled = c.disabledItemIds.includes(itemId);
        return {
          ...c,
          disabledItemIds: disabled
            ? c.disabledItemIds.filter((id) => id !== itemId)
            : [...c.disabledItemIds, itemId],
        };
      }),
    }));
  };

  const addItem = (label: string, resetDay: ResetDay) => {
    // 새 항목은 모든 캐릭터에서 기본 활성화 상태로 추가된다
    setState((prev) => ({
      ...prev,
      items: [...prev.items, { id: newId('ti'), label, resetDay }],
    }));
    setShowAddItem(false);
  };

  const removeItem = (item: TodoItem) => {
    if (!window.confirm(`'${item.label}' 항목을 삭제할까요? 체크 기록도 함께 사라집니다.`)) {
      return;
    }
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== item.id),
      characters: prev.characters.map((c) => ({
        ...c,
        disabledItemIds: c.disabledItemIds.filter((id) => id !== item.id),
      })),
    }));
  };

  const settingsChar =
    state.characters.find((c) => c.id === settingsCharId) ?? null;

  const gridStyle = {
    gridTemplateColumns: `220px repeat(${state.characters.length}, minmax(150px, 1fr))`,
  };

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
        <button className="btn primary" onClick={() => setShowAddCharacter(true)}>
          캐릭터 추가
        </button>
      </div>

      {state.characters.length === 0 ? (
        <div className="empty-board">
          <h2>캐릭터를 추가해주세요</h2>
          <p>
            캐릭터를 불러오면 주간보스·수로·에픽던전·미니게임 진행 상황을
            <br />
            캐릭터별로 체크하고 관리할 수 있습니다.
          </p>
          <button className="btn primary" onClick={() => setShowAddCharacter(true)}>
            캐릭터 추가
          </button>
        </div>
      ) : (
        <div className="todo-scroll">
          <div className="todo-grid" style={gridStyle}>
            {/* 헤더 행: 캐릭터 */}
            <div className="todo-corner" />
            {state.characters.map((c) => (
              <div key={c.id} className="todo-char-head">
                <CharacterAvatar src={c.meta?.image} size={52} />
                <strong>{c.name}</strong>
                {c.meta && (
                  <span className="todo-char-sub">
                    Lv.{c.meta.level} · {c.meta.world}
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
            ))}

            {/* 항목 행 */}
            {state.items.map((item) => (
              <TodoRow
                key={item.id}
                item={item}
                characters={state.characters}
                isEnabled={isEnabled}
                isChecked={isChecked}
                onToggle={toggleCheck}
                onRemove={() => removeItem(item)}
              />
            ))}

            {/* 항목 추가 행 */}
            <button className="todo-add-row" onClick={() => setShowAddItem(true)}>
              ＋ 체크리스트 항목 추가
            </button>
          </div>
        </div>
      )}

      {showAddCharacter && (
        <AddCharacterModal
          existingNames={state.characters.map((c) => c.name)}
          onAdd={addCharacter}
          onClose={() => setShowAddCharacter(false)}
        />
      )}
      {showAddItem && (
        <AddItemModal onAdd={addItem} onClose={() => setShowAddItem(false)} />
      )}
      {settingsChar && (
        <CharacterSettingsModal
          character={settingsChar}
          items={state.items}
          onToggle={(itemId) => toggleItemForCharacter(settingsChar.id, itemId)}
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
  onToggle,
  onRemove,
}: {
  item: TodoItem;
  characters: TodoCharacter[];
  isEnabled(item: TodoItem, c: TodoCharacter): boolean;
  isChecked(item: TodoItem, c: TodoCharacter): boolean;
  onToggle(item: TodoItem, c: TodoCharacter): void;
  onRemove(): void;
}) {
  return (
    <>
      <div className="todo-item-label">
        <span className={`reset-badge ${item.resetDay}`}>
          {RESET_DAY_LABEL[item.resetDay]}
        </span>
        <span className="todo-item-name">{item.label}</span>
        <button className="icon-btn danger todo-item-remove" title="항목 삭제" onClick={onRemove}>
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
        const done = isChecked(item, c);
        return (
          <button
            key={c.id}
            className={'todo-cell' + (done ? ' done' : '')}
            onClick={() => onToggle(item, c)}
            aria-pressed={done}
            title={`${c.name} · ${item.label}`}
          >
            <span className="todo-check-circle">{done ? '✓' : ''}</span>
          </button>
        );
      })}
    </>
  );
}

function AddCharacterModal({
  existingNames,
  onAdd,
  onClose,
}: {
  existingNames: string[];
  onAdd(c: LookupCharacter): void;
  onClose(): void;
}) {
  const [name, setName] = useState('');
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
      setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const duplicated = result != null && existingNames.includes(result.name);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal todo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>체크리스트에 캐릭터 추가</h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="import-body">
          <div className="search-row">
            <input
              className="text-input"
              placeholder="캐릭터명을 입력하세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              autoFocus
            />
            <button
              className="btn primary"
              onClick={search}
              disabled={loading || !name.trim()}
            >
              {loading ? '조회 중…' : '검색'}
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
                {added ? '추가됨' : duplicated ? '등록됨' : '추가'}
              </button>
            </div>
          )}
          {duplicated && !added && (
            <p className="import-hint">이미 같은 이름의 캐릭터가 등록되어 있습니다.</p>
          )}
        </div>
      </div>
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
  const [label, setLabel] = useState('');
  const [resetDay, setResetDay] = useState<ResetDay>('thu');

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
              onKeyDown={(e) => e.key === 'Enter' && submit()}
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
            추가한 항목은 모든 캐릭터에서 기본 활성화되며, 캐릭터별 '항목 설정'에서
            사용 여부를 바꿀 수 있습니다.
          </p>
          <button className="btn primary" onClick={submit} disabled={!label.trim()}>
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

function CharacterSettingsModal({
  character,
  items,
  onToggle,
  onClose,
}: {
  character: TodoCharacter;
  items: TodoItem[];
  onToggle(itemId: string): void;
  onClose(): void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal todo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{character.name} · 항목 설정</h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="modal-sub">
          이 캐릭터의 체크리스트에 사용할 항목을 선택하세요. 해제한 항목은 표에서
          비활성화 표시됩니다.
        </p>
        <div className="todo-settings-list">
          {items.map((item) => {
            const enabled = !character.disabledItemIds.includes(item.id);
            return (
              <label
                key={item.id}
                className={'todo-settings-row' + (enabled ? ' on' : '')}
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
