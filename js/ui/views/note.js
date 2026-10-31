// 노트 화면: 제목, 속성(폴더·태그·출처·날짜), Claude 요약, 내 생각, 본문(바로 쓰는 편집기, 자동 저장),
// 오른쪽 패널(연결, 비슷한 노트). /new 는 아무것도 적기 전까지 파일을 만들지 않는다.
import { html, useState, useEffect, useLayoutEffect, useRef, useCallback, autosize } from '../h.js';
import { Icon, Mascot, TYPE_ICON } from '../icons.js';
import { app, useLib, toast } from '../state.js';
import { go, setUrl, noteHref, folderHref, tagHref } from '../router.js';
import { SaveState } from '../parts/shell.js';
import { Tag, MenuItem, Empty, SkeletonRows, KindIcon, FolderDot, titleOf } from '../parts/common.js';
import { popover, modal } from '../parts/layers.js';
import { FolderPicker, Lightbox, ConfirmDialog } from '../parts/dialogs.js';
import { NoteEditor } from '../editor.js';
import { splitLinks, joinLinks } from '../../core/wiki.js';
import { categoryParts, embeds } from '../../core/note.js';
import { relTime, fullDate, KIND_LABEL } from '../format.js';
import { TEMPLATES, rememberSeen } from '../notebook.js';
import { categoryOf, categoryLook, tagsOf } from '../categories.js';

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const shortDate = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}년 `}${d.getMonth() + 1}월 ${d.getDate()}일`; };

