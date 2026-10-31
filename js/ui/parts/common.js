// 여러 화면에서 쓰는 조각: 태그, 노트 줄, 벽 카드, 빈 화면, 메뉴 줄
import { html, useState, useEffect, useRef } from '../h.js';
import { Icon, Mascot, TYPE_ICON } from '../icons.js';
import { app } from '../state.js';
import { noteHref, tagHref } from '../router.js';
import { relTime, tagTone } from '../format.js';
import { displayTitle, categoryParts } from '../../core/note.js';
import { categoryOf, categoryLook } from '../categories.js';

export function Tag({ name, href = true, onRemove }) {
  const cls = `tag t${tagTone(name)}`;
  const inner = html`${name}${onRemove && html`<button type="button" aria-label=${`${name} 태그 빼기`} onClick=${(e) => { e.preventDefault(); onRemove(); }}><${Icon} name="x" /></button>`}`;
  return href && !onRemove ? html`<a class=${cls} href=${tagHref(name)}>${inner}</a>` : html`<span class=${cls}>${inner}</span>`;
}

export const titleOf = (n) => displayTitle(n.meta, n.body ?? n.snippet);
export const folderLabel = (n) => categoryParts(categoryOf(n, app.lib).path).join(' / ');

// 서랍 앞의 작은 색 점 (서랍 타일과 같은 색)
export function FolderDot({ path }) {
  return html`<i class=${`fdot f${categoryLook(categoryParts(path)[0] ?? '').tone}`} aria-hidden="true"></i>`;
}
const folderOf = (n) => categoryOf(n, app.lib).name;
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
// 링크 카드의 사이트 아이콘 (못 받으면 링크 아이콘)
function Favicon({ url }) {
  const host = hostOf(url);
  const [bad, setBad] = useState(!host);
  return bad ? html`<${KindIcon} type="bookmark" />`
    : html`<span class="kind-ic fav" aria-hidden="true"><img src=${`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" loading="lazy" onError=${() => setBad(true)} /></span>`;
}

// 종류 표시: 색이 있는 동그라미 안의 선 아이콘
export function KindIcon({ type, class: cls = '' }) {
  const t = TYPE_ICON[type] ? type : 'memo';
  return html`<span class=${`kind-ic k-${t} ${cls}`} aria-hidden="true"><${Icon} name=${TYPE_ICON[t]} /></span>`;
}

// 빈 화면에는 서랍이가 나와서 할 일을 알려 준다
export function Empty({ icon, title, text, mood, children }) {
  const face = mood ?? (icon === 'alert' || icon === 'search' ? 'wow' : 'smile');
  return html`<div class="empty"><${Mascot} size=${96} mood=${face} /><h3>${title}</h3>${text && html`<p>${text}</p>`}${children && html`<div class="empty-actions">${children}</div>`}</div>`;
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

// 줄 앞: 사진이 있으면 작은 사진, 없으면 종류 아이콘
function Lead({ note, url }) {
  return url
    ? html`<span class="rlead thumb"><img src=${url} alt="" loading="lazy" /></span>`
    : html`<${KindIcon} type=${note.meta.type} class="rlead" />`;
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
      <b>${m.pinned && html`<${Icon} name="star" class="pin" label="즐겨찾기" />`}${hl ? hl(t) : t}</b>
      ${sub && sub !== t && html`<span>${hl ? hl(sub) : sub}</span>`}
    </a>
    <div class="r">
      ${right ?? html`
        <span class="hide-m tags-mini">${(m.tags ?? []).slice(0, 2).map((x) => html`<${Tag} key=${x} name=${x} />`)}</span>
        ${showFolder && html`<span class="hide-m folder-mini"><${FolderDot} path=${folderOf(note)} />${folderLabel(note)}</span>`}
        <span class="num">${relTime(m.updated || m.created)}</span>`}
    </div>
  </div>`;
}

// 벽에 붙는 카드. 사진이 있으면 사진이 위에, 메모는 쪽지 색
export function MCard({ note, hl, active = false }) {
  const m = note.meta;
  const att = (m.attachments ?? [])[0];
  const [ref, url] = useThumb(att);
  const t = titleOf(note);
  const sub = m.summary || note.snippet || '';
  const kind = m.type ?? 'memo';
  return html`<a class=${`mcard k-${kind}${att ? ' photo' : ''}${active ? ' active' : ''}`} href=${noteHref(note.id)} ref=${ref} aria-current=${active ? 'true' : undefined}>
    ${att && html`<div class="img">${url ? html`<img src=${url} alt="" loading="lazy" />` : html`<div class="sk"></div>`}</div>`}
    <div class="tx">
      ${!att && (kind === 'bookmark' && m.source ? html`<${Favicon} url=${m.source} />` : html`<${KindIcon} type=${kind} />`)}
      <b>${m.pinned && html`<${Icon} name="star" class="pin" label="즐겨찾기" />`}${hl ? hl(t) : t}</b>
      ${sub && sub !== t && (!att || hl) && html`<p>${hl ? hl(sub) : sub}</p>`}
    </div>
    <div class="ft"><span class="where"><${FolderDot} path=${folderOf(note)} />${folderLabel(note)}</span>${m.source && kind === 'bookmark' ? html`<span class="host">${hostOf(m.source)}</span>` : html`<span class="num">${relTime(m.updated || m.created)}</span>`}</div>
  </a>`;
}

// 메뉴 줄: 선 아이콘 + 이름 (+ 단축키)
export function MenuItem({ icon, label, sub, onClick, danger, on }) {
  return html`<button type="button" role="menuitem" class=${`mi${danger ? ' danger' : ''}${on ? ' on' : ''}`} onClick=${onClick}>
    ${icon && html`<${Icon} name=${icon} />`}<span>${label}</span>${sub && html`<span class="sub">${sub}</span>`}
  </button>`;
}

// 찾은 말에 형광펜
export function highlighter(terms) {
  const list = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const re = new RegExp(`(${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return (text) => String(text).split(re).map((part, i) => (i % 2 ? html`<mark>${part}</mark>` : part));
}
