// 서랍: 앱의 한 화면.
// 위에는 찾기 칸과 「생각 넣기」(어디서든 Enter면 가운데 입력창), 그 아래 범위 칩과 노트 벽(또는 목록).
// 노트는 옆에서 열려서(폰은 화면 가득) 보던 자리를 잃지 않는다. 노트가 적을 때는 쓰는 법 카드로 빈자리를 채운다.
import { html, useState, useEffect, useRef, cx } from '../h.js';
import { Icon, Logo, Mascot, TYPE_ICON } from '../icons.js';
import { app, useLib, usePref, prefs, toast } from '../state.js';
import { go, folderHref } from '../router.js';
import { MenuButton, Conn } from '../parts/shell.js';
import { NoteRow, MCard, Empty, KindIcon, FolderDot, highlighter, folderLabel } from '../parts/common.js';
import { popover, modal } from '../parts/layers.js';
import { FolderPicker, ConfirmDialog } from '../parts/dialogs.js';
import { openComposer } from '../parts/composer.js';
import { openTutorial } from '../parts/tutorial.js';
import { search, parseQuery } from '../../core/search.js';
import { categoryParts } from '../../core/note.js';
import { relTime, modKey } from '../format.js';

const PAGE = 60;
const FEW = 12; // 노트가 이보다 적으면 쓰는 법 카드를 같이 보여 준다

// 주소 → 보는 범위
export function scopeOf(path) {
  let m;
  if (path === '/inbox') return { kind: 'inbox' };
  if (path === '/star') return { kind: 'star' };
  if ((m = /^\/f\/(.+)$/.exec(path))) return { kind: 'folder', value: decodeURIComponent(m[1]) };
  if ((m = /^\/t\/(.+)$/.exec(path))) return { kind: 'tag', value: decodeURIComponent(m[1]) };
  return { kind: 'all' };
}

const KINDS = [['capture', '사진'], ['bookmark', '링크'], ['instagram', '인스타'], ['memo', '메모']];

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

const askHref = (q) => `#/ask?q=${encodeURIComponent(q.trim())}`;

// 찾기 칸: 적는 대로 아래가 걸러진다. ↓나 Enter로 결과로, Ctrl+Enter는 Claude에게 묻기
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
      const first = document.querySelector('.wall .mcard:not(.howto), .rows .row a.t');
      if (first) first.focus(); else if (e.key === 'Enter') ref.current.blur();
    }
  };
  return html`<div class=${cx('search', q && 'has-q')} role="search">
    <${Icon} name="search" />
    <input ref=${ref} type="search" value=${q} aria-label="노트 찾기" placeholder="노트 찾기" enterkeyhint="search" autocomplete="off" spellcheck="false"
      onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown} />
    ${q
      ? html`<button type="button" class="search-ask" onClick=${ask} title=${`Claude에게 물어보기 (${modKey} Enter)`} aria-label="물어보기"><${Icon} name="sparkle" /><span class="hide-m">물어보기</span></button>
        <button type="button" class="icon-btn" aria-label="찾기 지우기" onClick=${() => { setQ(''); ref.current?.focus(); }}><${Icon} name="x" /></button>`
      : html`<kbd class="hide-m" title="/ 를 누르면 여기로">/</kbd>`}
  </div>`;
}

// 서랍이 하는 일 세 가지 (차례대로 일어나는 일이라 번호를 붙인다)
function Guide({ onHide }) {
  return html`<section class="guide" aria-labelledby="guide-title">
    <${Mascot} size=${72} mood="smile" class="guide-m" />
    <div class="guide-main">
      <div class="guide-head">
        <h2 id="guide-title">서랍은 이렇게 돌아가요</h2>
        <span class="grow"></span>
        <button type="button" class="btn btn-ghost" onClick=${() => openTutorial()}><${Icon} name="help" />사용법 보기</button>
        <button type="button" class="icon-btn" aria-label="안내 닫기" title="안내 닫기" onClick=${onHide}><${Icon} name="x" /></button>
      </div>
      <ol class="guide-steps">
        <li><span class="gs-ic g1"><${Icon} name="plus" /></span><div><b>넣기</b><p>「생각 넣기」나 Enter로 적고, 링크와 사진도 붙여 넣어요. 폰과 크롬에서도 넣을 수 있어요.</p></div></li>
        <li><span class="gs-ic g2"><${Icon} name="sparkle" /></span><div><b>Claude가 정리</b><p>인박스에 모인 노트에 제목, 요약, 태그를 달고 알맞은 폴더로 옮겨요.</p></div></li>
        <li><span class="gs-ic g3"><${Icon} name="search" /></span><div><b>찾고 묻기</b><p>낱말로 찾거나 「물어보기」로 물으면 내 노트에서 찾아 답해요.</p></div></li>
      </ol>
    </div>
  </section>`;
}

