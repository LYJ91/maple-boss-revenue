import { useState } from 'react';
import type { CharacterMeta } from '../types';
import { RULES } from '../data/crystalData';
import { fetchAccountCharacters, searchCharacter, type LookupCharacter } from '../lib/nexon';
import { CharacterAvatar } from './CharacterAvatar';

interface Props {
  /** 추가 가능한 남은 캐릭터 슬롯 수 */
  remainingSlots: number;
  /** 이미 등록된 캐릭터 이름 목록 (중복 안내용) */
  existingNames: string[];
  onAdd(list: { name: string; meta: CharacterMeta }[]): void;
  onClose(): void;
}

type Tab = 'search' | 'account';

export function ImportModal({ remainingSlots, existingNames, onAdd, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('search');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>캐릭터 불러오기</h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="tab-bar">
          <button
            className={'tab' + (tab === 'search' ? ' on' : '')}
            onClick={() => setTab('search')}
          >
            캐릭터명 검색
          </button>
          <button
            className={'tab' + (tab === 'account' ? ' on' : '')}
            onClick={() => setTab('account')}
          >
            내 계정 캐릭터
          </button>
        </div>

        {tab === 'search' ? (
          <SearchTab
            remainingSlots={remainingSlots}
            existingNames={existingNames}
            onAdd={onAdd}
          />
        ) : (
          <AccountTab
            remainingSlots={remainingSlots}
            existingNames={existingNames}
            onAdd={onAdd}
          />
        )}
      </div>
    </div>
  );
}

function toMeta(c: LookupCharacter): CharacterMeta {
  return { world: c.world, job: c.job, level: c.level, image: c.image };
}

function SearchTab({
  remainingSlots,
  existingNames,
  onAdd,
}: Omit<Props, 'onClose'>) {
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
        <button className="btn primary" onClick={search} disabled={loading || !name.trim()}>
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
            disabled={added || remainingSlots <= 0}
            onClick={() => {
              onAdd([{ name: result.name, meta: toMeta(result) }]);
              setAdded(true);
            }}
          >
            {added ? '추가됨' : remainingSlots <= 0 ? '슬롯 없음' : '계산기에 추가'}
          </button>
        </div>
      )}
      {duplicated && !added && (
        <p className="import-hint">이미 같은 이름의 캐릭터가 등록되어 있습니다.</p>
      )}
    </div>
  );
}

function AccountTab({
  remainingSlots,
  existingNames,
  onAdd,
}: Omit<Props, 'onClose'>) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<LookupCharacter[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!apiKey.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setList(await fetchAccountCharacters(apiKey));
      setChecked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (ocid: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(ocid)) {
        next.delete(ocid);
      } else if (next.size < remainingSlots) {
        next.add(ocid);
      }
      return next;
    });
  };

  const addSelected = () => {
    if (!list) return;
    const selected = list.filter((c) => checked.has(c.ocid));
    onAdd(selected.map((c) => ({ name: c.name, meta: toMeta(c) })));
    setChecked(new Set());
  };

  return (
    <div className="import-body">
      <p className="import-desc">
        본인의{' '}
        <a href="https://openapi.nexon.com" target="_blank" rel="noreferrer">
          넥슨 Open API
        </a>{' '}
        키(live_로 시작)를 입력하면 계정의 전체 캐릭터를 불러옵니다. 키는 조회에만
        사용되며 저장되지 않습니다.
      </p>
      <div className="search-row">
        <input
          className="text-input"
          type="password"
          placeholder="live_..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button className="btn primary" onClick={load} disabled={loading || !apiKey.trim()}>
          {loading ? '조회 중…' : '불러오기'}
        </button>
      </div>

      {error && <p className="notice warn">{error}</p>}

      {list && (
        <>
          <div className="account-toolbar">
            <span className="import-hint">
              캐릭터 {list.length}개 · 선택 {checked.size}개 (남은 슬롯 {remainingSlots}개,
              최대 {RULES.maxCharacters}캐릭터)
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
              const exists = existingNames.includes(c.name);
              return (
                <label
                  key={c.ocid}
                  className={'account-row' + (checked.has(c.ocid) ? ' on' : '')}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(c.ocid)}
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
