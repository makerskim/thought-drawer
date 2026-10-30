// 여러 화면에서 쓰는 조각: 태그, 노트 줄, 벽 카드(쪽지·폴라로이드), 빈 화면, 메뉴 줄
import { html, useState, useEffect, useRef } from '../h.js';
import { Icon, Mascot } from '../icons.js';
import { app } from '../state.js';
import { noteHref, tagHref } from '../router.js';
import { relTime, emojiFor, KIND_EMOJI, tiltOf, tagTone } from '../format.js';
import { displayTitle, categoryParts } from '../../core/note.js';

export function Tag({ name, href = true, onRemove }) {
  const cls = `tag t${tagTone(name)}`;
  const inner = html`${name}${onRemove && html`<button type="button" aria-label=${`${name} 태그 빼기`} onClick=${(e) => { e.preventDefault(); onRemove(); }}><${Icon} name="x" /></button>`}`;
  return href && !onRemove ? html`<a class=${cls} href=${tagHref(name)}>${inner}</a>` : html`<span class=${cls}>${inner}</span>`;
}

export const titleOf = (n) => displayTitle(n.meta, n.body ?? n.snippet);
export const folderLabel = (n) => (n.meta.status === 'inbox' ? '인박스' : categoryParts(n.meta.category).join(' / '));
const folderEmoji = (n) => (n.meta.status === 'inbox' ? '📥' : emojiFor(categoryParts(n.meta.category).at(-1)));

// 빈 화면에는 마스코트가 나와서 말을 건다
export function Empty({ icon, title, text, mood, children }) {
  const face = mood ?? (icon === 'alert' || icon === 'search' ? 'wow' : 'smile');
  return html`<div class="empty"><${Mascot} size=${88} mood=${face} /><h3>${title}</h3>${text && html`<p>${text}</p>`}${children}</div>`;
}

export function SkeletonRows({ n = 5 }) {
  return html`<div class="rows" aria-hidden="true">${Array.from({ length: n }, (_, i) => html`
    <div class="row" key=${i}><div class="sk" style="width:40px;height:40px;border-radius:14px"></div><div class="t" style="gap:6px"><div class="sk" style=${`height:13px;width:${45 + ((i * 17) % 40)}%`}></div><div class="sk" style="height:11px;width:30%"></div></div><div></div></div>`)}</div>`;
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

// 줄 앞: 사진이 있으면 작은 사진, 없으면 종류 이모지가 든 동그라미
function Lead({ note, url }) {
  return url
    ? html`<span class="rlead thumb"><img src=${url} alt="" loading="lazy" /></span>`
    : html`<span class=${`rlead k-${note.meta.type ?? 'memo'}`} aria-hidden="true">${KIND_EMOJI[note.meta.type] ?? '📝'}</span>`;
}

export function NoteRow({ note, showFolder = true, right, hl, active = false, selectable = false, selected = false, onSelect }) {
  const m = note.meta;
  const sub = m.summary || note.snippet || '';
  const t = titleOf(note);
  const [ref, url] = useThumb((m.attachments ?? [])[0]);
  return html`<div ref=${ref} class=${`row${selectable ? ' selectable' : ''}${selected ? ' selected' : ''}${active ? ' active' : ''}`}>
    ${selectable
      ? html`<label class="pick" title="고르기"><input type="checkbox" checked=${selected} onChange=${(e) => onSelect?.(e.target.checked)} aria-label=${`${t} 고르기`} /><${Lead} note=${note} url=${url} /></label>`
      : html`<${Lead} note=${note} url=${url} />`}
    <a class="t" href=${noteHref(note.id)}>
      <b>${m.pinned ? '⭐ ' : ''}${hl ? hl(t) : t}</b>
      ${sub && sub !== t && html`<span>${hl ? hl(sub) : sub}</span>`}
    </a>
    <div class="r">
      ${right ?? html`
        <span class="hide-m tags-mini">${(m.tags ?? []).slice(0, 2).map((x) => html`<${Tag} key=${x} name=${x} />`)}</span>
        ${showFolder && html`<span class="hide-m folder-mini">${folderEmoji(note)} ${folderLabel(note)}</span>`}
        <span class="num">${relTime(m.updated || m.created)}</span>`}
    </div>
  </div>`;
}

// 벽에 붙는 카드. 사진은 마스킹 테이프로 붙인 폴라로이드, 글은 종류마다 다른 색 쪽지
export function MCard({ note, hl, active = false }) {
  const m = note.meta;
  const att = (m.attachments ?? [])[0];
  const [ref, url] = useThumb(att);
  const t = titleOf(note);
  const sub = m.summary || note.snippet || '';
  const kind = m.type ?? 'memo';
  return html`<a class=${`mcard k-${kind}${att ? ' polaroid' : ''}${active ? ' active' : ''}`} href=${noteHref(note.id)} ref=${ref}
      style=${`--tilt:${tiltOf(note.id)}`} aria-current=${active ? 'true' : undefined}>
    ${att && html`<span class="tape" aria-hidden="true"></span>`}
    ${m.pinned && html`<span class="sticker" aria-label="즐겨찾기">⭐</span>`}
    ${att && html`<div class="img">${url ? html`<img src=${url} alt="" loading="lazy" />` : html`<div class="sk"></div>`}</div>`}
    <div class="tx">
      ${!att && html`<span class="kind" aria-hidden="true">${KIND_EMOJI[kind] ?? '📝'}</span>`}
      <b>${hl ? hl(t) : t}</b>
      ${sub && sub !== t && (!att || hl) && html`<p>${hl ? hl(sub) : sub}</p>`}
    </div>
    <div class="ft"><span class="where">${folderEmoji(note)} ${folderLabel(note)}</span><span class="num">${relTime(m.updated || m.created)}</span></div>
  </a>`;
}

// 메뉴 줄: icon이 이모지면 그대로, 이름이면 선 아이콘
export function MenuItem({ icon, emoji, label, sub, onClick, danger, on }) {
  return html`<button type="button" role="menuitem" class=${`mi${danger ? ' danger' : ''}${on ? ' on' : ''}`} onClick=${onClick}>
    ${emoji ? html`<span class="emo" aria-hidden="true">${emoji}</span>` : icon && html`<${Icon} name=${icon} />`}<span>${label}</span>${sub && html`<span class="sub">${sub}</span>`}
  </button>`;
}

// 찾은 말에 형광펜
export function highlighter(terms) {
  const list = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const re = new RegExp(`(${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return (text) => String(text).split(re).map((part, i) => (i % 2 ? html`<mark>${part}</mark>` : part));
}
