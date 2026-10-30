// 떠 있는 창(메뉴, 팔레트, 대화상자)은 화면 맨 위 한곳에 그린다.
// 그래야 흐림 효과나 움직임이 있는 부모 안에서도 위치가 틀어지지 않는다.
import { html, useState, useEffect, useLayoutEffect, useRef, cx } from '../h.js';
import { useToasts } from '../state.js';

let layers = [];
let seq = 0;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn([...layers]));

export function openLayer(render, opts = {}) {
  const id = ++seq;
  const close = () => { layers = layers.filter((l) => l.id !== id); emit(); opts.onClose?.(); };
  layers = [...layers, { id, render, close, ...opts }];
  emit();
  return close;
}

export function closeAll() { layers.forEach((l) => l.onClose?.()); layers = []; emit(); }

// 기준 요소 아래에 붙는 작은 메뉴
export function popover(anchor, render, opts = {}) {
  const rect = anchor.getBoundingClientRect();
  anchor.setAttribute('aria-expanded', 'true');
  return openLayer(render, { kind: 'pop', rect, width: opts.width, onClose: () => { anchor.setAttribute('aria-expanded', 'false'); opts.onClose?.(); } });
}

export function modal(render, opts = {}) {
  return openLayer(render, { kind: 'modal', ...opts });
}

function Pop({ layer }) {
  const ref = useRef();
  const [pos, setPos] = useState({ left: layer.rect.left, top: layer.rect.bottom + 4, opacity: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const r = layer.rect;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    left = Math.max(8, left);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ left, top, opacity: 1 });
  }, []);
  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target)) layer.close(); };
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', onDown); };
  }, []);
  return html`<div class="pop" ref=${ref} role="menu" style=${`left:${pos.left}px;top:${pos.top}px;opacity:${pos.opacity};${layer.width ? `width:${layer.width}px` : ''}`}>${layer.render(layer.close)}</div>`;
}

function Modal({ layer }) {
  return html`<div class=${cx('overlay', layer.cls)} onPointerDown=${(e) => { if (e.target === e.currentTarget) layer.close(); }}>${layer.render(layer.close)}</div>`;
}

// 스스로 화면 전체를 그리는 것 (사용법 안내)
function Bare({ layer }) {
  return layer.render(layer.close);
}

export function Layers() {
  const [list, setList] = useState(layers);
  useEffect(() => { subs.add(setList); return () => subs.delete(setList); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && layers.length) { e.preventDefault(); layers.at(-1).close(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return html`${list.map((l) => (l.kind === 'pop' ? html`<${Pop} key=${l.id} layer=${l} />`
    : l.kind === 'bare' ? html`<${Bare} key=${l.id} layer=${l} />`
    : html`<${Modal} key=${l.id} layer=${l} />`))}`;
}

export function Toasts() {
  const list = useToasts();
  return html`<div class="toasts" role="status" aria-live="polite">
    ${list.map((t) => html`<div class="toast" key=${t.id}>
      ${t.busy && html`<span class="spin" aria-hidden="true"></span>`}
      <span>${t.message}</span>
      ${t.action && html`<button onClick=${t.onAction}>${t.action}</button>`}
    </div>`)}
  </div>`;
}

// 키보드로 위아래 이동하는 목록 (메뉴, 팔레트 공용)
export function useListNav(count, onPick, deps = []) {
  // 목록이 바뀌면(검색어가 바뀌면) 그 자리에서 첫 줄로 돌아간다. 효과(effect)로 미루면 빠른 입력과 엇갈린다.
  const key = JSON.stringify(deps);
  const [st, setSt] = useState({ i: 0, k: key });
  const idx = st.k === key ? Math.min(st.i, Math.max(0, count - 1)) : 0;
  const setIdx = (v) => setSt((prev) => {
    const cur = prev.k === key ? prev.i : 0;
    return { i: typeof v === 'function' ? v(cur) : v, k: key };
  });
  const onKeyDown = (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(count - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (count) onPick(idx); }
  };
  return [idx, setIdx, onKeyDown];
}
