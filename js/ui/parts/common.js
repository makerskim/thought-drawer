// 여러 화면에서 쓰는 조각: 태그, 노트 줄, 갤러리 카드, 표, 빈 화면
import { html, useState, useEffect, useRef } from '../h.js';
import { Icon, TYPE_ICON } from '../icons.js';
import { app } from '../state.js';
import { noteHref, tagHref, folderHref } from '../router.js';
import { relTime, colorOf, KIND_LABEL } from '../format.js';
import { displayTitle, categoryParts } from '../../core/note.js';

export function Tag({ name, href = true, onRemove }) {
  const cls = `tag c-${colorOf(name)}`;
  const inner = html`${name}${onRemove && html`<button type="button" aria-label=${`${name} 태그 빼기`} onClick=${(e) => { e.preventDefault(); onRemove(); }}><${Icon} name="x" /></button>`}`;
  return href && !onRemove ? html`<a class=${cls} href=${tagHref(name)}>${inner}</a>` : html`<span class=${cls}>${inner}</span>`;
}

export const titleOf = (n) => displayTitle(n.meta, n.body ?? n.snippet);
export const folderLabel = (n) => (n.meta.status === 'inbox' ? '인박스' : categoryParts(n.meta.category).join(' / '));

export function Empty({ icon = 'memo', title, text, children }) {
  return html`<div class="empty"><${Icon} name=${icon} /><h3>${title}</h3>${text && html`<p>${text}</p>`}${children}</div>`;
}

export function SkeletonRows({ n = 5 }) {
  return html`<div class="rows" aria-hidden="true">${Array.from({ length: n }, (_, i) => html`
    <div class="row" key=${i}><div class="sk" style="width:18px;height:18px"></div><div class="t" style="gap:6px"><div class="sk" style=${`height:13px;width:${45 + ((i * 17) % 40)}%`}></div><div class="sk" style="height:11px;width:30%"></div></div><div></div></div>`)}</div>`;
}

// 사진 미리보기는 화면에 보일 때 불러온다
export function useThumb(name) {
  const ref = useRef();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!name || !app.lib?.hasAttachment(name)) return undefined;
    let alive = true;
    const load = () => app.lib.attachmentUrl(name, { thumb: true }).then((u) => alive && setUrl(u)).catch(() => {});
    if (!('IntersectionObserver' in window) || !ref.current) { load(); return () => { alive = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => { alive = false; io.disconnect(); };
  }, [name]);
  return [ref, url];
}

export function NoteRow({ note, showFolder = true, right, hl }) {
  const m = note.meta;
  const sub = m.summary || note.snippet || '';
  const t = titleOf(note);
  return html`<div class="row">
    <${Icon} name=${TYPE_ICON[m.type] ?? 'memo'} />
    <a class="t" href=${noteHref(note.id)}>
      <b>${hl ? hl(t) : t}</b>
      ${sub && sub !== t && html`<span>${hl ? hl(sub) : sub}</span>`}
    </a>
    <div class="r">
      ${right ?? html`
        <span class="hide-m" style="display:flex;gap:4px">${(m.tags ?? []).slice(0, 2).map((x) => html`<${Tag} key=${x} name=${x} />`)}</span>
        ${showFolder && html`<span class="hide-m">${folderLabel(note)}</span>`}
        <span class="num">${relTime(m.updated || m.created)}</span>`}
    </div>
  </div>`;
}

export function NoteCard({ note }) {
  const m = note.meta;
  const [ref, url] = useThumb((m.attachments ?? [])[0]);
  return html`<a class="gcard" href=${noteHref(note.id)} ref=${ref}>
    <div class="cover">${url ? html`<img src=${url} alt="" loading="lazy" />` : html`<div class="ph">${m.summary || note.snippet || ''}</div>`}</div>
    <div class="body">
      <b><${Icon} name=${TYPE_ICON[m.type] ?? 'memo'} /><span>${titleOf(note)}</span></b>
      <div class="meta">${(m.tags ?? []).slice(0, 3).map((x) => html`<${Tag} key=${x} name=${x} href=${false} />`)}${!(m.tags ?? []).length && html`<span>${relTime(m.updated || m.created)}</span>`}</div>
    </div>
  </a>`;
}

export function NoteTable({ notes }) {
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th>이름</th><th>종류</th><th>태그</th><th>폴더</th><th>만든 날</th></tr></thead>
    <tbody>${notes.map((n) => html`<tr key=${n.id}>
      <td class="title"><a href=${noteHref(n.id)}><${Icon} name=${TYPE_ICON[n.meta.type] ?? 'memo'} />${titleOf(n)}</a></td>
      <td class="muted">${KIND_LABEL[n.meta.type] ?? '메모'}</td>
      <td><div class="tags">${(n.meta.tags ?? []).slice(0, 3).map((x) => html`<${Tag} key=${x} name=${x} />`)}</div></td>
      <td>${n.meta.category ? html`<a class="muted" href=${folderHref(n.meta.category)}>${folderLabel(n)}</a>` : html`<span class="muted">인박스</span>`}</td>
      <td class="muted num">${relTime(n.meta.created)}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

export function NoteList({ notes, view = 'list', showFolder = true }) {
  if (view === 'gallery') return html`<div class="gallery">${notes.map((n) => html`<${NoteCard} key=${n.id} note=${n} />`)}</div>`;
  if (view === 'table') return html`<${NoteTable} notes=${notes} />`;
  return html`<div class="rows">${notes.map((n) => html`<${NoteRow} key=${n.id} note=${n} showFolder=${showFolder} />`)}</div>`;
}

export function MenuItem({ icon, label, sub, onClick, danger, on }) {
  return html`<button type="button" role="menuitem" class=${`mi${danger ? ' danger' : ''}${on ? ' on' : ''}`} onClick=${onClick}>
    ${icon && html`<${Icon} name=${icon} />`}<span>${label}</span>${sub && html`<span class="sub">${sub}</span>`}
  </button>`;
}

// 검색어를 굵게 표시
export function highlighter(terms) {
  const list = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const re = new RegExp(`(${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return (text) => String(text).split(re).map((part, i) => (i % 2 ? html`<mark>${part}</mark>` : part));
}
