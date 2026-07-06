import { useEffect, useMemo, useState } from 'react';
import type { CharacterMeta } from '../types';
import { fetchDetail, searchCharacter, type DetailData } from '../lib/nexon';
import { gotoHome } from '../lib/router';
import { formatMeso } from '../lib/format';
import { CharacterAvatar } from '../components/CharacterAvatar';
import { EquipmentTab } from '../components/character/EquipmentTab';
import { StatTab } from '../components/character/StatTab';
import { UnionTab } from '../components/character/UnionTab';
import { SkillTab } from '../components/character/SkillTab';
import { CashTab } from '../components/character/CashTab';

type TabKey = 'equip' | 'stat' | 'union' | 'skill' | 'cash';

const TABS: { key: TabKey; label: string; parts: string[] }[] = [
  { key: 'equip', label: '장비', parts: ['item', 'symbol', 'set-effect'] },
  { key: 'stat', label: '스탯', parts: ['hyper-stat', 'ability', 'propensity'] },
  { key: 'union', label: '유니온', parts: ['union-raider', 'union-artifact', 'union-champion'] },
  { key: 'skill', label: '스킬 · HEXA', parts: ['link-skill', 'hexamatrix', 'hexa-stat', 'vmatrix'] },
  { key: 'cash', label: '코디 · 기타', parts: ['cash', 'beauty', 'android', 'pet'] },
];

/** 히어로에 보여줄 핵심 스탯 */
const HERO_STATS = [
  '보스 몬스터 데미지',
  '방어율 무시',
  '크리티컬 데미지',
  '최종 데미지',
  '데미지',
  '크리티컬 확률',
  '스타포스',
  '아케인포스',
  '어센틱포스',
  '메소 획득량',
  '아이템 드롭률',
  '버프 지속시간',
] as const;

interface Summary {
  ocid: string;
  basic: DetailData;
  stat: DetailData | null;
  popularity: number | null;
  union: DetailData | null;
  dojang: DetailData | null;
}

const isTabKey = (t: string | undefined): t is TabKey =>
  TABS.some((d) => d.key === t);

