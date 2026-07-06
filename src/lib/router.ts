import { useEffect, useState } from 'react';

export type Route =
  | { view: 'home' }
  | { view: 'character'; name: string; tab?: string };

function parse(): Route {
  const match = window.location.hash.match(/^#\/c\/([^?]+)(?:\?(.*))?$/);
  if (match) {
    const query = new URLSearchParams(match[2] ?? '');
    return {
      view: 'character',
      name: decodeURIComponent(match[1]),
      tab: query.get('tab') ?? undefined,
    };
  }
  return { view: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function gotoCharacter(name: string) {
  window.location.hash = `#/c/${encodeURIComponent(name.trim())}`;
}

export function gotoHome() {
  // 해시만 비우면 브라우저가 페이지 최상단으로 점프하는 것을 막기 위해 pushState 사용
  history.pushState(null, '', window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
