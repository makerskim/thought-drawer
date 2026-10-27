// 색인 카드 한 장, 서랍 한 칸, 연결 카드 같은 화면 조각

import { esc, icon, idStamp, TYPE_ICON } from './dom.js';
import { TYPES, displayTitle, categoryParts } from '../core/note.js';

export function cardHtml(note, { list = false, terms = null, hl = null } = {}) {
  const m = note.meta;
  const title = displayTitle(m, note.body ?? note.snippet);
  const text = m.summary || note.snippet || '';
  const thumb = (m.attachments ?? [])[0];
  const show = (s) => (terms && hl ? hl(s, terms, esc) : esc(s));
  const tags = (m.tags ?? []).slice(0, 4).map((t) => `<span>#${esc(t)}</span>`).join('');
  const where = m.status === 'inbox' ? '정리 대기' : categoryParts(m.category).join(' / ');
  const head = `<div class="card-head"><span class="card-type">${icon(TYPE_ICON[m.type] ?? 'memo')}${esc(TYPES[m.type] ?? '카드')}</span><span class="card-id">${esc(idStamp(note.id))}</span></div>`;
  const body = `<div class="card-body">
      <h3 class="card-title">${show(title)}</h3>
      ${text && text !== title ? `<p class="card-text">${show(text)}</p>` : ''}
    </div>
    <div class="card-foot"><span>${esc(where)}</span>${tags}</div>`;
  const cls = `card${m.status === 'inbox' ? ' inbox' : ''}`;
  if (list) {
    return `<a class="${cls}" href="#/n/${esc(note.id)}">
      ${thumb ? `<div class="card-thumb" data-thumb="${esc(thumb)}"></div>` : ''}
      <div class="card-main">${head}${body}</div></a>`;
  }
  return `<a class="${cls}" href="#/n/${esc(note.id)}">${head}
    ${thumb ? `<div class="card-thumb" data-thumb="${esc(thumb)}"></div>` : ''}
    ${body}</a>`;
}

export function cardsHtml(notes, opts = {}) {
  return `<div class="cards${opts.list ? ' list' : ''}">${notes.map((n) => cardHtml(n.note ?? n, opts)).join('')}</div>`;
}

export function drawerHtml(d) {
  const subs = d.children.map((c) => c.name).join(', ');
  return `<a class="drawer${d.count ? '' : ' empty-drawer'}" href="#/d/${encodeURIComponent(d.path)}" data-drawer>
    <span class="plate"><span class="label"><b>${esc(d.name)}</b><i>${d.count}장</i></span></span>
    <span class="pull" aria-hidden="true"></span>
    ${subs ? `<span class="subs">${esc(subs)}</span>` : ''}
  </a>`;
}

export function linkCardHtml({ note, dir }, why) {
  const m = note.meta;
  return `<a class="link-card" href="#/n/${esc(note.id)}">
    <span class="lc-main"><span class="card-id">${esc(idStamp(note.id))}</span>
    <b>${esc(displayTitle(m, note.body ?? note.snippet))}</b>${why ? `<span class="why">${esc(why)}</span>` : ''}</span>
    <span class="dir">${dir === 'in' ? '이 카드를 가리킴' : esc(m.category || '정리 대기')}</span>
  </a>`;
}

// 카드 목록의 사진 미리보기는 화면에 나타난 뒤에 불러온다
export function hydrateThumbs(root, lib) {
  const els = root.querySelectorAll('[data-thumb]:not([data-done])');
  if (!els.length) return;
  const load = async (el) => {
    el.dataset.done = '1';
    try {
      const url = await lib.attachmentUrl(el.dataset.thumb, { thumb: true });
      if (url) el.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
      else el.remove();
    } catch { el.remove(); }
  };
  if (!('IntersectionObserver' in window)) { els.forEach(load); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); load(e.target); }
  }, { rootMargin: '200px' });
  els.forEach((el) => io.observe(el));
}
