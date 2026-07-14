import type { ResetType } from '../types';
import { BOSSES, DATA_SOURCE, DIFFICULTY_LABEL, RESET_LABEL } from '../data/crystalData';
import { priceAt } from '../lib/calc';
import { formatFull, formatMeso } from '../lib/format';

export function PriceTable({ today, onClose }: { today: string; onClose(): void }) {
  const groups: ResetType[] = ['weekly', 'monthly'];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            결정석 가격표 <span className="modal-sub">{today} 기준</span>
          </h2>
          <button className="btn ghost sm" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="modal-source">
          출처:{' '}
          <a href={DATA_SOURCE.url} target="_blank" rel="noreferrer">
            {DATA_SOURCE.label}
          </a>{' '}
          · 데이터 확인일 {DATA_SOURCE.verifiedAt}
        </p>
        <div className="modal-body">
          {groups.map((reset) => {
            const rows = BOSSES.filter((b) => b.reset === reset)
              .flatMap((b) =>
                b.variants.map((v) => ({
                  boss: b,
                  variant: v,
                  price: priceAt(v, today),
                })),
              )
              .sort((a, b) => a.price - b.price);
            return (
              <section key={reset}>
                <h3>{RESET_LABEL[reset]} 보스</h3>
                <table>
                  <thead>
                    <tr>
                      <th>보스</th>
                      <th>난이도</th>
                      <th>결정석 가격</th>
                      <th className="num">메소</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ boss, variant, price }) => (
                      <tr key={`${boss.id}-${variant.difficulty}`}>
                        <td>{boss.name}</td>
                        <td>
                          <span className={'pill static ' + variant.difficulty}>
                            {DIFFICULTY_LABEL[variant.difficulty]}
                          </span>
                        </td>
                        <td className="num">{formatMeso(price)}</td>
                        <td className="num dim">{formatFull(price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
