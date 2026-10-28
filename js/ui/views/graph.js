// 그래프: 노트는 점, 연결은 선. 점에 올리면 이웃만 밝게 보인다 (옵시디언처럼).
import { html, useEffect, useRef } from '../h.js';
import { Icon } from '../icons.js';
import { useLib } from '../state.js';
import { go, noteHref } from '../router.js';
import { Topbar } from '../parts/shell.js';
import { Empty, titleOf } from '../parts/common.js';
import { categoryParts } from '../../core/note.js';
import { folderColor, GRAPH_COLORS } from '../format.js';

const topOf = (n) => (n.meta.status === 'inbox' ? '인박스' : categoryParts(n.meta.category)[0] ?? '인박스');

export function Graph() {
  const lib = useLib();
  const wrap = useRef();
  const canvas = useRef();
  const api = useRef({});
  const notes = lib.all;
  const groups = [...new Set(notes.map(topOf))];
  const colorFor = (g) => (g === '인박스' ? GRAPH_COLORS.gray : GRAPH_COLORS[folderColor(g)]);

  useEffect(() => {
    if (!notes.length) return undefined;
    const cv = canvas.current;
    const g = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = getComputedStyle(document.documentElement);
    const C = { text: css.getPropertyValue('--text').trim(), text3: css.getPropertyValue('--text-3').trim(), line: css.getPropertyValue('--border-2').trim(), bg: css.getPropertyValue('--bg').trim(), accent: css.getPropertyValue('--accent').trim() };
    let W = 0; let H = 0;
    const edges = lib.edges();
    const deg = new Map();
    edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); });
    const nodes = notes.map((n, i) => {
      const a = (i / notes.length) * Math.PI * 2;
      return { n, x: Math.cos(a) * 160, y: Math.sin(a) * 160, vx: 0, vy: 0, r: 3.5 + Math.min(6, (deg.get(n.id) ?? 0) * 1.2), c: colorFor(topOf(n)) };
    });
    const byId = new Map(nodes.map((d) => [d.n.id, d]));
    const links = edges.map(([a, b]) => [byId.get(a), byId.get(b)]).filter(([a, b]) => a && b);
    const nbr = new Map(nodes.map((d) => [d, new Set()]));
    links.forEach(([a, b]) => { nbr.get(a).add(b); nbr.get(b).add(a); });
    const view = { x: 0, y: 0, k: 1 };
    let touched = false; let hover = null; let drag = null; let pan = null; let moved = false; let alpha = 1; let ticks = 0;
    let pullX = 0.02; let pullY = 0.02;
    const resize = () => {
      const r = wrap.current.getBoundingClientRect();
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr;
      pullX = 0.02 * Math.max(1, H / W); pullY = 0.02 * Math.max(1, W / H);
    };
    resize();
    const step = () => {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x; let dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          if (d2 > 90000) continue;
          const f = (700 / d2) * alpha;
          dx *= f; dy *= f;
          a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
        }
        a.vx -= a.x * pullX * alpha; a.vy -= a.y * pullY * alpha;
      }
      for (const [a, b] of links) {
        const dx = b.x - a.x; const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - 80) / d) * 0.08 * alpha;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const d of nodes) { if (d === drag) continue; d.vx *= 0.8; d.vy *= 0.8; d.x += d.vx; d.y += d.vy; }
      alpha = Math.max(0.02, alpha * 0.985);
    };
    const fit = () => {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const d of nodes) { x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y); x1 = Math.max(x1, d.x); y1 = Math.max(y1, d.y); }
      view.k = Math.max(0.2, Math.min(1.6, (W - 160) / Math.max(1, x1 - x0), (H - 140) / Math.max(1, y1 - y0)));
      view.x = -((x0 + x1) / 2) * view.k; view.y = -((y0 + y1) / 2) * view.k - 10;
    };
    const sx = (x) => W / 2 + view.x + x * view.k;
    const sy = (y) => H / 2 + view.y + y * view.k;
    const draw = () => {
      if (!touched) fit();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const focus = hover && nbr.get(hover);
      for (const [a, b] of links) {
        const on = focus && (a === hover || b === hover);
        g.globalAlpha = focus && !on ? 0.12 : 1;
        g.strokeStyle = on ? C.accent : C.line; g.lineWidth = on ? 1.6 : 1;
        g.beginPath(); g.moveTo(sx(a.x), sy(a.y)); g.lineTo(sx(b.x), sy(b.y)); g.stroke();
      }
      for (const d of nodes) {
        const on = !focus || d === hover || focus.has(d);
        g.globalAlpha = on ? 1 : 0.15;
        g.beginPath(); g.arc(sx(d.x), sy(d.y), d === hover ? d.r + 2 : d.r, 0, Math.PI * 2);
        g.fillStyle = d === hover ? C.accent : d.c; g.fill();
      }
      g.globalAlpha = 1;
      g.font = "12px 'Pretendard Variable', Pretendard, system-ui, sans-serif";
      g.textAlign = 'center';
      const placed = [];
      const order = [...nodes].sort((a, b) => (b === hover) - (a === hover) || (focus ? (focus.has(b) - focus.has(a)) : 0) || (deg.get(b.n.id) ?? 0) - (deg.get(a.n.id) ?? 0));
      for (const d of order) {
        if (focus && d !== hover && !focus.has(d)) continue;
        const raw = titleOf(d.n);
        const t = raw.length > 14 ? `${raw.slice(0, 13)}…` : raw;
        const w = g.measureText(t).width;
        const x = sx(d.x); const y = sy(d.y) + d.r + 14;
        const box = [x - w / 2 - 3, y - 11, x + w / 2 + 3, y + 3];
        if (d !== hover && placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        placed.push(box);
        g.fillStyle = d === hover ? C.text : C.text3;
        g.fillText(t, x, y);
      }
    };
    let raf = 0; let alive = true;
    const loop = () => { raf = 0; if (!alive) return; if (ticks < 420 || drag) { step(); ticks++; } draw(); if (ticks < 420 || drag || pan) raf = requestAnimationFrame(loop); };
    const kick = () => { if (!raf && alive) raf = requestAnimationFrame(loop); };
    kick();
    const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return { x: (cx - r.left - W / 2 - view.x) / view.k, y: (cy - r.top - H / 2 - view.y) / view.k }; };
    const pick = (cx, cy) => {
      const p = toWorld(cx, cy); let best = null; let bd = Infinity;
      for (const d of nodes) { const dd = Math.hypot(d.x - p.x, d.y - p.y) * view.k; if (dd < d.r + 10 && dd < bd) { best = d; bd = dd; } }
      return best;
    };
    const ptrs = new Map(); let pinch = null;
    const down = (e) => {
      kick(); cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; drag = null; pan = null; touched = true; return; }
      moved = false; drag = pick(e.clientX, e.clientY);
      if (!drag) pan = { x: e.clientX - view.x, y: e.clientY - view.y }; else { alpha = Math.max(alpha, 0.3); ticks = 0; }
    };
    const move = (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; view.k = Math.min(3, Math.max(0.2, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); kick(); return; }
      if (drag) { const p = toWorld(e.clientX, e.clientY); drag.x = p.x; drag.y = p.y; drag.vx = 0; drag.vy = 0; moved = true; touched = true; kick(); return; }
      if (pan) { if (Math.abs(e.clientX - pan.x - view.x) + Math.abs(e.clientY - pan.y - view.y) > 2) { moved = true; touched = true; } view.x = e.clientX - pan.x; view.y = e.clientY - pan.y; kick(); return; }
      const h = pick(e.clientX, e.clientY);
      if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; kick(); }
    };
    const up = (e) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
      if (drag && !moved) go(noteHref(drag.n.id));
      drag = null; pan = null;
    };
    const wheel = (e) => { e.preventDefault(); touched = true; view.k = Math.min(3, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); kick(); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (hover && !drag) { hover = null; kick(); } });
    cv.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => { resize(); kick(); }); ro.observe(wrap.current);
    api.current = { zoom: (f) => { touched = true; view.k = Math.min(3, Math.max(0.2, view.k * f)); kick(); }, fit: () => { touched = false; kick(); } };
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [notes.length, lib.edges().length]);

  return html`
    <${Topbar} crumbs=${[{ label: '그래프' }]} lined />
    ${notes.length
      ? html`<div class="graph" ref=${wrap}>
          <canvas ref=${canvas} aria-label="노트 연결 그래프. 점을 누르면 노트가 열려요."></canvas>
          <div class="g-ctrl">
            <button type="button" class="icon-btn" aria-label="확대" onClick=${() => api.current.zoom(1.2)}><${Icon} name="zoomIn" /></button>
            <button type="button" class="icon-btn" aria-label="축소" onClick=${() => api.current.zoom(0.83)}><${Icon} name="zoomOut" /></button>
            <button type="button" class="icon-btn" aria-label="전체 보기" onClick=${() => api.current.fit()}><${Icon} name="fit" /></button>
          </div>
          <div class="g-legend">${groups.map((gr) => html`<span key=${gr}><i style=${`background:${colorFor(gr)}`}></i>${gr}</span>`)}</div>
        </div>`
      : html`<div class="page narrow"><${Empty} icon="graph" title="아직 그릴 노트가 없어요" text="노트가 쌓이고 서로 이어지면 여기에 생각의 지도가 그려져요." /></div>`}`;
}
