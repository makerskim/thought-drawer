// 서랍: 앱의 첫 화면.
// 맨 위에 무엇이든 넣는 칸(글, 링크, 사진, 붙여넣기)과 오늘 카드, 그 아래 자동으로 나뉜 서랍들, 맨 아래 최근에 넣은 것.
// 서랍을 누르면 그 서랍의 노트, 위쪽 찾기 칸에 적으면 찾은 노트. 노트는 옆에서 열린다(폰은 화면 가득).
import { html, useState, useEffect, useRef, useLayoutEffect, autosize, cx } from '../h.js';
import { Icon, Logo, Mascot, TYPE_ICON } from '../icons.js';
import { app, useLib, usePref, prefs, toast } from '../state.js';
import { go, folderHref, noteHref, tagHref } from '../router.js';
import { MenuButton, Conn } from '../parts/shell.js';
import { NoteRow, MCard, Empty, KindIcon, MenuItem, highlighter, titleOf } from '../parts/common.js';
import { popover, modal, useListNav } from '../parts/layers.js';
import { FolderPicker, ConfirmDialog } from '../parts/dialogs.js';
import { openComposer } from '../parts/composer.js';
import { openTutorial } from '../parts/tutorial.js';
import { capturePhotos, readClipboard } from '../capture.js';
import { quickSave, kindOfText } from '../quick.js';
import { openToday, todayKey, findDaily } from '../notebook.js';
import { categoryOf, guessCategory, drawerList, inDrawer, categoryLook } from '../categories.js';
import { search, parseQuery } from '../../core/search.js';
import { categoryParts } from '../../core/note.js';
import { openTasks, setTask } from '../../core/tasks.js';
import { relTime, modKey } from '../format.js';

const PAGE = 60;
const TYPES = [['', '전체'], ['memo', '메모'], ['bookmark', '링크'], ['capture', '사진'], ['instagram', '인스타']];
const SORTS = [['new', '넣은 순'], ['updated', '고친 순'], ['title', '이름 순']];
const SORTER = {
  updated: (a, b) => String(b.meta.updated || b.meta.created).localeCompare(String(a.meta.updated || a.meta.created)),
  title: (a, b) => titleOf(a).localeCompare(titleOf(b), 'ko'),
};
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 주소 → 보는 범위
export function scopeOf(path) {
  let m;
  if (path === '/inbox') return { kind: 'inbox' };
  if (path === '/star') return { kind: 'star' };
  if (path === '/tasks') return { kind: 'tasks' };
  if ((m = /^\/f\/(.+)$/.exec(path))) return { kind: 'folder', value: decodeURIComponent(m[1]) };
  if ((m = /^\/t\/(.+)$/.exec(path))) return { kind: 'tag', value: decodeURIComponent(m[1]) };
  return { kind: 'home' };
}

function pickNotes(lib, scope, type, q, sort) {
  let list = scope.kind === 'inbox' ? lib.inbox()
    : scope.kind === 'star' ? lib.pinned()
    : scope.kind === 'folder' ? lib.all.filter((n) => inDrawer(n, lib, scope.value))
    : scope.kind === 'tag' ? lib.all.filter((n) => (n.meta.tags ?? []).includes(scope.value))
    : lib.all;
  if (type) list = list.filter((n) => (n.meta.type ?? 'memo') === type);
  if (!q.trim()) return { notes: SORTER[sort] ? [...list].sort(SORTER[sort]) : list, terms: [] };
  const pq = parseQuery(q);
  return { notes: search(list, pq, { limit: 400 }).map((h) => h.note), terms: pq.terms };
}

