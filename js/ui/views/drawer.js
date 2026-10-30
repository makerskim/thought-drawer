// 서랍: 앱의 한 화면.
// 위쪽 칸 하나로 적고(Enter), 찾고(입력하는 대로 아래가 걸러짐), 사진·링크를 붙여 넣는다.
// 아래는 노트 벽(또는 목록). 노트는 옆에서 열려서(폰은 화면 가득) 보던 자리를 잃지 않는다.
import { html, useState, useEffect, useRef, useLayoutEffect, autosize, cx } from '../h.js';
import { Icon, Logo } from '../icons.js';
import { app, useLib, usePref, toast } from '../state.js';
import { go, noteHref, folderHref } from '../router.js';
import { MenuButton, Conn } from '../parts/shell.js';
import { NoteRow, MCard, Empty, highlighter, folderLabel } from '../parts/common.js';
import { popover, modal } from '../parts/layers.js';
import { FolderPicker, ConfirmDialog } from '../parts/dialogs.js';
import { capturePhotos } from '../capture.js';
import { search, parseQuery } from '../../core/search.js';
import { categoryParts } from '../../core/note.js';
import { relTime, modKey, emojiFor, KIND_EMOJI } from '../format.js';

const URL_RE = /^(https?:\/\/\S+)\s*([\s\S]*)$/i;
const PAGE = 60;

// 한 줄이면 내용만, 여러 줄이면 첫 줄을 제목으로 쓴다. 주소로 시작하면 링크 노트.
// extra: 어디서 넣었는지(via) 같은 머리말 값
export async function saveQuick(text, extra = {}) {
  const t = text.trim();
  if (!t) return null;
  const m = URL_RE.exec(t);
  if (m) return app.lib.addLink(m[1], m[2], '', extra);
  const lines = t.split('\n');
  if (lines.length > 1 && lines[0].length <= 60) return app.lib.create({ type: 'memo', title: lines[0].trim(), body: lines.slice(1).join('\n').trim(), ...extra });
  return app.lib.create({ type: 'memo', body: t, ...extra });
}

// 주소 → 보는 범위
export function scopeOf(path) {
  let m;
  if (path === '/inbox') return { kind: 'inbox' };
  if (path === '/star') return { kind: 'star' };
  if ((m = /^\/f\/(.+)$/.exec(path))) return { kind: 'folder', value: decodeURIComponent(m[1]) };
  if ((m = /^\/t\/(.+)$/.exec(path))) return { kind: 'tag', value: decodeURIComponent(m[1]) };
  return { kind: 'all' };
}

const KINDS = [['capture', 'capture', '사진'], ['bookmark', 'link', '링크'], ['instagram', 'instagram', '인스타'], ['memo', 'memo', '메모']];

function pickNotes(lib, scope, kind, q) {
  let list = scope.kind === 'inbox' ? lib.inbox()
    : scope.kind === 'star' ? lib.pinned()
    : scope.kind === 'folder' ? lib.inFolder(scope.value)
    : scope.kind === 'tag' ? lib.all.filter((n) => (n.meta.tags ?? []).includes(scope.value))
    : lib.all;
  if (kind) list = list.filter((n) => n.meta.type === kind);
  if (!q.trim()) return { notes: list, terms: [] };
  const pq = parseQuery(q);
  return { notes: search(list, pq, { limit: 400 }).map((h) => h.note), terms: pq.terms };
}

// 넣고 나서 실수였으면 바로 되돌린다
async function quickSave(text, { open = false } = {}) {
  const n = await saveQuick(text);
  if (!n) return null;
  if (open) go(noteHref(n.id));
  else {
    toast('💌 인박스에 넣었어요!', {
      action: '되돌리기', duration: 5000,
      onAction: async () => { try { await app.lib.remove(app.lib.get(n.id) ?? n); toast('🙈 방금 넣은 걸 뺐어요.'); } catch (e) { toast(e.message); } },
    });
  }
  return n;
}