// 무엇을 넣을 수 있는지 보여 주는 카드. 누르면 바로 그걸 하게 된다
const HOWTO = [
  { type: 'memo', title: '떠오른 생각', text: '「생각 넣기」나 Enter를 누르고 한 줄 적으면 끝이에요. 여러 줄이면 첫 줄이 제목이 돼요.', act: '적어 보기', run: () => openComposer() },
  { type: 'bookmark', title: '읽을거리 링크', text: '주소를 붙여 넣으면 링크 노트가 돼요. 제목과 요약은 Claude가 달아 줘요.', act: '링크 넣기', run: () => openComposer() },
  { type: 'capture', title: '캡처와 사진', text: '화면 캡처를 붙여 넣거나 끌어다 놓아요. 사진 속 글자도 Claude가 읽어 둬요.', act: '사진 고르기', run: () => app.pickPhotos() },
  { type: 'instagram', title: '인스타 저장', text: '인스타그램 「내 정보 다운로드」 파일을 올리면 저장한 게시물을 한 번에 가져와요.', act: '가져오기', run: () => go('#/import') },
  { icon: 'phone', title: '폰과 크롬에서', text: '아이폰 공유 버튼이나 크롬 확장으로 보던 페이지를 바로 넣어요.', act: '연결하기', run: () => go('#/connect') },
  { icon: 'ask', title: '물어보기', text: '「제주 맛집 뭐 있었지?」처럼 물으면 내 노트에서 찾아 답해요.', act: '물어보기', run: () => app.find() },
];
function HowTo() {
  return HOWTO.map((h) => html`<button type="button" key=${h.title} class=${`mcard howto k-${h.type ?? 'tip'}`} onClick=${h.run}>
    <div class="tx">
      ${h.type ? html`<${KindIcon} type=${h.type} />` : html`<span class="kind-ic k-tip" aria-hidden="true"><${Icon} name=${h.icon} /></span>`}
      <b>${h.title}</b>
      <p>${h.text}</p>
    </div>
    <div class="ft"><span class="where">사용법</span><span class="go">${h.act}</span></div>
  </button>`);
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
      <a class="chip" href="#/" aria-current=${on('all')}><${Icon} name="grid" />전체</a>
      <a class="chip" href="#/inbox" aria-current=${on('inbox')}><${Icon} name="inbox" />인박스${inboxN > 0 && html`<span class="n hot">${inboxN}</span>`}</a>
      ${pinnedN > 0 && html`<a class="chip" href="#/star" aria-current=${on('star')}><${Icon} name="star" />즐겨찾기</a>`}
      ${scope.kind === 'tag' && html`<a class="chip" href="#/" aria-current="page" title="태그 거르기 끄기"><${Icon} name="tag" />${scope.value}<${Icon} name="x" /></a>`}
      ${folders.length > 0 && html`<span class="chip-sep" aria-hidden="true"></span>`}
      ${folders.map((f) => html`<a key=${f.path} class="chip" href=${folderHref(f.path)} aria-current=${top === f.path ? 'page' : undefined}><${FolderDot} path=${f.path} />${f.name}<span class="n">${f.count}</span></a>`)}
    </nav>
    <div class="tools">
      <div class="seg kinds" role="group" aria-label="종류">
        ${KINDS.map(([k, label]) => html`<button type="button" key=${k} title=${`${label}만 보기`} aria-label=${`${label}만 보기`} aria-pressed=${kind === k} onClick=${() => setKind(kind === k ? '' : k)}><${Icon} name=${TYPE_ICON[k]} /></button>`)}
      </div>
      <div class="seg" role="group" aria-label="보기">
        <button type="button" title="카드로 보기" aria-label="벽으로 보기" aria-pressed=${view === 'wall'} onClick=${() => setView('wall')}><${Icon} name="grid" /><span class="hide-m">카드</span></button>
        <button type="button" title="목록으로 보기" aria-label="목록으로 보기" aria-pressed=${view === 'list'} onClick=${() => setView('list')}><${Icon} name="list" /><span class="hide-m">목록</span></button>
      </div>
    </div>
    ${subs.length > 0 && html`<nav class="chip-row sub" aria-label="안쪽 폴더">
      <a class="chip" href=${folderHref(top)} aria-current=${on('folder', top)}>${top} 전체</a>
      ${subs.map((f) => html`<a key=${f.path} class="chip" href=${folderHref(f.path)} aria-current=${scope.value === f.path || String(scope.value).startsWith(`${f.path}/`) ? 'page' : undefined}>${f.name}<span class="n">${f.count}</span></a>`)}
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

function Wall({ notes, hl, activeId, more, howto = false }) {
  const [limit, sentinel] = more;
  return html`<div class="wall">${notes.slice(0, limit).map((n) => html`<${MCard} key=${n.id} note=${n} hl=${hl} active=${n.id === activeId} />`)}${howto && html`<${HowTo} />`}</div>
    <div ref=${sentinel} class="sentinel"></div>`;
}

export function Drawer({ path, activeId }) {
  const lib = useLib();
  const scope = scopeOf(path);
  const [q, setQ] = useState('');
  const [kind, setKind] = usePref('kind', '');
  const [view, setView] = usePref('view', 'wall');
  const [guideHidden, setGuideHidden] = usePref('guideHidden', false);
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
  // 처음 한 번은 사용법 안내를 띄운다 (노트가 그려진 뒤에)
  const ready = lib.all.length > 0 || lib.state.synced || !!lib.state.error;
  useEffect(() => {
    if (!ready || prefs.get('tutorialDone')) return undefined;
    const t = setTimeout(() => openTutorial(), 450);
    return () => clearTimeout(t);
  }, [ready]);

  const { notes, terms } = pickNotes(lib, scope, kind, dq);
  app.visible = notes.map((n) => n.id);
  const hl = highlighter(terms);
  const more = useMore(`${path}|${kind}|${dq}`, notes.length);
  const last = lib.index?.generatedAt;
  const kindLabel = KINDS.find(([k]) => k === kind)?.[1];
  const plain = scope.kind === 'all' && !kind && !dq.trim();
  const showGuide = plain && !guideHidden && lib.all.length > 0;
  const showHowTo = plain && !guideHidden && lib.all.length < FEW;

  let body;
  if (!lib.all.length && !lib.state.synced && !lib.state.error) {
    body = html`<div class="wall">${[180, 120, 220, 140, 160, 200].map((h, i) => html`<div class="mcard sk" key=${i} style=${`height:${h}px`}></div>`)}</div>`;
  } else if (!lib.all.length) {
    body = html`<div class="first">
        <${Mascot} size=${112} mood="wave" />
        <div><h2>서랍이 아직 비어 있어요</h2><p>「첫 생각 넣기」를 누르거나 Enter를 눌러 떠오른 생각을 적어 보세요. 아래 카드를 누르면 그 방법으로 바로 넣을 수 있어요.</p>
          <div class="first-actions"><button type="button" class="btn btn-primary btn-lg" onClick=${() => openComposer()}><${Icon} name="plus" />첫 생각 넣기</button>
          <button type="button" class="btn btn-lg" onClick=${() => openTutorial()}><${Icon} name="help" />사용법 보기</button></div></div>
      </div>
      <div class="wall"><${HowTo} /></div>`;
  } else if (dq.trim() && !notes.length) {
    body = html`<${Empty} mood="wow" title=${`“${dq.trim()}” 노트는 없어요`} text="다른 낱말로 찾아보거나 Claude에게 물어보세요. 이 글을 그대로 메모로 넣을 수도 있어요.">
      <button type="button" class="btn btn-primary" onClick=${() => go(askHref(dq))}><${Icon} name="sparkle" />물어보기</button>
      <button type="button" class="btn" onClick=${() => { openComposer(q); setQ(''); }}><${Icon} name="plus" />메모로 넣기</button>
    </${Empty}>`;
  } else if (!notes.length) {
    body = scope.kind === 'inbox' && !kind
      ? html`<${Empty} mood="happy" title="인박스가 비었어요" text="Claude가 모두 폴더로 정리했어요. 새로 넣는 노트는 여기에 먼저 모여요." />`
      : html`<${Empty} mood="think" title=${kindLabel ? `여기엔 ${kindLabel} 노트가 없어요` : '여기는 아직 비어 있어요'} text=${kind ? '종류 거르기를 끄면 다른 노트도 보여요.' : ''}>
          ${kind && html`<button type="button" class="btn" onClick=${() => setKind('')}>종류 거르기 끄기</button>`}
        </${Empty}>`;
  } else {
    body = view === 'list'
      ? html`<${List} notes=${notes} hl=${hl} activeId=${activeId} more=${more} />`
      : html`<${Wall} notes=${notes} hl=${hl} activeId=${activeId} more=${more} howto=${showHowTo} />`;
  }

  return html`<div class="drawer">
    <div class="drawer-head">
      <header class="top">
        <a class="brand" href="#/" onClick=${() => app.clearDrawer()} aria-label="Thought Drawer 처음으로"><${Logo} size=${42} /><span>Thought Drawer</span></a>
        <div class="top-mid">
          <${Search} q=${q} setQ=${setQ} />
          <button type="button" class="add-btn" onClick=${() => openComposer()} title="생각 넣기 (Enter)" aria-keyshortcuts="Enter"><${Icon} name="plus" /><span>생각 넣기</span><kbd class="hide-m">Enter</kbd></button>
        </div>
        <${MenuButton} />
      </header>
      <${Conn} />
      <${Chips} scope=${scope} kind=${kind} setKind=${setKind} view=${view} setView=${setView} />
    </div>
    <main class="results" id="main">
      ${showGuide && html`<${Guide} onHide=${() => { setGuideHidden(true); toast('안내를 닫았어요. 메뉴의 「사용법 다시 보기」로 언제든 볼 수 있어요.'); }} />`}
      ${dq.trim()
        ? html`<div class="found"><span><b>“${dq.trim()}”</b> 찾은 노트 ${notes.length}개</span><span class="hide-m"><kbd>↓</kbd> 결과로 <span class="sp"></span><kbd>${modKey}</kbd><kbd>Enter</kbd> 물어보기</span></div>`
        : scope.kind === 'inbox' && html`<div class="found"><span>${last ? `마지막 정리 ${relTime(last)}` : '아직 정리 전이에요. 예약해 둔 시간에 Claude가 읽고 폴더로 옮겨요.'}</span></div>`}
      ${body}
    </main>
  </div>`;
}