function Grow({ value, onInput, class: cls, placeholder, onKeyDown, inputRef, label, autofocus }) {
  const ref = useRef();
  useLayoutEffect(() => autosize(ref.current), [value]);
  useLayoutEffect(() => { if (autofocus) ref.current?.focus(); }, []);
  // 옆 창이 열리며 폭이 바뀌면 높이를 다시 잰다
  useEffect(() => {
    if (!('ResizeObserver' in window) || !ref.current) return undefined;
    let w = 0;
    const ro = new ResizeObserver(([e]) => { const nw = Math.round(e.contentRect.width); if (nw !== w) { w = nw; autosize(ref.current); } });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return html`<textarea ref=${(el) => { ref.current = el; if (inputRef) inputRef.current = el; }} class=${cls} rows="1" value=${value} placeholder=${placeholder} aria-label=${label}
    onInput=${(e) => { onInput(e.target.value); autosize(e.target); }} onKeyDown=${onKeyDown}></textarea>`;
}

function TagEditor({ tags, onChange }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText('');
  };
  return html`${tags.map((t) => html`<${Tag} key=${t} name=${t} onRemove=${() => onChange(tags.filter((x) => x !== t))} />`)}
    <input class="tag-input" value=${text} placeholder="+ 태그" aria-label="태그 추가"
      onInput=${(e) => setText(e.target.value)}
      onKeyDown=${(e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
        else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
      }}
      onBlur=${add} />`;
}

// 옆 창 위쪽: 닫기, 이전·다음 노트(지금 서랍에 보이는 순서), 오른쪽 단추들
// 작업 공간 위 막대: 서랍 / 노트 이름 (옵시디언의 탭 머리), 이전·다음, 저장 상태, 오른쪽 단추들
function WsBar({ noteId = null, crumb = null, right = null, siblings = [] }) {
  // 목록에서 열었으면 그 목록 순서로, 바로 열었으면 같은 서랍 순서로
  const ids = (app.visible ?? []).includes(noteId) ? app.visible : siblings;
  const i = noteId ? ids.indexOf(noteId) : -1;
  const prev = i > 0 ? ids[i - 1] : null;
  const next = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
  app.sheetNav = (d) => { const id = d < 0 ? prev : next; if (id) go(noteHref(id), { replace: true }); };
  return html`<div class="ws-bar">
    <button type="button" class="icon-btn" aria-label="닫기" title="닫기 (Esc)" onClick=${() => app.closeSheet()}><${Icon} name="back" /></button>
    ${noteId && html`<button type="button" class="icon-btn" aria-label="이전 노트" title="이전 노트 (K)" disabled=${!prev} onClick=${() => app.sheetNav(-1)}><${Icon} name="up" /></button>
      <button type="button" class="icon-btn" aria-label="다음 노트" title="다음 노트 (J)" disabled=${!next} onClick=${() => app.sheetNav(1)}><${Icon} name="down" /></button>`}
    <div class="crumbs">${crumb}</div>
    ${right}
  </div>`;
}

// 왼쪽 칸: 같은 서랍의 노트들 (옵시디언의 파일 탐색기)
function Explorer({ note, cat }) {
  const lib = useLib();
  const list = note ? lib.all.filter((n) => categoryOf(n, lib).name === cat.name).slice(0, 300) : lib.all.slice(0, 60);
  return html`<aside class="ws-left" aria-label="같은 서랍의 노트">
    <div class="ws-pane-head"><${Icon} name=${note ? categoryLook(cat.name).icon : 'clock'} /><b>${note ? cat.name : '최근 노트'}</b><span class="grow"></span><a href=${note ? folderHref(cat.name) : '#/all'} title="모두 보기">${list.length}</a></div>
    <ul class="ex-list">${list.map((n) => html`<li key=${n.id}><a href=${noteHref(n.id)} aria-current=${note && n.id === note.id ? 'page' : undefined}><${Icon} name=${TYPE_ICON[n.meta.type] ?? 'memo'} /><span>${titleOf(n)}</span></a></li>`)}</ul>
  </aside>`;
}

// 로컬 그래프: 이 노트를 가운데 두고 이어진 노트와 비슷한 노트를 둘레에
function LocalGraph({ note }) {
  const lib = useLib();
  const linked = lib.connections(note).map((c) => c.note);
  const near = lib.related(note, 6).map((r) => r.note).filter((n) => !linked.includes(n));
  const nodes = [...linked.map((n) => ({ n, link: true })), ...near.map((n) => ({ n, link: false }))].slice(0, 10);
  const W = 270; const H = 230; const cx = W / 2; const cy = H / 2;
  const at = (i) => { const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 78 : 92; return [cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * .9]; };
  const short = (t) => (t.length > 9 ? `${t.slice(0, 8)}…` : t);
  if (!nodes.length) return html`<p class="rp-empty">연결된 노트 없음</p>`;
  return html`<svg class="lgraph" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="이 노트 주변 그래프">
    ${nodes.map((o, i) => { const [x, y] = at(i); return html`<line key=${`l${o.n.id}`} x1=${cx} y1=${cy} x2=${x} y2=${y} style=${o.link ? 'stroke: var(--accent-2)' : 'stroke-dasharray: 3 3'} />`; })}
    ${nodes.map((o, i) => { const [x, y] = at(i); return html`<g key=${o.n.id} onClick=${() => go(noteHref(o.n.id))}><circle class=${o.link ? 'link' : ''} cx=${x} cy=${y} r=${o.link ? 6 : 4.5} /><text x=${x} y=${y + 16} text-anchor="middle">${short(titleOf(o.n))}</text></g>`; })}
    <g><circle class="me" cx=${cx} cy=${cy} r="8" /><text x=${cx} y=${cy + 20} text-anchor="middle" style="font-weight:600;fill:var(--text)">${short(titleOf(note))}</text></g>
  </svg>`;
}

// 오른쪽 칸: 연결 · 목차 · 그래프 (옵시디언의 오른쪽 사이드바)
function Side({ note, md }) {
  const [tab, setTab] = useState('links');
  const tabs = [['links', '연결'], ['outline', '목차'], ['graph', '그래프']];
  return html`<aside class="ws-right" aria-label="연결과 목차">
    <div class="rp-tabs" role="tablist">${tabs.map(([k, label]) => html`<button type="button" key=${k} role="tab" aria-selected=${tab === k} onClick=${() => setTab(k)}>${label}</button>`)}</div>
    <div class="rp-body note-links">
      ${tab === 'links' && (note ? html`<${Links} note=${note} />` : html`<p class="rp-empty">저장 후 표시됩니다.</p>`)}
      ${tab === 'outline' && html`<${Outline} md=${md} />`}
      ${tab === 'graph' && (note ? html`<${LocalGraph} note=${note} />` : html`<p class="rp-empty">저장 후 표시됩니다.</p>`)}
    </div>
  </aside>`;
}

function Links({ note }) {
  const lib = useLib();
  const links = lib.connections(note);
  // 제목을 본문에 적었지만 아직 잇지 않은 노트 (옵시디언의 「링크 안 된 언급」)
  const linked = new Set(links.map((l) => l.note.id));
  const name = String(note.meta.title ?? '').trim();
  const mentions = name.length >= 2
    ? lib.all.filter((n) => n.id !== note.id && !linked.has(n.id) && `${n.meta.title ?? ''}\n${n.body ?? n.snippet ?? ''}`.includes(name)).slice(0, 5)
    : [];
  const related = lib.related(note, 5).filter(({ note: n }) => !mentions.includes(n));
  const reasons = new Map();
  for (const m of String(note.body ?? '').matchAll(/^- \[\[(\d{14})[^\]]*\]\]\s*\(([^)]+)\)/gm)) reasons.set(m[1], m[2]);
  const connect = async (other) => {
    try { await lib.connect(note, other); toast(`“${titleOf(other)}”와 이었어요`); } catch (e) { toast(e.message); }
  };
  return html`
    <div class="rp-sec">
      <h3><span><${Icon} name="connect" />이어진 노트</span><span>${links.length || ''}</span></h3>
      ${links.length
        ? links.map(({ note: n, dir }) => html`<a class="rp-item" key=${n.id} href=${noteHref(n.id)}>
            <b>${dir === 'in' ? html`<span class="kind-ic k-in" aria-hidden="true"><${Icon} name="enter" /></span>` : html`<${KindIcon} type=${n.meta.type} />`}<span>${titleOf(n)}</span></b>
            <small>${reasons.get(n.id) ?? (dir === 'in' ? '이 노트를 언급함' : categoryParts(categoryOf(n, lib).path).join(' / '))}</small>
          </a>`)
        : html`<p class="rp-empty">이어진 노트 없음</p>`}
    </div>
    ${mentions.length > 0 && html`<div class="rp-sec mentions">
      <h3><span><${Icon} name="at" />이 노트를 언급한 노트</span><span>${mentions.length}</span></h3>
      ${mentions.map((n) => html`<div class="rp-rel" key=${n.id}>
        <a class="rp-item" href=${noteHref(n.id)}><b><${KindIcon} type=${n.meta.type} /><span>${titleOf(n)}</span></b><small>“${name}” 언급</small></a>
        <button type="button" class="link-btn" title="이 노트와 잇기" aria-label=${`${titleOf(n)}와 잇기`} onClick=${() => connect(n)}>잇기</button>
      </div>`)}
    </div>`}
    ${related.length > 0 && html`<div class="rp-sec">
      <h3><span><${Icon} name="sparkle" />비슷한 노트</span></h3>
      ${related.map(({ note: n }) => html`<div class="rp-rel" key=${n.id}>
        <a class="rp-item" href=${noteHref(n.id)}><b><${KindIcon} type=${n.meta.type} /><span>${titleOf(n)}</span></b><small>${categoryParts(n.meta.category).join(' / ') || '인박스'}</small></a>
        <button type="button" class="link-btn" title="이 노트와 잇기" aria-label=${`${titleOf(n)}와 잇기`} onClick=${() => connect(n)}>잇기</button>
      </div>`)}
    </div>`}`;
}

