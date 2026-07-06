const JO = 1_0000_0000_0000;
const EOK = 1_0000_0000;
const MAN = 1_0000;

/** 메소를 한국식 단위(조/억/만)로 표기. 예) 4,712,000,000 → "47억 1,200만" */
export function formatMeso(n: number): string {
  if (!Number.isFinite(n)) return '-';
  if (n < 0) return `-${formatMeso(-n)}`;
  if (n === 0) return '0';

  const jo = Math.floor(n / JO);
  const eok = Math.floor((n % JO) / EOK);
  const man = Math.floor((n % EOK) / MAN);
  const rest = n % MAN;

  const parts: string[] = [];
  if (jo > 0) parts.push(`${jo.toLocaleString('ko-KR')}조`);
  if (eok > 0) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man > 0) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (rest > 0) parts.push(rest.toLocaleString('ko-KR'));
  return parts.join(' ');
}

/** 쉼표 포함 전체 숫자 표기 */
export function formatFull(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 로컬(사용자) 기준 오늘 날짜 YYYY-MM-DD */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