// ---------- 넣는 칸 ----------
// 무엇이든 적거나 붙여 넣고 Enter. 주소면 링크, 여러 줄이면 첫 줄이 제목. 사진은 붙여넣기·끌어다 놓기·사진 단추.
// 적는 동안 어느 서랍으로 갈지 미리 보여 준다.
function draftMeta(text) {
  const k = kindOfText(text);
  const t = text.trim();
  if (k.kind === 'link' || k.kind === 'instagram') {
    const [url, ...rest] = t.split(/\s+/);
    return { meta: { type: k.kind === 'instagram' ? 'instagram' : 'bookmark', source: url }, body: rest.join(' ') };
  }
  const lines = t.split('\n');
  return k.kind === 'titled' ? { meta: { title: lines[0] }, body: lines.slice(1).join('\n') } : { meta: {}, body: t };
}

function CaptureBox({ big = false }) {
  const lib = useLib();
  const ref = useRef();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  useLayoutEffect(() => autosize(ref.current), [text]);
  useEffect(() => {
    app.focusCapture = () => { const el = ref.current; if (!el) return false; el.focus(); el.scrollIntoView({ block: 'nearest' }); return true; };
    return () => { app.focusCapture = null; };
  }, []);
  const k = kindOfText(text);
  const guess = text.trim() ? guessCategory(draftMeta(text).meta, draftMeta(text).body, lib) : null;
  const save = async (open = false) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await quickSave(text, { open }); setText(''); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const photos = (files) => { capturePhotos(files, text); setText(''); };
  const paste = async () => {
    const got = await readClipboard();
    if (!got) { toast('붙여넣기를 허용해 주세요. 또는 칸을 길게 눌러 붙여넣기를 골라요.'); return; }
    if (got.files.length) { photos(got.files); return; }
    if (!got.text.trim()) { toast('복사해 둔 글이나 사진이 없어요.'); return; }
    setText((t) => (t.trim() ? `${t.trim()}\n${got.text.trim()}` : got.text.trim()));
    ref.current?.focus();
  };
  const imports = (anchor) => popover(anchor, (close) => html`
    <${MenuItem} icon="star" label="브라우저 북마크 가져오기" onClick=${() => { close(); go('#/bookmarks'); }} />
    <${MenuItem} icon="instagram" label="인스타 저장 가져오기" onClick=${() => { close(); go('#/import'); }} />`, { width: 250 });
  const hint = !text.trim() ? '' : k.kind === 'link' ? `링크로 넣어요${k.host ? ` (${k.host})` : ''}` : k.kind === 'instagram' ? '인스타 게시물로 넣어요' : k.kind === 'titled' ? `“${k.title}”이 제목이 돼요` : '메모로 넣어요';
  return html`<section class=${cx('capture', drag && 'drag', big && 'big')} aria-label="넣기"
      onDragOver=${(e) => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); setDrag(true); } }}
      onDragLeave=${() => setDrag(false)}
      onDrop=${(e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); e.stopPropagation(); setDrag(false); photos([...e.dataTransfer.files]); }}>
    <div class="cap-head"><${Mascot} size=${44} mood=${busy ? 'happy' : text.trim() ? 'think' : 'smile'} />
      <div><h2>무엇이든 넣어 두세요</h2><p>글, 링크, 사진, 캡처. 넣으면 알아서 서랍에 나눠요.</p></div></div>
    <textarea ref=${ref} rows="2" value=${text} aria-label="넣을 내용" enterkeyhint="send"
      placeholder="메모나 할 일을 적거나, 링크·사진을 붙여 넣으세요"
      onInput=${(e) => setText(e.target.value)}
      onKeyDown=${(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(e.metaKey || e.ctrlKey); } else if (e.key === 'Escape' && text) { e.preventDefault(); e.stopPropagation(); setText(''); } }}
      onPaste=${(e) => { const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); e.stopPropagation(); photos(files); } }}></textarea>
    ${text.trim() && html`<p class="cap-hint"><${Icon} name=${k.kind === 'link' || k.kind === 'instagram' ? 'link' : 'memo'} /><span>${hint}</span>
      ${guess && html`<span class="cap-guess"><${Icon} name=${categoryLook(guess.category).icon} /><b>${guess.category}</b> 서랍으로</span>`}</p>`}
    <div class="cap-actions">
      <button type="button" class="cap-btn" onClick=${() => app.pickPhotos(text)}><${Icon} name="capture" /><span>사진·캡처</span></button>
      <button type="button" class="cap-btn" onClick=${paste}><${Icon} name="paste" /><span>붙여넣기</span></button>
      <button type="button" class="cap-btn" onClick=${() => go('#/connect')}><${Icon} name="phone" /><span>다른 앱·사이트에서</span></button>
      <button type="button" class="cap-btn" aria-haspopup="menu" aria-expanded="false" onClick=${(e) => imports(e.currentTarget)}><${Icon} name="download" /><span>가져오기</span></button>
      <span class="grow"></span>
      <button type="button" class="btn btn-primary cap-save" disabled=${busy || !text.trim()} onClick=${() => save()}>넣기<kbd class="hide-m">Enter</kbd></button>
    </div>
  </section>`;
}