export function CharacterPage({
  name,
  initialTab,
  onAddToCalc,
}: {
  name: string;
  initialTab?: string;
  onAddToCalc(c: { name: string; meta: CharacterMeta }): void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(isTabKey(initialTab) ? initialTab : 'equip');
  const [tabData, setTabData] = useState<Partial<Record<TabKey, DetailData>>>({});
  const [tabLoading, setTabLoading] = useState(false);
  const [added, setAdded] = useState(false);

  // 캐릭터가 바뀌면 전체 초기화 후 요약 로딩
  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    setLoading(true);
    setTab(isTabKey(initialTab) ? initialTab : 'equip');
    setTabData({});
    setAdded(false);

    (async () => {
      try {
        const found = await searchCharacter(name);
        const detail = await fetchDetail(found.ocid, [
          'basic',
          'stat',
          'popularity',
          'union',
          'dojang',
        ]);
        if (cancelled) return;
        const pick = (part: string) =>
          detail[part] && !detail[part].error ? detail[part] : null;
        setSummary({
          ocid: found.ocid,
          basic: pick('basic') ?? {
            character_name: found.name,
            world_name: found.world,
            character_class: found.job,
            character_level: found.level,
            character_image: found.image,
          },
          stat: pick('stat'),
          popularity: pick('popularity')?.popularity ?? null,
          union: pick('union'),
          dojang: pick('dojang'),
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [name]);

  // 탭 데이터 지연 로딩
  useEffect(() => {
    if (!summary || tabData[tab]) return;
    const def = TABS.find((t) => t.key === tab)!;
    let cancelled = false;
    setTabLoading(true);
    fetchDetail(summary.ocid, def.parts)
      .then((d) => {
        if (!cancelled) setTabData((prev) => ({ ...prev, [tab]: d }));
      })
      .catch(() => {
        if (!cancelled) setTabData((prev) => ({ ...prev, [tab]: {} }));
      })
      .finally(() => {
        if (!cancelled) setTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, tab, tabData]);

  const statMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of summary?.stat?.final_stat ?? []) {
      map.set(s.stat_name, s.stat_value);
    }
    return map;
  }, [summary]);

  if (loading) {
    return (
      <div className="detail-loading">
        <div className="spinner" />
        <p>
          <strong>{name}</strong> 캐릭터 정보를 불러오는 중…
        </p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="detail-loading">
        <p className="notice warn">{error ?? '캐릭터 정보를 불러오지 못했습니다.'}</p>
        <button className="btn" onClick={gotoHome}>
          계산기로 돌아가기
        </button>
      </div>
    );
  }

  const b = summary.basic;
  const power = statMap.get('전투력');
  const minAtk = statMap.get('최소 스탯공격력');
  const maxAtk = statMap.get('최대 스탯공격력');
  const liberated = String(b.liberation_quest_clear ?? '') === '1';

  return (
    <div className="character-page">
      <div className="detail-hero">
        <div className="hero-left">
          <CharacterAvatar src={b.character_image} size={120} variant="full" />
          <div className="hero-profile">
            <div className="hero-name-row">
              <h2>{b.character_name}</h2>
              <span className="chip">{b.world_name}</span>
              {liberated && <span className="chip liberated">제네시스 해방</span>}
            </div>
            <p className="hero-sub">
              {b.character_class} · Lv.{b.character_level} ({b.character_exp_rate}%)
              {b.character_guild_name && ` · 길드 ${b.character_guild_name}`}
            </p>
            <div className="hero-badges">
              {summary.union?.union_level != null && (
                <span className="chip">유니온 {summary.union.union_level.toLocaleString('ko-KR')}</span>
              )}
              {summary.dojang?.dojang_best_floor != null &&
                summary.dojang.dojang_best_floor > 0 && (
                  <span className="chip">무릉 {summary.dojang.dojang_best_floor}층</span>
                )}
              {summary.popularity != null && (
                <span className="chip">인기도 {summary.popularity.toLocaleString('ko-KR')}</span>
              )}
            </div>
            <button
              className="btn primary sm hero-add"
              disabled={added}
              onClick={() => {
                onAddToCalc({
                  name: b.character_name,
                  meta: {
                    world: b.world_name,
                    job: b.character_class,
                    level: b.character_level,
                    image: b.character_image,
                  },
                });
                setAdded(true);
              }}
            >
              {added ? '계산기에 추가됨' : '보스 수익 계산기에 추가'}
            </button>
          </div>
        </div>

        <div className="hero-right">
          <span className="stat-label">전투력</span>
          <strong className="hero-power">
            {power ? formatMeso(Number(power)) : '-'}
          </strong>
          {minAtk && maxAtk && (
            <span className="plain-sub">
              스탯공격력 {formatMeso(Number(minAtk))} ~ {formatMeso(Number(maxAtk))}
            </span>
          )}
        </div>
      </div>

      {summary.stat && (
        <div className="hero-stat-grid">
          {HERO_STATS.map((label) => {
            const value = statMap.get(label);
            if (value == null) return null;
            const isPercent = !['스타포스', '아케인포스', '어센틱포스'].includes(label);
            return (
              <div key={label} className="hero-stat-cell">
                <span className="stat-cell-name">{label}</span>
                <span className="stat-cell-value">
                  {Number(value).toLocaleString('ko-KR')}
                  {isPercent && '%'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="detail-tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'tab' + (tab === t.key ? ' on' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabLoading || !tabData[tab] ? (
        <div className="detail-loading small">
          <div className="spinner" />
          <p>불러오는 중…</p>
        </div>
      ) : (
        <TabBody tab={tab} data={tabData[tab]!} summary={summary} />
      )}

      <p className="detail-footnote">
        데이터는 넥슨 Open API 기준이며 전일까지의 정보가 반영됩니다.
      </p>
    </div>
  );
}

function TabBody({
  tab,
  data,
  summary,
}: {
  tab: TabKey;
  data: DetailData;
  summary: Summary;
}) {
  switch (tab) {
    case 'equip':
      return <EquipmentTab data={data} />;
    case 'stat':
      return <StatTab stat={summary.stat} data={data} />;
    case 'union':
      return <UnionTab union={summary.union} data={data} />;
    case 'skill':
      return <SkillTab data={data} />;
    case 'cash':
      return <CashTab data={data} />;
  }
}