// 목차: 본문의 제목(#)을 누르면 그 자리로
function Outline({ md }) {
  const heads = [...String(md ?? '').matchAll(/^(#{1,3})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].trim() }));
  if (!heads.length) return html`<p class="rp-empty"># 제목을 쓰면 생깁니다.</p>`;
  const jump = (i) => document.querySelectorAll('.ws-main .ProseMirror :is(h1, h2, h3)')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return html`<nav class="outline" aria-label="목차"><ol>${heads.map((h, i) => html`<li key=${i} class=${`l${h.level}`}><button type="button" onClick=${() => jump(i)}>${h.text}</button></li>`)}</ol></nav>`;
}

export function NoteView({ id, params }) {
  const lib = useLib();
  const [noteId, setNoteId] = useState(id === 'new' ? null : id);
  const note = noteId ? lib.get(noteId) : null;
  // 아직 못 불러온 노트는 내용이 들어온 뒤에 편집기를 연다 (빈 편집기에 쓰다 내용이 덮이지 않게)
  const [loaded, setLoaded] = useState(!noteId || (!!note && note.body !== undefined));
  const seeded = useRef(!noteId || !!note);
  const [title, setTitle] = useState(note?.meta.title ?? params?.get('title') ?? '');
  const [main, setMain] = useState(() => (note || id !== 'new' ? splitLinks(note?.body).main : TEMPLATES.find((t) => t.id === params?.get('template'))?.body ?? ''));
  const [thought, setThought] = useState(note?.meta.thought ?? '');
  const [saveState, setSaveState] = useState(null);
  const dirty = useRef(false);
  const queue = useRef(Promise.resolve());
  const latest = useRef({});
  const editorRef = useRef(null);
  const wantBody = useRef(false); // 편집기가 아직 준비 중일 때 제목에서 Enter를 누르면 준비되는 대로 옮긴다
  const focusBody = () => { if (editorRef.current) editorRef.current.commands.focus('start'); else wantBody.current = true; };
  latest.current = { title, main, thought, noteId };

  useEffect(() => { if (noteId && note) rememberSeen(noteId); }, [noteId, !!note]);

  // 본문이 아직 없으면(색인에서만 읽은 노트) 드라이브에서 가져온다
  useEffect(() => {
    if (!note) return;
    if (!seeded.current) {
      seeded.current = true;
      setTitle(note.meta.title ?? '');
      setThought(note.meta.thought ?? '');
      if (note.body !== undefined) setMain(splitLinks(note.body).main);
    }
    if (note.body !== undefined) { setLoaded(true); return; }
    lib.ensureBody(note).then((n) => { setMain(splitLinks(n.body).main); setTitle(n.meta.title ?? ''); setThought(n.meta.thought ?? ''); setLoaded(true); })
      .catch((e) => { toast(e.message); setLoaded(true); });
  }, [noteId, !!note]);

  // 다른 기기에서 바뀐 내용은, 내가 고치는 중이 아닐 때만 받아들인다
  useEffect(() => {
    if (!note || dirty.current || note.body === undefined) return;
    const fresh = splitLinks(note.body).main;
    if (fresh !== main) setMain(fresh);
    if ((note.meta.title ?? '') !== title) setTitle(note.meta.title ?? '');
    if ((note.meta.thought ?? '') !== thought) setThought(note.meta.thought ?? '');
  }, [note?.modifiedTime]);

  const flush = useCallback(() => {
    if (!dirty.current) return queue.current;
    dirty.current = false;
    const { title: t, main: mn, thought: th, noteId: nid } = latest.current;
    setSaveState('saving');
    queue.current = queue.current.then(async () => {
      try {
        if (!nid) {
          if (!t.trim() && !mn.trim() && !th.trim()) { setSaveState(null); return; }
          const atts = embeds(mn);
          const n = await lib.create({ type: 'memo', title: t.trim(), body: joinLinks(mn, ''), thought: th.trim() || undefined, attachments: atts.length ? atts : undefined });
          setNoteId(n.id);
          latest.current.noteId = n.id;
          setUrl(noteHref(n.id));
        } else {
          const cur = lib.get(nid);
          if (!cur) return;
          // 연결 목록은 그 사이 바뀌었을 수 있으니 지금 파일의 것을 붙인다
          const body = joinLinks(mn, splitLinks(cur.body).links);
          await lib.update(cur, { meta: { title: t.trim(), thought: th.trim(), attachments: embeds(body) }, body });
        }
        setSaveState(dirty.current ? 'saving' : 'saved');
      } catch (e) {
        dirty.current = true;
        setSaveState('error');
        toast(`저장하지 못했어요. ${e.message}`, { action: '다시 시도', onAction: () => flush() });
      }
    });
    return queue.current;
  }, []);

  const timer = useRef();
  const change = (setter) => (v) => {
    setter(v);
    dirty.current = true;
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };
  useEffect(() => () => { clearTimeout(timer.current); flush(); }, []);
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); clearTimeout(timer.current); flush(); } };
    const onLeave = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onLeave);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onLeave); };
  }, []);

  if (noteId && !note && !lib.state.synced && !lib.state.error) {
    return html`<div class="ws"><aside class="ws-left"></aside><div class="ws-main"><${WsBar} /><article class="note-page"><${SkeletonRows} n=${4} /></article></div><aside class="ws-right"></aside></div>`;
  }
  if (noteId && !note) {
    return html`<div class="ws"><aside class="ws-left"></aside><div class="ws-main"><${WsBar} /><article class="note-page"><${Empty} icon="alert" title="노트를 찾지 못했어요" text="지워졌거나 아직 불러오지 못했어요." /></article></div><aside class="ws-right"></aside></div>`;
  }

  const m = note?.meta ?? { type: 'memo', status: 'inbox' };
  const folder = m.status === 'organized' ? m.category : null;
  const cat = note ? categoryOf(note, lib) : null;
  const autoTags = note ? tagsOf(note, lib) : [];

  const ensureSaved = async () => { await flush(); return lib.get(latest.current.noteId); };
  const update = async (meta) => {
    try {
      const n = await ensureSaved();
      if (!n) { toast('먼저 내용을 적어 주세요'); return; }
      setSaveState('saving');
      await lib.update(n, { meta });
      setSaveState('saved');
    } catch (e) { setSaveState('error'); toast(e.message); }
  };
  const pickFolder = (anchor) => popover(anchor, (close) => html`<${FolderPicker} current=${folder} close=${close} onPick=${async (p) => {
    const n = await ensureSaved();
    if (!n) { toast('먼저 내용을 적어 주세요'); return; }
    try { await lib.moveTo(n, p); toast(p ? `${categoryParts(p).join(' / ')}(으)로 옮김` : '자동 분류로 변경'); } catch (e) { toast(e.message); }
  }} />`, { width: 300 });
  const remove = () => modal((close) => html`<${ConfirmDialog} close=${close} title="이 노트를 지울까요?" text="구글 드라이브 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요." yes="지우기" danger
    onYes=${async () => {
      const n = lib.get(latest.current.noteId);
      if (!n) { app.closeSheet(); return; }
      try {
        const undo = await lib.remove(n);
        app.closeSheet();
        toast('노트를 지웠어요', { action: '되돌리기', duration: 6000, onAction: async () => { await undo(); go(noteHref(n.id)); } });
      } catch (e) { toast(e.message); }
    }} />`);
  const pinned = !!m.pinned;
  const togglePin = () => update({ pinned: pinned ? undefined : true }).then(() => toast(pinned ? '즐겨찾기에서 뺐어요' : '즐겨찾기에 넣었어요'));
  const more = (anchor) => popover(anchor, (close) => html`
    <${MenuItem} icon="star" label=${pinned ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'} onClick=${() => { close(); togglePin(); }} />
    <${MenuItem} icon="folder" label="서랍 바꾸기" onClick=${() => { close(); pickFolder(anchor); }} />
    ${m.source && html`<${MenuItem} icon="external" label="원문 열기" onClick=${() => { close(); window.open(m.source, '_blank', 'noopener'); }} />`}
    <${MenuItem} icon="copy" label="노트 링크 복사" onClick=${async () => { close(); try { await navigator.clipboard.writeText(location.href); toast('링크를 복사했어요'); } catch { toast('복사하지 못했어요.'); } }} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="trash" label="지우기" danger onClick=${() => { close(); remove(); }} />`);

  const kindLabel = KIND_LABEL[m.type] ?? '메모';
  return html`<div class="ws">
    <${Explorer} note=${note} cat=${cat} />
    <div class="ws-main">
      <${WsBar} noteId=${noteId} siblings=${note && cat ? lib.all.filter((n) => categoryOf(n, lib).name === cat.name).map((n) => n.id) : []} crumb=${html`${cat ? html`<a href=${folderHref(cat.name)}>${cat.name}</a><${Icon} name="chevron" />${cat.sub && html`<a href=${folderHref(`${cat.name}/${cat.sub}`)}>${cat.sub}</a><${Icon} name="chevron" />`}` : html`<span>새 노트</span><${Icon} name="chevron" />`}<b>${title.trim() || (note ? titleOf(note) : '제목 없음')}</b>`} right=${html`
        <${SaveState} state=${saveState} />
        <span class="grow"></span>
        ${note && html`<button type="button" class=${`icon-btn${pinned ? ' starred' : ''}`} aria-pressed=${pinned} aria-label="즐겨찾기" title="즐겨찾기" onClick=${togglePin}><${Icon} name="star" /></button>`}
        <button type="button" class="icon-btn" aria-label="더 보기" onClick=${(e) => more(e.currentTarget)}><${Icon} name="more" /></button>`} />
      <article class=${`note-page k-${m.type ?? 'memo'}`}>
        <${Grow} class="note-title" value=${title} onInput=${change(setTitle)} placeholder=${note ? titleOf(note) : '제목'} label="제목" autofocus=${!noteId}
          onKeyDown=${(e) => { if ((e.key === 'Enter' || e.key === 'ArrowDown') && !e.isComposing) { e.preventDefault(); focusBody(); } }} />
        <dl class="props" aria-label="속성">
          <dt><${Icon} name="drawer" />서랍</dt>
          <dd><button type="button" class=${`mpill${cat?.auto ? ' auto' : ''}`} title=${cat?.auto ? `자동 분류${cat.why ? `: ${cat.why}` : ''}. 눌러서 서랍을 바꿔요` : '서랍 바꾸기'} onClick=${(e) => pickFolder(e.currentTarget)}>
              <${FolderDot} path=${cat?.path ?? ''} />${cat ? categoryParts(cat.path).join(' / ') : '자동 분류'}${cat?.auto && html`<span class="auto-badge">자동</span>`}<${Icon} name="down" /></button>
            ${cat?.auto && html`<p class="auto-why"><${Mascot} size=${18} /><span>자동 분류${cat.why ? `: ${cat.why}` : ''}</span></p>`}</dd>
          <dt><${Icon} name="tag" />태그</dt>
          <dd><${TagEditor} tags=${m.tags ?? []} onChange=${(tags) => update({ tags })} />
            ${note && !(m.tags ?? []).length && autoTags.length > 0 && html`<p class="auto-tags"><span class="auto-badge">자동</span>${autoTags.map((t) => html`<a key=${t} class="atag" href=${tagHref(t)}>#${t}</a>`)}
              <button type="button" class="btn-link" onClick=${() => update({ tags: autoTags })}>태그로 저장</button></p>`}</dd>
          <dt><${Icon} name=${TYPE_ICON[m.type] ?? 'memo'} />종류</dt>
          <dd>${kindLabel}${m.author ? ` · @${m.author}` : ''}</dd>
          ${m.source && html`<dt><${Icon} name="external" />출처</dt><dd><a href=${m.source} target="_blank" rel="noopener" title=${m.source}>${hostOf(m.source)}</a></dd>`}
          <dt><${Icon} name="calendar" />만든 날</dt>
          <dd title=${note ? fullDate(m.created) : ''}>${note ? shortDate(m.created) : '지금'}</dd>
        </dl>
        ${m.summary && html`<div class="callout"><b><${Icon} name="sparkle" />요약</b><p>${m.summary}</p></div>`}
        <div class="thought-note"><${Icon} name="thought" />
          <${Grow} value=${thought} onInput=${change(setThought)} label="내 생각" placeholder="저장한 이유" />
        </div>
        ${!noteId && !main.trim() && html`<div class="templates" role="group" aria-label="템플릿으로 시작">
          <span>템플릿</span>
          ${TEMPLATES.filter((t) => !t.hidden).map((t) => html`<button type="button" key=${t.id} class="tpl" onClick=${() => {
            if (!title.trim() && t.title) change(setTitle)(t.title);
            change(setMain)(t.body);
            setTimeout(() => editorRef.current?.commands.focus('end'), 60);
          }}><${Icon} name=${t.icon} />${t.label}</button>`)}
        </div>`}
        ${loaded
          ? html`<${NoteEditor} noteId=${noteId} value=${main} onChange=${change(setMain)} editorRef=${editorRef}
              onReady=${(ed) => { if (wantBody.current) { wantBody.current = false; ed.commands.focus('start'); } }}
              placeholder="/ 명령어, [[ 노트 연결"
              onTokens=${async ({ tags, drawer }) => {
                if (tags.length) await update({ tags: [...new Set([...(lib.get(latest.current.noteId)?.meta.tags ?? m.tags ?? []), ...tags])] });
                if (drawer) { const n = await ensureSaved(); if (n) { await lib.moveTo(lib.get(n.id) ?? n, drawer); toast(`${drawer.replace('/', ' / ')}(으)로 옮김`); } }
              }}
              onImage=${(src) => modal((close) => html`<${Lightbox} src=${src} close=${close} />`)} />`
          : html`<div class="sk" style="height:16px;width:80%;margin-bottom:10px"></div><div class="sk" style="height:16px;width:60%"></div>`}
        ${note && html`<p class="facts"><span>${fullDate(m.created)}에 넣음</span><span>${relTime(m.updated || m.created)} 고침</span>${m.organized && html`<span>${relTime(m.organized)} Claude가 정리</span>`}<span class="num">No.${note.id}</span></p>`}
      </article>
    </div>
    <${Side} note=${note} md=${main} />
  </div>`;
}