// ---------- 오늘 카드: 오늘 노트와 남은 할 일 ----------
async function flipTask(lib, n, t, done) {
  try {
    const cur = await lib.ensureBody(lib.get(n.id) ?? n);
    const body = setTask(cur.body, t.line, done, t.text);
    if (body == null) { toast('노트가 그새 바뀌었어요. 노트를 열어 확인해 주세요.'); return; }
    await lib.update(cur, { body });
    if (done) toast(`“${t.text}” 했어요`, { action: '되돌리기', duration: 5000, onAction: () => flipTask(lib, n, t, false) });
  } catch (e) { toast(e.message); }
}
const taskGroups = (lib) => lib.all.map((n) => ({ n, tasks: n.body ? openTasks(n.body) : [] })).filter((g) => g.tasks.length)
  .sort((a, b) => String(b.n.meta.updated || b.n.meta.created).localeCompare(String(a.n.meta.updated || a.n.meta.created)));

function TodayCard() {
  const lib = useLib();
  const d = new Date();
  const daily = findDaily(lib, todayKey(d));
  const groups = taskGroups(lib);
  const left = groups.reduce((s, g) => s + g.tasks.length, 0);
  const top = groups.flatMap(({ n, tasks }) => tasks.map((t) => ({ n, t }))).slice(0, 4);
  return html`<section class="today" aria-labelledby="today-title">
    <div class="today-head"><h2 id="today-title">오늘</h2><span>${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일</span></div>
    <button type="button" class="today-btn" onClick=${() => openToday()} title="오늘 노트 (T)" aria-keyshortcuts="T">
      <${Icon} name="calendar" /><span>${daily ? '오늘 노트 이어 쓰기' : '오늘 노트 쓰기'}</span></button>
    <div class="today-tasks">
      <a class="tt-head" href="#/tasks"><b>남은 할 일</b><span>${left ? `${left}개` : '없어요'}</span><${Icon} name="chevron" /></a>
      ${top.length
        ? html`<ul>${top.map(({ n, t }) => html`<li key=${`${n.id}:${t.line}`}><label><input type="checkbox" onChange=${(e) => { e.target.disabled = true; flipTask(lib, n, t, true); }} /><span>${t.text}<small>${titleOf(n)}</small></span></label></li>`)}</ul>`
        : html`<p class="muted small">노트에 체크 상자(- [ ])를 적으면 여기에 모여요.</p>`}
    </div>
  </section>`;
}

// ---------- 서랍들 (자동 분류) ----------
function Drawers() {
  const lib = useLib();
  const list = drawerList(lib);
  if (!list.length) return null;
  return html`<section class="drawers" aria-labelledby="drawers-title">
    <div class="sec-head"><h2 id="drawers-title">서랍</h2><span class="sec-sub">넣은 걸 앱이 알아서 나눴어요</span></div>
    <div class="dgrid">${list.map((d) => html`<a key=${d.name} class=${`dtile c${d.look.tone}`} href=${folderHref(d.name)}>
      <span class="dt-ic"><${Icon} name=${d.look.icon} /></span>
      <span class="dt-t"><b>${d.name}</b><small>${titleOf(d.latest)}</small></span>
      <span class="dt-n">${d.count}</span>
    </a>`)}</div>
  </section>`;
}