function Omni({ q, setQ }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  app.focusOmni = () => { ref.current?.focus(); ref.current?.select(); };
  useLayoutEffect(() => autosize(ref.current), [q]);
  const save = async (open = false) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try { await quickSave(q, { open }); setQ(''); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const ask = () => q.trim() && go(`#/ask?q=${encodeURIComponent(q.trim())}`);
  const photos = (files) => { capturePhotos(files, q); setQ(''); };
  const onKeyDown = (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(e.metaKey || e.ctrlKey); }
    else if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); }
    else if (e.key === 'ArrowDown' && !q.includes('\n')) {
      const first = document.querySelector('.wall .mcard, .rows .row a.t');
      if (first) { e.preventDefault(); first.focus(); }
    }
  };
  return html`<div class=${cx('omni', q && 'has-q', drag && 'drag')}
      onDragOver=${(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
      onDragLeave=${() => setDrag(false)}
      onDrop=${(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); photos([...e.dataTransfer.files]); }}>
    <span class="omni-ic" aria-hidden="true">${q.trim() ? '🔍' : '✏️'}</span>
    <textarea ref=${ref} rows="1" value=${q} aria-label="적거나 찾기" enterkeyhint="send"
      placeholder="오늘은 어떤 생각을 넣어 볼까요?"
      onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown}
      onPaste=${(e) => {
        const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) { e.preventDefault(); e.stopPropagation(); photos(files); }
      }}></textarea>
    ${q.trim()
      ? html`<button type="button" class="omni-btn" title="이 말로 물어보기" aria-label="물어보기" onClick=${ask}><span class="emo">✨</span><span class="hide-m">물어보기</span></button>
        <button type="button" class="omni-save" disabled=${busy} onClick=${() => save()} aria-label="넣기"><span class="emo">💌</span><span class="hide-m">넣기</span></button>`
      : html`<button type="button" class="omni-btn" title="사진 넣기" aria-label="사진 넣기" onClick=${() => app.pickPhotos()}><span class="emo">📸</span><span class="hide-m">사진</span></button>`}
  </div>`;
}

