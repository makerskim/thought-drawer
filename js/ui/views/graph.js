// 생각 지도: 노트는 점, 이은 연결은 실선, 앱이 찾은 추천 연결(비슷한 노트)은 점선. 같은 서랍끼리 모인다.
// 점에 올리면 이웃만 밝아지고, 오른쪽 아래에 왜 이어졌는지 보여 준다 (옵시디언처럼).
import { html, useEffect, useRef, useState } from '../h.js';
import { Icon } from '../icons.js';
import { app, useLib, usePref } from '../state.js';
import { go, noteHref } from '../router.js';
import { PageBar } from '../parts/shell.js';
import { Empty, titleOf } from '../parts/common.js';
import { folderColor, GRAPH_COLORS } from '../format.js';
import { categoryOf, categoryLook } from '../categories.js';
import { suggestedEdges } from '../related.js';

const topOf = (n) => categoryOf(n, app.lib).name;

export function Graph() {
  const lib = useLib();
  const wrap = useRef();
  const canvas = useRef();
  const api = useRef({});
  const notes = lib.all;
  const groups = [...new Set(notes.map(topOf))];
  // 서랍 색은 다른 화면(카드의 점, 옆 메뉴)과 같은 차분한 색
  const tone = (g) => getComputedStyle(document.documentElement).getPropertyValue(`--d${categoryLook(g).tone}`).trim();
  const colorFor = (g) => (g === '기타' ? GRAPH_COLORS.gray : tone(g) || GRAPH_COLORS[folderColor(g)]);
  const [showAuto, setShowAuto] = usePref('graphAuto', true);
  const [info, setInfo] = useState(null);
  const manual = lib.edges();
  const auto = showAuto ? suggestedEdges(lib) : [];

  useEffect(() => {
    if (!notes.length) return undefined;
    const cv = canvas.current;
    const g = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = getComputedStyle(document.documentElement);
    const C = { text: css.getPropertyValue('--text').trim(), text3: css.getPropertyValue('--text-3').trim(), line: css.getPropertyValue('--border-2').trim(), bg: css.getPropertyValue('--bg').trim(), accent: css.getPropertyValue('--accent').trim() };
    let W = 0; let H = 0;
    const edges = [...manual.map(([a, b]) => ({ a, b, auto: false })), ...auto.map((e) => ({ ...e, auto: true }))];
    const deg = new Map();
    edges.forEach(({ a, b, auto: dashed }) => { const w = dashed ? 0.5 : 1; deg.set(a, (deg.get(a) ?? 0) + w); deg.set(b, (deg.get(b) ?? 0) + w); });
    // 처음 자리: 같은 서랍끼리 같은 방향에
    const gi = new Map(groups.map((gname, i) => [gname, i]));
    const nodes = notes.map((n, i) => {
      const a = ((gi.get(topOf(n)) ?? 0) / Math.max(1, groups.length)) * Math.PI * 2 + (i % 7) * 0.08;
      return { n, g: topOf(n), x: Math.cos(a) * 160 + (i % 5) * 6, y: Math.sin(a) * 160 + (i % 3) * 6, vx: 0, vy: 0, r: 3.5 + Math.min(6, (deg.get(n.id) ?? 0) * 1.2), c: colorFor(topOf(n)) };
    });
    const byId = new Map(nodes.map((d) => [d.n.id, d]));
    const links = edges.map((e) => ({ s: byId.get(e.a), t: byId.get(e.b), auto: e.auto, why: e.why ?? [], score: e.score ?? 1 })).filter((l) => l.s && l.t);
    const nbr = new Map(nodes.map((d) => [d, new Set()]));
    links.forEach(({ s: a, t: b }) => { nbr.get(a).add(b); nbr.get(b).add(a); });
    const tell = (d) => setInfo(d ? {
      title: titleOf(d.n), where: d.g,
      items: links.filter((l) => l.s === d || l.t === d).map((l) => ({ id: (l.s === d ? l.t : l.s).n.id, title: titleOf((l.s === d ? l.t : l.s).n), auto: l.auto, why: l.why, score: l.score }))
        .sort((x, y) => x.auto - y.auto || y.score - x.score).slice(0, 5),
    } : null);
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
          const f = ((a.g === b.g ? 260 : 900) / d2) * alpha; // 같은 서랍끼리는 덜 밀어서 모이게
          dx *= f; dy *= f;
          a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
        }
        a.vx -= a.x * pullX * alpha; a.vy -= a.y * pullY * alpha;
      }
      for (const { s: a, t: b, auto: dashed, score } of links) {
        const dx = b.x - a.x; const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - (dashed ? 95 : 80)) / d) * (dashed ? 0.03 + Math.min(0.04, score * 0.05) : 0.08) * alpha;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      // 같은 서랍끼리 모이게: 서랍마다 가운데로 살짝 당긴다
      const mid = new Map();
      for (const d of nodes) { const m = mid.get(d.g) ?? { x: 0, y: 0, n: 0 }; m.x += d.x; m.y += d.y; m.n++; mid.set(d.g, m); }
      for (const d of nodes) { const m = mid.get(d.g); if (m.n < 2 || d.g === '기타') continue; d.vx += (m.x / m.n - d.x) * 0.035 * alpha; d.vy += (m.y / m.n - d.y) * 0.035 * alpha; }
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
      // 같은 서랍 묶음: 옅은 동그라미와 이름
      if (!focus) {
        const by = new Map();
        for (const d of nodes) { if (!by.has(d.g)) by.set(d.g, []); by.get(d.g).push(d); }
        g.font = "600 11.5px 'Pretendard Variable', Pretendard, system-ui, sans-serif";
        g.textAlign = 'center';
        for (const [name, ds] of by) {
          if (ds.length < 2 || name === '기타') continue;
          const cx = ds.reduce((t, d) => t + d.x, 0) / ds.length;
          const cy = ds.reduce((t, d) => t + d.y, 0) / ds.length;
          const r = Math.min(240, Math.max(...ds.map((d) => Math.hypot(d.x - cx, d.y - cy) + d.r)) + 26);
          g.globalAlpha = 0.08; g.fillStyle = ds[0].c;
          g.beginPath(); g.arc(sx(cx), sy(cy), r * view.k, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 0.75; g.fillStyle = C.text3;
          g.fillText(name, sx(cx), sy(cy) - r * view.k + 14);
        }
        g.globalAlpha = 1;
      }
      for (const { s: a, t: b, auto: dashed } of links) {
        const on = focus && (a === hover || b === hover);
        g.globalAlpha = focus && !on ? 0.1 : dashed ? 0.7 : 1;
        g.setLineDash(dashed ? [3, 4] : []);
        g.strokeStyle = on ? C.accent : dashed ? C.text3 : C.line; g.lineWidth = on ? 1.6 : dashed ? 1 : 1.3;
        g.beginPath(); g.moveTo(sx(a.x), sy(a.y)); g.lineTo(sx(b.x), sy(b.y)); g.stroke();
      }
      g.setLineDash([]);
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
      if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; tell(h); kick(); }
    };
    const up = (e) => {
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
      if (drag && !moved) go(noteHref(drag.n.id));
      drag = null; pan = null;
    };
    const wheel = (e) => { e.preventDefault(); touched = true; view.k = Math.min(3, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); kick(); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (hover && !drag) { hover = null; tell(null); kick(); } });
    cv.addEventListener('wheel', wheel, { passive: false });
    const ro = new ResizeObserver(() => { resize(); kick(); }); ro.observe(wrap.current);
    api.current = { zoom: (f) => { touched = true; view.k = Math.min(3, Math.max(0.2, view.k * f)); kick(); }, fit: () => { touched = false; kick(); } };
    // 화면 시험에서만: 점이 화면 어디에 있는지
    if (window.__TD_TEST__) window.__TD_GRAPH__ = () => { const r = cv.getBoundingClientRect(); return nodes.map((d) => ({ id: d.n.id, x: r.left + sx(d.x), y: r.top + sy(d.y) })); };
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [notes.length, manual.length, auto.length, showAuto]);

  return html`
    <${PageBar} title="생각 지도" right=${html`<button type="button" class=${`chip g-auto${showAuto ? ' on' : ''}`} aria-pressed=${showAuto} onClick=${() => setShowAuto(!showAuto)} title="비슷한 노트를 점선으로 잇기"><${Icon} name="sparkle" />추천 연결 ${auto.length || (showAuto ? 0 : '')}</button>`} />
    ${notes.length
      ? html`<div class="graph" ref=${wrap}>
          <canvas ref=${canvas} aria-label="노트 연결 그래프. 점을 누르면 노트가 열려요."></canvas>
          <div class="g-ctrl">
            <button type="button" class="icon-btn" aria-label="확대" onClick=${() => api.current.zoom(1.2)}><${Icon} name="zoomIn" /></button>
            <button type="button" class="icon-btn" aria-label="축소" onClick=${() => api.current.zoom(0.83)}><${Icon} name="zoomOut" /></button>
            <button type="button" class="icon-btn" aria-label="전체 보기" onClick=${() => api.current.fit()}><${Icon} name="fit" /></button>
          </div>
          <div class="g-legend">${groups.map((gr) => html`<span key=${gr}><i style=${`background:${colorFor(gr)}`}></i>${gr}</span>`)}
            <span class="g-ln"><b class="solid"></b>이은 연결 ${manual.length}</span>${showAuto && html`<span class="g-ln"><b class="dash"></b>추천 연결 ${auto.length}</span>`}</div>
          ${info && html`<div class="g-info" role="status"><b>${info.title}</b><small>${info.where}</small>
            ${info.items.length ? html`<ul>${info.items.map((it) => html`<li key=${it.id}><span class=${`g-k ${it.auto ? 'dash' : 'solid'}`}></span><span class="g-t">${it.title}</span><small>${it.auto ? it.why.join(' · ') : '이은 노트'}</small></li>`)}</ul>` : html`<p>아직 이어진 노트가 없어요.</p>`}</div>`}
        </div>`
      : html`<div class="page narrow"><${Empty} icon="graph" title="아직 그릴 노트가 없어요" text="노트가 쌓이고 서로 이어지면 여기에 생각의 지도가 그려져요." /></div>`}`;
}