// ---------- 종류 거르기 + 보기 메뉴 ----------
function Filters({ notes, type, setType, sort, setSort, view, setView, searching }) {
  const counts = new Map();
  for (const n of notes) counts.set(n.meta.type ?? 'memo', (counts.get(n.meta.type ?? 'memo') ?? 0) + 1);
  const menu = (anchor) => popover(anchor, (close) => html`
    <div class="mi-label">정렬</div>
    ${SORTS.map(([k, label]) => html`<${MenuItem} key=${k} icon=${!searching && sort === k ? 'check' : 'blank'} label=${searching ? `${label} (찾는 중엔 맞는 순)` : label} onClick=${() => { close(); setSort(k); }} />`)}
    <div class="mi-sep"></div>
    <div class="mi-label">보기</div>
    <${MenuItem} icon=${view === 'wall' ? 'check' : 'blank'} label="카드" onClick=${() => { close(); setView('wall'); }} />
    <${MenuItem} icon=${view === 'list' ? 'check' : 'blank'} label="목록 (여러 개 고르기)" onClick=${() => { close(); setView('list'); }} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="tag" label="태그 모아 보기" onClick=${(e) => { close(); setTimeout(() => popover(anchor, (c2) => html`<${TagList} close=${c2} />`, { width: 260 }), 0); }} />`, { width: 240 });
  return html`<div class="filters">
    <div class="type-chips" role="group" aria-label="종류">
      ${TYPES.filter(([k]) => !k || counts.get(k) || type === k).map(([k, label]) => html`<button type="button" key=${k || 'all'} class="chip" aria-pressed=${type === k}
        onClick=${() => setType(type === k ? '' : k)}>${k && html`<${Icon} name=${TYPE_ICON[k]} />`}${label}${k && html`<span class="n">${counts.get(k) ?? 0}</span>`}</button>`)}
    </div>
    <span class="grow"></span>
    <button type="button" class="chip view-btn" aria-haspopup="menu" aria-expanded="false" aria-label="보기 설정" onClick=${(e) => menu(e.currentTarget)}>
      <${Icon} name=${view === 'list' ? 'list' : 'grid'} /><span class="hide-m">${searching ? '맞는 순' : SORTS.find(([k]) => k === sort)?.[1]}</span><${Icon} name="down" /></button>
  </div>`;
}

// 모든 태그와 개수
function TagList({ close }) {
  const lib = useLib();
  const [q, setQ] = useState('');
  const counts = new Map();
  for (const n of lib.all) for (const t of n.meta.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const list = [...counts].filter(([t]) => t.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  const pick = (i) => { close(); go(tagHref(list[i][0])); };
  const [idx, , onKeyDown] = useListNav(list.length, pick, [q]);
  return html`<div class="pop-search"><input autofocus value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown} placeholder="태그 찾기" aria-label="태그 찾기" /></div>
    <div class="pop-list">${list.length
      ? list.map(([t, c], i) => html`<${MenuItem} key=${t} icon="tag" label=${t} sub=${String(c)} on=${i === idx} onClick=${() => pick(i)} />`)
      : html`<p class="mi-label">${counts.size ? '맞는 태그가 없어요' : '아직 태그가 없어요'}</p>`}</div>`;
}

// ---------- 찾기 칸 ----------
const askHref = (q) => `#/ask?q=${encodeURIComponent(q.trim())}`;
function Search({ q, setQ }) {
  const ref = useRef();
  app.focusOmni = () => { ref.current?.focus(); ref.current?.select(); };
  const ask = () => q.trim() && go(askHref(q));
  const onKeyDown = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); return; }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const first = document.querySelector('.wall .mcard, .rows .row a.t');
      if (first) first.focus(); else if (e.key === 'Enter') ref.current.blur();
    }
  };
  return html`<div class=${cx('search', q && 'has-q')} role="search">
    <${Icon} name="search" />
    <input ref=${ref} type="search" value=${q} aria-label="노트 찾기" placeholder="모든 노트에서 찾기" enterkeyhint="search" autocomplete="off" spellcheck="false"
      onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown} />
    ${q
      ? html`<button type="button" class="search-ask" onClick=${ask} title=${`Claude에게 물어보기 (${modKey} Enter)`} aria-label="물어보기"><${Icon} name="sparkle" /><span class="hide-m">물어보기</span></button>
        <button type="button" class="icon-btn" aria-label="찾기 지우기" onClick=${() => { setQ(''); ref.current?.focus(); }}><${Icon} name="x" /></button>`
      : html`<kbd class="hide-m" title="/ 를 누르면 여기로">/</kbd>`}
  </div>`;
}

