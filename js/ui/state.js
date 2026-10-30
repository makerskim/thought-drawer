// 앱 전체가 함께 쓰는 것: 라이브러리, 로그인, 설정값, 알림, 떠 있는 창
import { useState, useEffect } from './h.js';

export const app = {
  lib: null,
  auth: null,
  profile: null,
  // 화면이 채우는 동작들 (App, 서랍, 옆 창)
  pickPhotos: () => {},
  reconnect: () => {},
  find: () => {}, // 위쪽 칸으로 커서 옮기기
  closeSheet: () => {},
  visible: [], // 지금 서랍에 보이는 노트 순서 (옆 창의 이전·다음)
};

// 라이브러리가 바뀔 때마다 다시 그리게 한다
export function useLib() {
  const [, set] = useState(0);
  useEffect(() => app.lib?.onChange(() => set((x) => x + 1)), [app.lib]);
  return app.lib;
}

// ---- 설정값 (이 기기에만) ----
const PREFIX = 'td.';
export const prefs = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { value == null ? localStorage.removeItem(PREFIX + key) : localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 저장 불가 */ }
  },
};

export function usePref(key, fallback) {
  const [v, setV] = useState(() => prefs.get(key, fallback));
  return [v, (nv) => { prefs.set(key, nv); setV(nv); }];
}

export function applyAppearance() {
  const root = document.documentElement;
  const theme = prefs.get('theme', '');
  const font = prefs.get('font', '');
  const palette = prefs.get('palette', '');
  if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  if (font) root.dataset.font = font; else delete root.dataset.font;
  if (palette) root.dataset.palette = palette; else delete root.dataset.palette;
}

// ---- 알림 ----
let toasts = [];
let seq = 0;
const toastSubs = new Set();
const emitToasts = () => toastSubs.forEach((fn) => fn([...toasts]));

export function toast(message, { action, onAction, duration = 3200, busy = false } = {}) {
  const id = ++seq;
  let timer;
  const close = () => { clearTimeout(timer); toasts = toasts.filter((t) => t.id !== id); emitToasts(); };
  const arm = (ms) => { clearTimeout(timer); if (ms) timer = setTimeout(close, ms); };
  toasts = [...toasts.slice(-2), { id, message, action, onAction: () => { close(); onAction?.(); }, busy }];
  emitToasts();
  arm(busy ? 0 : duration);
  return {
    update(msg, opts = {}) {
      toasts = toasts.map((t) => (t.id === id ? { ...t, message: msg, busy: opts.busy ?? false, action: opts.action, onAction: () => { close(); opts.onAction?.(); } } : t));
      emitToasts();
      arm(opts.busy ? 0 : (opts.duration ?? 3200));
    },
    close,
  };
}

export function useToasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => { toastSubs.add(setList); return () => toastSubs.delete(setList); }, []);
  return list;
}

// ---- 드라이브 연결 문제 (위 막대 아래 띠로 보여 준다) ----
let conn = null;
const connSubs = new Set();
export function setConn(v) { conn = v; connSubs.forEach((fn) => fn(v)); }
export function useConn() {
  const [v, setV] = useState(conn);
  useEffect(() => { connSubs.add(setV); return () => connSubs.delete(setV); }, []);
  return v;
}
