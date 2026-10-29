// 주소(#/...)로 화면을 고른다. 주소창을 바꿀 수 없는 곳에서도 동작하도록 지금 주소를 따로 들고 있는다.
import { useState, useEffect } from './h.js';

let current = location.hash.startsWith('#/') ? location.hash : '#/';
let seq = 0; // 같은 주소로 다시 가도 새 화면을 그리게 하는 번호
const subs = new Set();
const notify = () => { seq += 1; subs.forEach((fn) => fn({ hash: current, seq })); };

export function parse(hash = current) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query), hash };
}

export function setUrl(hash, { push = false } = {}) {
  current = hash;
  try { history[push ? 'pushState' : 'replaceState'](null, '', hash); } catch { /* 주소창을 바꿀 수 없는 곳 */ }
}

export function go(hash, { replace = false } = {}) {
  if (hash === current) { notify(); return; }
  setUrl(hash, { push: !replace });
  notify();
}

export function back(fallback = '#/') {
  if (history.length > 1) history.back(); else go(fallback, { replace: true });
}

export function useRoute() {
  const [st, setSt] = useState({ hash: current, seq });
  useEffect(() => { subs.add(setSt); return () => subs.delete(setSt); }, []);
  return { ...parse(st.hash), seq: st.seq };
}

export function syncFromLocation() {
  if (location.hash.startsWith('#/')) current = location.hash;
  notify();
}

window.addEventListener('popstate', () => { current = location.hash.startsWith('#/') ? location.hash : '#/'; notify(); });
window.addEventListener('hashchange', () => {
  if (location.hash === current || !location.hash.startsWith('#/')) return;
  current = location.hash;
  notify();
});
// 앱 안 링크는 직접 받는다
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});

export const noteHref = (id) => `#/n/${encodeURIComponent(id)}`;
export const folderHref = (path) => `#/f/${encodeURIComponent(path)}`;
export const tagHref = (tag) => `#/t/${encodeURIComponent(tag)}`;