// ---------- 노트 벽, 목록 ----------
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
      t.update(p ? `${list.length}개를 ${categoryParts(p).join(' / ')} 서랍에 넣었어요` : `${list.length}개를 자동 분류에 맡겼어요`, p ? { action: '서랍 열기', onAction: () => go(folderHref(p)) } : {});
    } catch (e) { t.update(e.message, { duration: 6000 }); }
  }} />`, { width: 300 });
  const removeMany = (list) => modal((close) => html`<${ConfirmDialog} close=${close} danger yes="지우기"
    title=${`${list.length}개를 지울까요?`} text="구글 드라이브 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요."
    onYes=${async () => {
      const undos = [];
      try { for (const n of list) undos.push(await lib.remove(n)); } catch (e) { toast(e.message); }
      setSel(new Set());
      toast(`${undos.length}개를 지웠어요`, { action: '되돌리기', duration: 6000, onAction: async () => { for (const u of undos) await u(); } });
    }} />`);
  const [limit, sentinel] = more;
  return html`
    <div class=${`bulkbar${chosen.length ? ' on' : ''}`}>
      <label class="pick-all"><input type="checkbox" checked=${notes.length > 0 && chosen.length === notes.length} indeterminate=${chosen.length > 0 && chosen.length < notes.length}
        onChange=${(e) => setSel(e.target.checked ? new Set(notes.map((n) => n.id)) : new Set())} aria-label="모두 고르기" />
        <span>${chosen.length ? `${chosen.length}개 고름` : `${notes.length}개`}</span></label>
      ${chosen.length > 0 && html`
        <button type="button" class="btn" onClick=${(e) => moveMany(chosen, e.currentTarget)}><${Icon} name="folder" />서랍 옮기기</button>
        <button type="button" class="btn btn-ghost btn-danger" onClick=${() => removeMany(chosen)}><${Icon} name="trash" />지우기</button>
        <button type="button" class="btn btn-ghost" onClick=${() => setSel(new Set())}>고르기 취소</button>`}
    </div>
    <div class="rows">${notes.slice(0, limit).map((n) => html`<${NoteRow} key=${n.id} note=${n} hl=${hl} active=${n.id === activeId}
      selectable selected=${sel.has(n.id)} onSelect=${(yes) => toggle(n.id, yes)} right=${html`
        <span class="hide-m folder-mini">${categoryOf(n, lib).name}</span>
        <span class="num">${relTime(n.meta.updated || n.meta.created)}</span>
        <button type="button" class="btn btn-ghost act" title="서랍 바꾸기" aria-label=${`${categoryOf(n, lib).name}에서 다른 서랍으로`} onClick=${(e) => moveMany([n], e.currentTarget)}><${Icon} name="folder" /><span class="hide-m">서랍</span></button>`} />`)}</div>
    <div ref=${sentinel} class="sentinel"></div>`;
}

function Wall({ notes, hl, activeId, more }) {
  const [limit, sentinel] = more;
  return html`<div class="wall">${notes.slice(0, limit).map((n) => html`<${MCard} key=${n.id} note=${n} hl=${hl} active=${n.id === activeId} />`)}</div>
    <div ref=${sentinel} class="sentinel"></div>`;
}

// ---------- 할 일 모아 보기 ----------
function Tasks() {
  const lib = useLib();
  const [prog, setProg] = useState(null);
  // 본문을 아직 안 받은 노트는 받아 온다 (한 번 받으면 기기에 남는다)
  useEffect(() => {
    const missing = lib.all.filter((n) => n.body === undefined);
    if (!missing.length) return undefined;
    let alive = true;
    let done = 0;
    setProg([0, missing.length]);
    const work = async () => {
      while (alive && missing.length) {
        const n = missing.shift();
        try { await lib.ensureBody(n); } catch { /* 못 받은 노트는 건너뛴다 */ }
        if (alive) setProg([++done, done + missing.length]);
      }
    };
    Promise.all([work(), work(), work(), work()]).then(() => alive && setProg(null));
    return () => { alive = false; };
  }, [lib.all.length]);
  const groups = taskGroups(lib);
  return html`
    ${prog
      ? html`<div class="found"><span>노트에서 할 일을 모으는 중 ${prog[0]}/${prog[1]}</span></div>`
      : groups.length > 0 && html`<div class="found"><span>노트 ${groups.length}개에 남은 할 일 <b>${groups.reduce((s, g) => s + g.tasks.length, 0)}개</b></span><span class="hide-m">체크하면 노트에도 바로 표시돼요</span></div>`}
    ${!groups.length && !prog
      ? html`<${Empty} mood="happy" title="남은 할 일이 없어요" text="노트에 「- [ ] 할 일」처럼 적거나 / 메뉴의 체크 상자를 쓰면 여기에 모여요.">
          <button type="button" class="btn btn-primary" onClick=${() => openToday()}><${Icon} name="calendar" />오늘 노트 열기</button>
          <button type="button" class="btn" onClick=${() => go('#/new?template=todo')}><${Icon} name="check" />할 일 노트 만들기</button>
        </${Empty}>`
      : html`<div class="tasks">${groups.map(({ n, tasks }) => html`<section class="task-group" key=${n.id}>
          <a class="tg-head" href=${noteHref(n.id)}><${KindIcon} type=${n.meta.type} /><b>${titleOf(n)}</b><span>${categoryOf(n, lib).name}</span></a>
          <ul>${tasks.map((t) => html`<li key=${`${t.line}:${t.text}`}><label><input type="checkbox" onChange=${(e) => { e.target.disabled = true; flipTask(lib, n, t, true); }} /><span>${t.text}</span></label></li>`)}</ul>
        </section>`)}</div>`}`;
}

// ---------- 넣는 방법 카드 (서랍이 비었을 때) ----------
const WAYS = [
  { icon: 'memo', title: '메모와 할 일', text: '위 칸에 적고 Enter. 여러 줄이면 첫 줄이 제목이 돼요.', run: () => app.focusCapture?.() },
  { icon: 'link', title: '웹사이트 링크', text: '주소를 붙여 넣거나, 브라우저 단추·크롬 확장으로 보던 페이지를 바로.', run: () => go('#/connect') },
  { icon: 'phone', title: '휴대폰 앱에서', text: '앱에서 공유 또는 링크 복사 후 여기서 「붙여넣기」.', run: () => go('#/connect') },
  { icon: 'capture', title: '스크린샷과 사진', text: '사진·캡처 단추, 붙여넣기, 끌어다 놓기. 사진 속 글자도 읽어 둬요.', run: () => app.pickPhotos() },
  { icon: 'star', title: '인터넷 북마크', text: '크롬·사파리·엣지 북마크 파일을 한 번에 가져와 서랍에 나눠요.', run: () => go('#/bookmarks') },
  { icon: 'instagram', title: '인스타 저장', text: '인스타 「내 정보 다운로드」 파일로 저장한 게시물을 한 번에.', run: () => go('#/import') },
];
function Ways() {
  return html`<section class="ways" aria-labelledby="ways-title">
    <div class="sec-head"><h2 id="ways-title">이렇게 넣을 수 있어요</h2></div>
    <div class="ways-grid">${WAYS.map((w) => html`<button type="button" key=${w.title} class="way" onClick=${w.run}>
      <span class="way-ic"><${Icon} name=${w.icon} /></span><b>${w.title}</b><span>${w.text}</span></button>`)}</div>
  </section>`;
}

// ---------- 서랍 화면 머리 ----------
function ScopeHead({ scope, count, autoN }) {
  const lib = useLib();
  if (scope.kind === 'folder') {
    const top = categoryParts(scope.value)[0];
    const look = categoryLook(top);
    const subs = lib.folders().find((f) => f.path === top)?.children ?? [];
    return html`<div class="scope-head">
      <a class="back-link" href="#/"><${Icon} name="back" />서랍</a>
      <div class="sh-title"><span class=${`dt-ic c${look.tone}`}><${Icon} name=${look.icon} /></span><h1>${categoryParts(scope.value).join(' / ')}</h1><span class="dt-n">${count}</span></div>
      ${autoN > 0 && html`<p class="sh-note"><${Icon} name="sparkle" />${autoN}개는 자동으로 나눴어요. 잘못 들어갔으면 노트를 열어 서랍을 바꿔 주세요. 바꾼 걸 보고 다음부터 더 잘 나눠요.</p>`}
      ${subs.length > 0 && html`<nav class="chip-row sub" aria-label="안쪽 서랍">
        <a class="chip" href=${folderHref(top)} aria-current=${scope.value === top ? 'page' : undefined}>${top} 전체</a>
        ${subs.map((f) => html`<a key=${f.path} class="chip" href=${folderHref(f.path)} aria-current=${scope.value === f.path ? 'page' : undefined}>${f.name}<span class="n">${f.count}</span></a>`)}
      </nav>`}
    </div>`;
  }
  const head = { tasks: ['check', '할 일'], star: ['star', '즐겨찾기'], inbox: ['inbox', 'Claude 정리 전'], tag: ['tag', `#${scope.value}`] }[scope.kind];
  return html`<div class="scope-head">
    <a class="back-link" href="#/"><${Icon} name="back" />서랍</a>
    <div class="sh-title"><span class="dt-ic c6"><${Icon} name=${head[0]} /></span><h1>${head[1]}</h1>${scope.kind !== 'tasks' && html`<span class="dt-n">${count}</span>`}</div>
  </div>`;
}

