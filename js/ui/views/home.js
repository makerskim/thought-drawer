// 서랍장(첫 화면), 정리 대기, 서랍 하나

import { esc, icon, on } from '../dom.js';
import { cardsHtml, drawerHtml, hydrateThumbs } from '../cards.js';
import { categoryParts } from '../../core/note.js';

function lastOrganized(lib) {
  const at = lib.index?.generatedAt;
  if (!at) return null;
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function trayHtml(lib, ctx) {
  const n = lib.inbox().length;
  const last = lastOrganized(lib);
  const sub = n
    ? (ctx.mode === 'demo' ? '실제로 쓰면 Claude가 하루 몇 번 서랍에 넣어 줘요.' : `다음 정리 때 서랍에 들어가요.${last ? ` 마지막 정리 ${last}` : ''}`)
    : '새로 들어온 카드가 없어요.';
  return `<a class="tray" href="#/inbox">
    <span class="tray-stack" aria-hidden="true"><i></i><i></i><b>${n}</b></span>
    <span><strong>정리 대기 ${n}장</strong><span>${esc(sub)}</span></span>
    ${icon('chevron')}
  </a>`;
}

// 서랍을 누르면 살짝 당겨지는 움직임을 보여 준 뒤 들어간다
function bindDrawers(el, ctx) {
  on(el, 'click', '[data-drawer]', (e, a) => {
    if (e.metaKey || e.ctrlKey || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    a.classList.add('pulling');
    setTimeout(() => ctx.go(a.getAttribute('href')), 220);
  });
}

export function home(ctx) {
  const { lib } = ctx;
  ctx.top({ home: true });
  const drawers = lib.drawers();
  const recent = lib.organized().slice(0, 8);
  ctx.el.innerHTML = `
    ${ctx.banner ?? ''}
    ${trayHtml(lib, ctx)}
    <div class="section-head"><h2>서랍</h2><span class="hint">${lib.organized().length}장</span></div>
    ${drawers.length ? `<div class="cabinet">${drawers.map(drawerHtml).join('')}</div>` : `
      <div class="empty"><h3>아직 서랍이 없어요</h3><p>카드를 넣으면 Claude가 정리하면서 "패션", "요리" 같은 서랍을 만들어요.</p><a class="btn primary" href="#/add">${icon('plus')}첫 카드 넣기</a></div>`}
    ${recent.length ? `<div class="section-head"><h2>최근에 정리된 카드</h2><a href="#/s">모두 찾기</a></div>${cardsHtml(recent)}` : ''}
  `;
  bindDrawers(ctx.el, ctx);
  hydrateThumbs(ctx.el, lib);
}

export function inbox(ctx) {
  const { lib } = ctx;
  ctx.top({ title: '정리 대기', back: '#/' });
  const items = lib.inbox();
  ctx.el.innerHTML = `
    <div class="page-head"><h1>정리 대기</h1>
    <p>${ctx.mode === 'demo'
      ? '체험 모드에서는 자동 정리가 돌지 않아요. 카드를 열어 직접 서랍을 정할 수 있어요.'
      : 'Claude가 하루 몇 번 이 카드들을 읽고 제목, 요약, 태그를 붙여 서랍에 넣어요. 급하면 카드를 열어 직접 서랍을 정해도 돼요.'}</p></div>
    ${items.length ? cardsHtml(items) : `<div class="empty"><h3>다 정리됐어요</h3><p>새로 넣은 카드는 여기서 정리를 기다려요.</p><a class="btn" href="#/add">${icon('plus')}카드 넣기</a></div>`}
  `;
  hydrateThumbs(ctx.el, lib);
}

export function drawer(ctx, path) {
  const { lib } = ctx;
  const parts = categoryParts(path);
  const name = parts.at(-1) ?? path;
  const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
  ctx.top({ title: name, back: parent ? `#/d/${encodeURIComponent(parent)}` : '#/' });
  const node = (function find(list) {
    for (const d of list) { if (d.path === path) return d; const f = find(d.children); if (f) return f; }
    return null;
  })(lib.drawers());
  const notes = lib.inDrawer(path);
  const subs = node?.children ?? [];
  ctx.el.innerHTML = `
    <div class="page-head"><h1>${esc(name)}</h1><p>${esc(parts.join(' / '))} 서랍, 카드 ${notes.length}장</p></div>
    ${subs.length ? `<div class="cabinet">${subs.map(drawerHtml).join('')}</div><div class="section-head"><h2>${esc(name)}의 모든 카드</h2></div>` : ''}
    ${notes.length ? cardsHtml(notes) : '<div class="empty"><h3>빈 서랍이에요</h3><p>이 서랍에 맞는 카드가 들어오면 여기에 보여요.</p></div>'}
    <p class="hint" style="margin-top:22px">찾기에서 <code>서랍:${esc(name)}</code>을 붙이면 이 서랍 안에서만 찾아요.</p>
  `;
  bindDrawers(ctx.el, ctx);
  hydrateThumbs(ctx.el, lib);
}