function Chips({ scope, kind, setKind, view, setView }) {
  const lib = useLib();
  const folders = lib.folders();
  const inboxN = lib.inbox().length;
  const pinnedN = lib.pinned().length;
  const top = scope.kind === 'folder' ? categoryParts(scope.value)[0] : null;
  const subs = top ? folders.find((f) => f.path === top)?.children ?? [] : [];
  const on = (k, v) => (scope.kind === k && (v === undefined || scope.value === v) ? 'page' : undefined);
  return html`<div class="chips-bar">
    <nav class="chip-row" aria-label="보는 범위">
      <a class="chip" href="#/" aria-current=${on('all')}><span class="emo">🗂️</span>전체</a>
      <a class="chip" href="#/inbox" aria-current=${on('inbox')}><span class="emo">📥</span>인박스${inboxN > 0 && html`<span class="n hot">${inboxN}</span>`}</a>
      ${pinnedN > 0 && html`<a class="chip" href="#/star" aria-current=${on('star')}><span class="emo">⭐</span>즐겨찾기</a>`}
      ${scope.kind === 'tag' && html`<a class="chip" href="#/" aria-current="page" title="태그 거르기 끄기"><span class="emo">🏷️</span>#${scope.value}<${Icon} name="x" /></a>`}
      ${folders.length > 0 && html`<span class="chip-sep" aria-hidden="true"></span>`}
      ${folders.map((f) => html`<a key=${f.path} class="chip" href=${folderHref(f.path)} aria-current=${top === f.path ? 'page' : undefined}><span class="emo">${emojiFor(f.name)}</span>${f.name}<span class="n">${f.count}</span></a>`)}
    </nav>
    <div class="tools">
      <div class="seg kinds" role="group" aria-label="종류">
        ${KINDS.map(([k, , label]) => html`<button type="button" key=${k} title=${`${label}만 보기`} aria-label=${`${label}만 보기`} aria-pressed=${kind === k} onClick=${() => setKind(kind === k ? '' : k)}><span class="emo">${KIND_EMOJI[k]}</span></button>`)}
      </div>
      <div class="seg" role="group" aria-label="보기">
        <button type="button" title="카드로 보기" aria-label="벽으로 보기" aria-pressed=${view === 'wall'} onClick=${() => setView('wall')}>카드</button>
        <button type="button" title="목록으로 보기" aria-label="목록으로 보기" aria-pressed=${view === 'list'} onClick=${() => setView('list')}>목록</button>
      </div>
    </div>
    ${subs.length > 0 && html`<nav class="chip-row sub" aria-label="안쪽 폴더">
      <a class="chip" href=${folderHref(top)} aria-current=${on('folder', top)}>${top} 전체</a>
      ${subs.map((f) => html`<a key=${f.path} class="chip" href=${folderHref(f.path)} aria-current=${scope.value === f.path || String(scope.value).startsWith(`${f.path}/`) ? 'page' : undefined}><span class="emo">${emojiFor(f.name)}</span>${f.name}<span class="n">${f.count}</span></a>`)}
    </nav>`}
  </div>`;
}

// 화면 끝에 닿으면 더 그린다 (수백 개도 가볍게)
function useMore(key, total) {
  const [limit, setLimit] = useState(PAGE);
  const ref = useRef();
  useEffect(() => setLimit(PAGE), [key]);
  useEffect(() => {
    const el = ref.current;
    if (!el || limit >= total || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit(limit + PAGE); }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, key]);
  return [limit, ref];
}

function List({ notes, hl, activeId, more }) {
  const lib = useLib();
  const [sel, setSel] = useState(() => new Set());
  const chosen = notes.filter((n) => sel.has(n.id));
  const toggle = (id, yes) => setSel((prev) => { const next = new Set(prev); yes ? next.add(id) : next.delete(id); return next; });
  const moveMany = (list, anchor) => popover(anchor, (close) => html`<${FolderPicker} close=${close} onPick=${async (p) => {
    const t = toast(`${list.length}개를 옮기는 중`, { busy: true });
    try {
      for (const n of list) await lib.moveTo(lib.get(n.id) ?? n, p);
      setSel(new Set());
      t.update(p ? `${list.length}개를 ${categoryParts(p).join(' / ')}에 넣었어요.` : `${list.length}개를 인박스로 옮겼어요.`, p ? { action: '폴더 열기', onAction: () => go(folderHref(p)) } : {});
    } catch (e) { t.update(e.message, { duration: 6000 }); }
  }} />`, { width: 300 });
  const removeMany = (list) => modal((close) => html`<${ConfirmDialog} close=${close} danger yes="지우기"
    title=${`${list.length}개를 지울까요?`} text="구글 드라이브 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요."
    onYes=${async () => {
      const undos = [];
      try { for (const n of list) undos.push(await lib.remove(n)); } catch (e) { toast(e.message); }
      setSel(new Set());
      toast(`${undos.length}개를 지웠어요.`, { action: '되돌리기', duration: 6000, onAction: async () => { for (const u of undos) await u(); } });
    }} />`);
  const [limit, sentinel] = more;
  return html`
    <div class=${`bulkbar${chosen.length ? ' on' : ''}`}>
      <label class="pick-all"><input type="checkbox" checked=${notes.length > 0 && chosen.length === notes.length} indeterminate=${chosen.length > 0 && chosen.length < notes.length}
        onChange=${(e) => setSel(e.target.checked ? new Set(notes.map((n) => n.id)) : new Set())} aria-label="모두 고르기" />
        <span>${chosen.length ? `${chosen.length}개 고름` : `${notes.length}개`}</span></label>
      ${chosen.length > 0 && html`
        <button type="button" class="btn" onClick=${(e) => moveMany(chosen, e.currentTarget)}><${Icon} name="folder" />폴더로 옮기기</button>
        <button type="button" class="btn btn-ghost btn-danger" onClick=${() => removeMany(chosen)}><${Icon} name="trash" />지우기</button>
        <button type="button" class="btn btn-ghost" onClick=${() => setSel(new Set())}>고르기 취소</button>`}
    </div>
    <div class="rows">${notes.slice(0, limit).map((n) => html`<${NoteRow} key=${n.id} note=${n} hl=${hl} active=${n.id === activeId}
      selectable selected=${sel.has(n.id)} onSelect=${(yes) => toggle(n.id, yes)} right=${html`
        <span class="hide-m">${folderLabel(n)}</span>
        <span class="num">${relTime(n.meta.updated || n.meta.created)}</span>
        <button type="button" class="btn btn-ghost act" title="폴더 정하기" aria-label=${`${folderLabel(n)}에서 다른 폴더로`} onClick=${(e) => moveMany([n], e.currentTarget)}><${Icon} name="folder" /><span class="hide-m">폴더</span></button>`} />`)}</div>
    <div ref=${sentinel} class="sentinel"></div>`;
}

function Wall({ notes, hl, activeId, more }) {
  const [limit, sentinel] = more;
  return html`<div class="wall">${notes.slice(0, limit).map((n) => html`<${MCard} key=${n.id} note=${n} hl=${hl} active=${n.id === activeId} />`)}</div>
    <div ref=${sentinel} class="sentinel"></div>`;
}

export function Drawer({ path, activeId }) {
  const lib = useLib();
  const scope = scopeOf(path);
  const [q, setQ] = useState('');
  const [kind, setKind] = usePref('kind', '');
  const [view, setView] = usePref('view', 'wall');
  const [dq, setDq] = useState('');
  const debounce = useRef();
  useEffect(() => { clearTimeout(debounce.current); debounce.current = setTimeout(() => setDq(q), q ? 90 : 0); return () => clearTimeout(debounce.current); }, [q]);
  app.clearDrawer = () => { setQ(''); setKind(''); };
  // 범위나 종류를 바꾸면 맨 위부터 (노트를 열고 닫을 때는 보던 자리 그대로)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.querySelector('.stage-main')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [path, kind]);

  const { notes, terms } = pickNotes(lib, scope, kind, dq);
  app.visible = notes.map((n) => n.id);
  const hl = highlighter(terms);
  const more = useMore(`${path}|${kind}|${dq}`, notes.length);
  const last = lib.index?.generatedAt;
  const kindLabel = KINDS.find(([k]) => k === kind)?.[2];

  let body;
  if (!lib.all.length && !lib.state.synced && !lib.state.error) {
    body = html`<div class="wall">${[180, 120, 220, 140, 160, 200].map((h, i) => html`<div class="mcard sk" key=${i} style=${`height:${h}px`}></div>`)}</div>`;
  } else if (!lib.all.length) {
    body = html`<${Empty} title="서랍이 텅 비었어요" text="칸에 생각을 적고 Enter! 사진은 붙여 넣거나 끌어다 놓아도 돼요." />`;
  } else if (dq.trim() && !notes.length) {
    body = html`<${Empty} mood="wow" title=${`앗, “${dq.trim()}” 노트는 없어요`} text="Enter를 누르면 이 글을 메모로 쏙 넣어요.">
      <button type="button" class="btn btn-primary" onClick=${async () => { await quickSave(q); setQ(''); }}>💌 메모로 넣기</button>
    </${Empty}>`;
  } else if (!notes.length) {
    body = scope.kind === 'inbox' && !kind
      ? html`<${Empty} title="인박스를 다 비웠어요 🎉" text="Claude가 전부 폴더에 정리했어요." />`
      : html`<${Empty} mood="wow" title=${kindLabel ? `여기엔 ${kindLabel}가 없어요` : '여기는 아직 비어 있어요'} text="">
          ${kind && html`<button type="button" class="btn" onClick=${() => setKind('')}>종류 거르기 끄기</button>`}
        </${Empty}>`;
  } else {
    body = view === 'list'
      ? html`<${List} notes=${notes} hl=${hl} activeId=${activeId} more=${more} />`
      : html`<${Wall} notes=${notes} hl=${hl} activeId=${activeId} more=${more} />`;
  }

  return html`<div class="drawer">
    <div class="drawer-head">
      <header class="top">
        <a class="brand" href="#/" onClick=${() => app.clearDrawer()} aria-label="Thought Drawer 처음으로"><${Logo} size=${44} /><span>Thought Drawer</span></a>
        <${Omni} q=${q} setQ=${setQ} />
        <${MenuButton} />
      </header>
      <${Conn} />
      <${Chips} scope=${scope} kind=${kind} setKind=${setKind} view=${view} setView=${setView} />
    </div>
    <main class="results" id="main">
      ${dq.trim()
        ? html`<div class="found"><span>🔍 <b>“${dq.trim()}”</b> 찾은 노트 ${notes.length}개</span><span class="hide-m">Enter 메모로 넣기 <span class="sp"></span> ${modKey} Enter 넣고 열기</span></div>`
        : scope.kind === 'inbox' && html`<div class="found"><span>${last ? `🧹 마지막 정리 ${relTime(last)}` : '🧺 아직 정리 전이에요. Claude가 정리하면 폴더로 옮겨요.'}</span></div>`}
      ${body}
    </main>
  </div>`;
}

