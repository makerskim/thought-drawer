// 연결 지도: 카드는 점, 연결은 선. 큰 서랍마다 색을 달리한다.

import { esc } from '../dom.js';
import { displayTitle, categoryParts } from '../../core/note.js';

const HUES = ['#3b6fb6', '#c0533f', '#3f8a5a', '#a07a2c', '#7b58a8', '#2f8c8c', '#b5487a', '#6b7a3a'];

export function graph(ctx) {
  const { lib } = ctx;
  ctx.top({ title: '연결 지도', back: '#/' });
  const notes = lib.all.filter((n) => n.meta.type !== 'map');
  const edges = lib.edges();
  const tops = [...new Set(notes.map((n) => categoryParts(n.meta.category)[0] ?? '정리 대기'))];
  const color = (n) => HUES[tops.indexOf(categoryParts(n.meta.category)[0] ?? '정리 대기') % HUES.length];
  ctx.el.innerHTML = `
    <div class="page-head"><h1>연결 지도</h1><p>선으로 이어진 카드끼리는 서로 관련이 있어요. 점을 누르면 카드가 열려요.</p></div>
    <div class="graph-wrap" id="gw"><canvas id="cv" aria-label="카드 연결 지도"></canvas>
      <div class="legend">${tops.map((t) => `<span><i style="background:${HUES[tops.indexOf(t) % HUES.length]}"></i>${esc(t)}</span>`).join('')}</div></div>`;
  if (!notes.length) return;

  const wrap = ctx.el.querySelector('#gw');
  const cv = ctx.el.querySelector('#cv');
  const g = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const degree = new Map();
  edges.forEach(([a, b]) => { degree.set(a, (degree.get(a) ?? 0) + 1); degree.set(b, (degree.get(b) ?? 0) + 1); });
  const nodes = notes.map((n, i) => {
    const a = (i / notes.length) * Math.PI * 2;
    return { n, x: Math.cos(a) * 120 + (i % 7), y: Math.sin(a) * 120 - (i % 5), vx: 0, vy: 0, r: 5 + Math.min(7, (degree.get(n.id) ?? 0) * 1.6), c: color(n) };
  });
  const byId = new Map(nodes.map((d) => [d.n.id, d]));
  const links = edges.map(([a, b]) => [byId.get(a), byId.get(b)]).filter(([a, b]) => a && b);
  const view = { x: 0, y: 0, k: 1 };
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--ink').trim();
  const line = css.getPropertyValue('--line').trim();
  const card = css.getPropertyValue('--card').trim();

  const resize = () => {
    const r = wrap.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
  };
  resize();

  let alpha = 1;
  // 화면이 세로로 길면 가로로 더 세게 당겨서 화면 모양에 맞게 퍼지게 한다
  let pullX = 0.02;
  let pullY = 0.02;
  const shape = () => { pullX = 0.02 * Math.max(1, H / W); pullY = 0.02 * Math.max(1, W / H); };
  shape();
  const step = () => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x; let dy = a.y - b.y;
        const d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 90000) continue; // 멀리 떨어진 카드끼리는 밀어내지 않는다
        const f = (700 / d2) * alpha;
        dx *= f; dy *= f;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
      a.vx -= a.x * pullX * alpha; a.vy -= a.y * pullY * alpha;
    }
    for (const [a, b] of links) {
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - 90) / d) * 0.08 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const d of nodes) {
      if (d === drag) continue;
      d.vx *= 0.82; d.vy *= 0.82; d.x += d.vx; d.y += d.vy;
    }
    alpha = Math.max(0.02, alpha * 0.985);
  };

  // 사용자가 움직이기 전까지는 전체가 한 화면에 들어오게 맞춘다
  let touched = false;
  const fit = () => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const d of nodes) { x0 = Math.min(x0, d.x); y0 = Math.min(y0, d.y); x1 = Math.max(x1, d.x); y1 = Math.max(y1, d.y); }
    const k = Math.min(1.4, (W - 150) / Math.max(1, x1 - x0), (H - 130) / Math.max(1, y1 - y0));
    view.k = Math.max(0.2, k);
    view.x = -((x0 + x1) / 2) * view.k;
    view.y = -((y0 + y1) / 2) * view.k - 18;
  };

  const draw = () => {
    if (!touched) fit();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const sx = (x) => W / 2 + view.x + x * view.k;
    const sy = (y) => H / 2 + view.y + y * view.k;
    g.strokeStyle = line; g.lineWidth = 1.2;
    g.beginPath();
    for (const [a, b] of links) { g.moveTo(sx(a.x), sy(a.y)); g.lineTo(sx(b.x), sy(b.y)); }
    g.stroke();
    for (const d of nodes) {
      g.beginPath(); g.arc(sx(d.x), sy(d.y), d.r, 0, Math.PI * 2);
      g.fillStyle = d.n.meta.status === 'inbox' ? card : d.c; g.fill();
      g.lineWidth = 2; g.strokeStyle = d === hover ? ink : (d.n.meta.status === 'inbox' ? d.c : card); g.stroke();
    }
    // 이름표는 연결이 많은 카드부터, 겹치는 건 건너뛴다 (가리킨 카드는 항상)
    g.font = "12px 'IBM Plex Sans KR', sans-serif";
    g.textAlign = 'center';
    const placed = [];
    const order = [...nodes].sort((a, b) => (b === hover) - (a === hover) || (degree.get(b.n.id) ?? 0) - (degree.get(a.n.id) ?? 0));
    for (const d of order) {
      const raw = displayTitle(d.n.meta, d.n.body ?? d.n.snippet);
      const t = raw.length > 12 ? `${raw.slice(0, 11)}…` : raw;
      const w = g.measureText(t).width;
      const x = sx(d.x); const y = sy(d.y) + d.r + 14;
      const box = [x - w / 2 - 2, y - 11, x + w / 2 + 2, y + 3];
      if (d !== hover && placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      g.fillStyle = card; g.globalAlpha = 0.8; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); g.globalAlpha = 1;
      g.fillStyle = ink; g.fillText(t, x, y);
    }
  };

  // 배치가 자리 잡으면 멈추고, 만지거나 크기가 바뀔 때만 다시 그린다
  let raf = 0;
  let running = true;
  let ticks = 0;
  const loop = () => {
    raf = 0;
    if (!running) return;
    if (ticks < 400 || drag) { step(); ticks++; }
    draw();
    if (ticks < 400 || drag || pan || pinch) raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && running) raf = requestAnimationFrame(loop); };
  kick();

  const toWorld = (cx, cy) => {
    const r = cv.getBoundingClientRect();
    return { x: (cx - r.left - W / 2 - view.x) / view.k, y: (cy - r.top - H / 2 - view.y) / view.k };
  };
  const toScreenDist = (dd) => dd * view.k;
  const pick = (cx, cy) => {
    const p = toWorld(cx, cy);
    let best = null; let bd = Infinity;
    for (const d of nodes) { const dd = toScreenDist(Math.hypot(d.x - p.x, d.y - p.y)); if (dd < d.r + 10 && dd < bd) { best = d; bd = dd; } }
    return best;
  };
  let drag = null; let hover = null; let pan = null; let moved = false;
  const pointers = new Map();
  let pinch = null;
  cv.addEventListener('pointerdown', (e) => {
    kick();
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; drag = null; pan = null; return; }
    moved = false;
    drag = pick(e.clientX, e.clientY);
    touched = true;
    if (!drag) pan = { x: e.clientX - view.x, y: e.clientY - view.y };
    else { alpha = Math.max(alpha, 0.3); ticks = 0; }
  });
  cv.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; view.k = Math.min(3, Math.max(0.35, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); kick(); return; }
    if (drag) { const p = toWorld(e.clientX, e.clientY); drag.x = p.x; drag.y = p.y; drag.vx = drag.vy = 0; moved = true; kick(); return; }
    if (pan) { view.x = e.clientX - pan.x; view.y = e.clientY - pan.y; moved = true; kick(); return; }
    const h = pick(e.clientX, e.clientY);
    if (h !== hover) { hover = h; kick(); }
    cv.style.cursor = hover ? 'pointer' : 'grab';
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !moved) ctx.go(`#/n/${drag.n.id}`);
    drag = null; pan = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); touched = true; view.k = Math.min(3, Math.max(0.35, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); kick(); }, { passive: false });
  const ro = new ResizeObserver(() => { resize(); shape(); kick(); });
  ro.observe(wrap);
  ctx.cleanup(() => { running = false; cancelAnimationFrame(raf); ro.disconnect(); });
}
