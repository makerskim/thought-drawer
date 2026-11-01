// 앱 전체가 함께 쓰는 것: 라이브러리, 로그인, 설정값, 알림, 떠 있는 창
import { useState, useEffect } from './h.js';
import { themeByTime } from '../core/sun.js';

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
    prefSubs.forEach((fn) => fn(key, value));
  },
};
const prefSubs = new Set();

// 같은 값을 쓰는 다른 화면(설정 ↔ 옆 메뉴)도 함께 바뀐다
export function usePref(key, fallback) {
  const [v, setV] = useState(() => prefs.get(key, fallback));
  useEffect(() => {
    const on = (k, nv) => { if (k === key) setV(nv ?? fallback); };
    prefSubs.add(on);
    return () => prefSubs.delete(on);
  }, [key]);
  return [v, (nv) => { prefs.set(key, nv); setV(nv); }];
}

// 밝기: '' 자동(해 뜨면 밝게, 지면 어둡게) · 'system' 기기 설정 따라 · 'light' · 'dark'
export function applyAppearance() {
  const root = document.documentElement;
  const theme = prefs.get('theme', '');
  const font = prefs.get('font', '');
  const eff = theme === 'light' || theme === 'dark' ? theme : theme === 'system' ? '' : themeByTime();
  if (eff) root.dataset.theme = eff; else delete root.dataset.theme;
  if (font) root.dataset.font = font; else delete root.dataset.font;
  delete root.dataset.palette;
  // 브라우저 위쪽 막대 색도 같이
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    m.dataset.base ??= m.getAttribute('content');
    m.setAttribute('content', eff ? (eff === 'dark' ? '#000000' : '#f5f5f7') : m.dataset.base);
  }
}
// 자동이면 해가 뜨고 질 때 바뀌도록 1분마다, 그리고 앱으로 돌아올 때 다시 본다
export function keepAppearance() {
  setInterval(applyAppearance, 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') applyAppearance(); });
}

// ---- 서랍이의 말 (첫 화면의 서랍이가 말풍선으로 보여 주고, 다른 화면에서는 알림으로) ----
let speech = null;
let speechSeq = 0;
const speechSubs = new Set();
export function say(text, { mood = 'smile', ms = 4200, hop = false } = {}) {
  speech = { id: ++speechSeq, text, mood, hop, until: Date.now() + ms };
  speechSubs.forEach((fn) => fn(speech));
  return speechSubs.size > 0; // 듣는 서랍이가 있으면 true
}
export function useSpeech() {
  const [v, setV] = useState(null);
  useEffect(() => { speechSubs.add(setV); return () => speechSubs.delete(setV); }, []);
  return v;
}

// ---- 알림 ----
let toasts = [];
let seq = 0;
const toastSubs = new Set();
const emitToasts = () => toastSubs.forEach((fn) => fn([...toasts]));

export function toast(message, { action, onAction, duration = 3200, busy = false, mascot = false } = {}) {
  const id = ++seq;
  let timer;
  const close = () => { clearTimeout(timer); toasts = toasts.filter((t) => t.id !== id); emitToasts(); };
  const arm = (ms) => { clearTimeout(timer); if (ms) timer = setTimeout(close, ms); };
  toasts = [...toasts.slice(-2), { id, message, action, onAction: () => { close(); onAction?.(); }, busy, mascot }];
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
