import { useEffect, useState } from 'react';

export type Route =
  | { view: 'home' }
  | { view: 'lookup' }
  | { view: 'todo' }
  | { view: 'character'; name: string; tab?: string };

function parse(): Route {
  const hash = window.location.hash;
  const match = hash.match(/^#\/c\/([^?]+)(?:\?(.*))?$/);
  if (match) {
    const query = new URLSearchParams(match[2] ?? '');
    return {
      view: 'character',
      name: decodeURIComponent(match[1]),
      tab: query.get('tab') ?? undefined,
    };
  }
  if (hash.startsWith('#/lookup')) return { view: 'lookup' };
  if (hash.startsWith('#/calc')) return { view: 'home' };
  if (hash.startsWith('#/todo')) return { view: 'todo' };
  // 기본 랜딩은 체크리스트
  return { view: 'todo' };
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

export function gotoLookup() {
  window.location.hash = '#/lookup';
}

export function gotoTodo() {
  window.location.hash = '#/todo';
}

export function gotoHome() {
  window.location.hash = '#/calc';
}