export function Drawer({ path, activeId }) {
  const lib = useLib();
  const scope = scopeOf(path);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [view, setView] = usePref('view', 'wall');
  const [sort, setSort] = usePref('sort', 'new');
  const [dq, setDq] = useState('');
  const debounce = useRef();
  useEffect(() => { clearTimeout(debounce.current); debounce.current = setTimeout(() => setDq(q), q ? 90 : 0); return () => clearTimeout(debounce.current); }, [q]);
  app.clearDrawer = () => { setQ(''); setType(''); };
  // 서랍을 바꾸면 맨 위부터, 종류 거르기도 처음으로 (노트를 열고 닫을 때는 보던 자리 그대로)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setType('');
    document.querySelector('.stage-main')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [path]);
  // 처음 한 번은 사용법 안내 (노트가 그려진 뒤에)
  const ready = lib.all.length > 0 || lib.state.synced || !!lib.state.error;
  useEffect(() => {
    if (!ready || prefs.get('tutorialDone')) return undefined;
    const t = setTimeout(() => openTutorial(), 450);
    return () => clearTimeout(t);
  }, [ready]);

  const searching = !!dq.trim();
  const { notes, terms } = pickNotes(lib, searching ? { kind: 'home' } : scope, type, dq, sort);
  app.visible = notes.map((n) => n.id);
  const hl = highlighter(terms);
  const more = useMore(`${path}|${type}|${dq}|${sort}`, notes.length);
  const home = scope.kind === 'home' && !searching;
  const loading = !lib.all.length && !lib.state.synced && !lib.state.error;

  const listing = !notes.length
    ? (searching
      ? html`<${Empty} mood="wow" title=${`“${dq.trim()}” 노트는 없어요`} text="다른 낱말로 찾아보거나 Claude에게 물어보세요. 이 글을 그대로 메모로 넣을 수도 있어요.">
          <button type="button" class="btn btn-primary" onClick=${() => go(askHref(dq))}><${Icon} name="sparkle" />물어보기</button>
          <button type="button" class="btn" onClick=${() => { openComposer(q); setQ(''); }}><${Icon} name="plus" />메모로 넣기</button>
        </${Empty}>`
      : html`<${Empty} mood="think" title=${type ? '이 종류의 노트가 없어요' : '여기는 아직 비어 있어요'} text=${type ? '종류 거르기를 끄면 다른 노트도 보여요.' : ''}>
          ${type && html`<button type="button" class="btn" onClick=${() => setType('')}>종류 거르기 끄기</button>`}
        </${Empty}>`)
    : view === 'list'
      ? html`<${List} notes=${notes} hl=${hl} activeId=${activeId} more=${more} />`
      : html`<${Wall} notes=${notes} hl=${hl} activeId=${activeId} more=${more} />`;
  const filters = html`<${Filters} notes=${pickNotes(lib, searching ? { kind: 'home' } : scope, '', dq, sort).notes} type=${type} setType=${setType} sort=${sort} setSort=${setSort} view=${view} setView=${setView} searching=${searching} />`;

  let body;
  if (loading) {
    body = html`<div class="wall">${[180, 120, 220, 140, 160, 200].map((h, i) => html`<div class="mcard sk" key=${i} style=${`height:${h}px`}></div>`)}</div>`;
  } else if (searching) {
    body = html`<div class="found"><span><b>“${dq.trim()}”</b> 찾은 노트 ${notes.length}개</span><span class="hide-m"><kbd>↓</kbd> 결과로 <span class="sp"></span><kbd>${modKey}</kbd><kbd>Enter</kbd> 물어보기</span></div>
      ${notes.length > 0 && filters}${listing}`;
  } else if (home) {
    body = html`<div class="hero"><${CaptureBox} big=${!lib.all.length} />${lib.all.length > 0 && html`<${TodayCard} />`}</div>
      ${lib.all.length
        ? html`<${Drawers} />
          <section class="latest" aria-labelledby="latest-title">
            <div class="sec-head"><h2 id="latest-title">최근에 넣은 것</h2></div>
            ${filters}${listing}
          </section>`
        : html`<${Ways} />`}`;
  } else if (scope.kind === 'tasks') {
    body = html`<${ScopeHead} scope=${scope} /><${Tasks} />`;
  } else {
    const autoN = scope.kind === 'folder' ? notes.filter((n) => categoryOf(n, lib).auto).length : 0;
    body = html`<${ScopeHead} scope=${scope} count=${pickNotes(lib, scope, '', '', sort).notes.length} autoN=${autoN} />${filters}${listing}`;
  }

  return html`<div class=${cx('drawer', home && 'is-home')}>
    <div class="drawer-head">
      <header class="top">
        <a class="brand" href="#/" onClick=${() => app.clearDrawer()} aria-label="Thought Drawer 처음으로"><${Logo} size=${40} /><span>Thought Drawer</span></a>
        <div class="top-mid"><${Search} q=${q} setQ=${setQ} /></div>
        <div class="top-end">
          <button type="button" class="add-btn" onClick=${() => openComposer()} title="넣기 (Enter)" aria-keyshortcuts="Enter"><${Icon} name="plus" /><span>넣기</span></button>
          <${MenuButton} />
        </div>
      </header>
      <${Conn} />
    </div>
    <main class="results" id="main">${body}</main>
  </div>`;
}
