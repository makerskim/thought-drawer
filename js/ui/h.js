// Preact + htm (빌드 없이 쓰는 JSX 대신 템플릿 문법)
import { h, render, Fragment, createContext } from '../vendor/preact.module.js';
import {
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext,
} from '../vendor/preact-hooks.module.js';
import htm from '../vendor/htm.module.js';

export const html = htm.bind(h);
export {
  h, render, Fragment, createContext,
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext,
};

export const cx = (...xs) => xs.filter(Boolean).join(' ');

// 입력할 때마다 높이를 내용에 맞춘다
export function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function useDebounced(fn, ms) {
  const t = useRef();
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => () => clearTimeout(t.current), []);
  return useCallback((...a) => { clearTimeout(t.current); t.current = setTimeout(() => f.current(...a), ms); }, [ms]);
}

// 브라우저는 나중에 그려진 요소의 autofocus를 무시하므로, 그려지는 순간 직접 커서를 옮긴다
export function useFocus(when = true) {
  const ref = useRef();
  useLayoutEffect(() => { if (when) ref.current?.focus(); }, []);
  return ref;
}
