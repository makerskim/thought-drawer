// 노트 화면: 제목, 속성(폴더·태그·출처·날짜), Claude 요약, 내 생각, 본문(바로 쓰는 편집기, 자동 저장),
// 오른쪽 패널(연결, 비슷한 노트). /new 는 아무것도 적기 전까지 파일을 만들지 않는다.
import { html, useState, useEffect, useLayoutEffect, useRef, useCallback, autosize } from '../h.js';
import { Icon, TYPE_ICON } from '../icons.js';
import { app, useLib, toast } from '../state.js';
import { go, setUrl, noteHref } from '../router.js';
import { SaveState } from '../parts/shell.js';
import { Tag, MenuItem, Empty, SkeletonRows, titleOf } from '../parts/common.js';
import { popover, modal } from '../parts/layers.js';
import { FolderPicker, Lightbox, ConfirmDialog } from '../parts/dialogs.js';
import { NoteEditor } from '../editor.js';
import { splitLinks, joinLinks } from '../../core/wiki.js';
import { categoryParts, embeds } from '../../core/note.js';
import { relTime, fullDate, KIND_LABEL } from '../format.js';

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
export function SheetBar({ noteId = null, right = null }) {
  const ids = app.visible ?? [];
  const i = noteId ? ids.indexOf(noteId) : -1;
  const prev = i > 0 ? ids[i - 1] : null;
  const next = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
  app.sheetNav = (d) => { const id = d < 0 ? prev : next; if (id) go(noteHref(id), { replace: true }); };
  return html`<div class="sheet-bar">
    <button type="button" class="icon-btn" aria-label="닫기" title="닫기 (Esc)" onClick=${() => app.closeSheet()}><${Icon} name="x" /></button>
    ${noteId && html`<button type="button" class="icon-btn" aria-label="이전 노트" title="이전 노트 (K)" disabled=${!prev} onClick=${() => app.sheetNav(-1)}><${Icon} name="up" /></button>
      <button type="button" class="icon-btn" aria-label="다음 노트" title="다음 노트 (J)" disabled=${!next} onClick=${() => app.sheetNav(1)}><${Icon} name="down" /></button>`}
    ${right}
  </div>`;
}

function Links({ note }) {
  const lib = useLib();
  const links = lib.connections(note);
  const related = lib.related(note, 5);
  const reasons = new Map();
  for (const m of String(note.body ?? '').matchAll(/^- \[\[(\d{14})[^\]]*\]\]\s*\(([^)]+)\)/gm)) reasons.set(m[1], m[2]);
  const connect = async (other) => {
    try { await lib.connect(note, other); toast(`“${titleOf(other)}”와 이었어요.`); } catch (e) { toast(e.message); }
  };
  return html`
    <div class="rp-sec">
      <h3><span>연결된 노트</span><span>${links.length || ''}</span></h3>
      ${links.length
        ? links.map(({ note: n, dir }) => html`<a class="rp-item" key=${n.id} href=${noteHref(n.id)}>
            <b><${Icon} name=${dir === 'in' ? 'back' : TYPE_ICON[n.meta.type] ?? 'memo'} /><span>${titleOf(n)}</span></b>
            <small>${reasons.get(n.id) ?? (dir === 'in' ? '이 노트를 언급함' : (categoryParts(n.meta.category).join(' / ') || '인박스'))}</small>
          </a>`)
        : html`<p class="rp-empty">아직 이어진 노트가 없어요. 정리할 때 Claude가 관련 노트를 이어 주고, 아래 비슷한 노트를 직접 이을 수도 있어요.</p>`}
    </div>
    ${related.length > 0 && html`<div class="rp-sec">
      <h3><span>비슷한 노트</span></h3>
      ${related.map(({ note: n }) => html`<div class="rp-rel" key=${n.id}>
        <a class="rp-item" href=${noteHref(n.id)}><b><${Icon} name=${TYPE_ICON[n.meta.type] ?? 'memo'} /><span>${titleOf(n)}</span></b><small>${categoryParts(n.meta.category).join(' / ') || '인박스'}</small></a>
        <button type="button" class="icon-btn" title="이 노트와 잇기" aria-label=${`${titleOf(n)}와 잇기`} onClick=${() => connect(n)}><${Icon} name="connect" /></button>
      </div>`)}
    </div>`}`;
}

export function NoteView({ id, params }) {
  const lib = useLib();
  const [noteId, setNoteId] = useState(id === 'new' ? null : id);
  const note = noteId ? lib.get(noteId) : null;
  // 아직 못 불러온 노트는 내용이 들어온 뒤에 편집기를 연다 (빈 편집기에 쓰다 내용이 덮이지 않게)
  const [loaded, setLoaded] = useState(!noteId || (!!note && note.body !== undefined));
  const seeded = useRef(!noteId || !!note);
  const [title, setTitle] = useState(note?.meta.title ?? params?.get('title') ?? '');
  const [main, setMain] = useState(splitLinks(note?.body).main);
  const [thought, setThought] = useState(note?.meta.thought ?? '');
  const [saveState, setSaveState] = useState(null);
  const dirty = useRef(false);
  const queue = useRef(Promise.resolve());
  const latest = useRef({});
  const editorRef = useRef(null);
  const wantBody = useRef(false); // 편집기가 아직 준비 중일 때 제목에서 Enter를 누르면 준비되는 대로 옮긴다
  const focusBody = () => { if (editorRef.current) editorRef.current.commands.focus('start'); else wantBody.current = true; };
  latest.current = { title, main, thought, noteId };

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
    return html`<${SheetBar} /><div class="sheet-body"><article class="note-page"><${SkeletonRows} n=${4} /></article></div>`;
  }
  if (noteId && !note) {
    return html`<${SheetBar} /><div class="sheet-body"><article class="note-page"><${Empty} icon="alert" title="노트를 찾지 못했어요" text="지워졌거나 아직 불러오지 못했어요." /></article></div>`;
  }

  const m = note?.meta ?? { type: 'memo', status: 'inbox' };
  const folder = m.status === 'organized' ? m.category : null;

  const ensureSaved = async () => { await flush(); return lib.get(latest.current.noteId); };
  const update = async (meta) => {
    try {
      const n = await ensureSaved();
      if (!n) { toast('먼저 제목이나 내용을 적어 주세요.'); return; }
      setSaveState('saving');
      await lib.update(n, { meta });
      setSaveState('saved');
    } catch (e) { setSaveState('error'); toast(e.message); }
  };
  const pickFolder = (anchor) => popover(anchor, (close) => html`<${FolderPicker} current=${folder} close=${close} onPick=${async (p) => {
    const n = await ensureSaved();
    if (!n) { toast('먼저 제목이나 내용을 적어 주세요.'); return; }
    try { await lib.moveTo(n, p); toast(p ? `${categoryParts(p).join(' / ')}에 넣었어요.` : '인박스로 옮겼어요.'); } catch (e) { toast(e.message); }
  }} />`, { width: 300 });
  const remove = () => modal((close) => html`<${ConfirmDialog} close=${close} title="이 노트를 지울까요?" text="구글 드라이브 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요." yes="지우기" danger
    onYes=${async () => {
      const n = lib.get(latest.current.noteId);
      if (!n) { app.closeSheet(); return; }
      try {
        const undo = await lib.remove(n);
        app.closeSheet();
        toast('노트를 지웠어요.', { action: '되돌리기', duration: 6000, onAction: async () => { await undo(); go(noteHref(n.id)); } });
      } catch (e) { toast(e.message); }
    }} />`);
  const pinned = !!m.pinned;
  const togglePin = () => update({ pinned: pinned ? undefined : true }).then(() => toast(pinned ? '즐겨찾기에서 뺐어요.' : '즐겨찾기에 넣었어요.'));
  const more = (anchor) => popover(anchor, (close) => html`
    <${MenuItem} icon="star" label=${pinned ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'} onClick=${() => { close(); togglePin(); }} />
    <${MenuItem} icon="folder" label="폴더 옮기기" onClick=${() => { close(); pickFolder(anchor); }} />
    ${m.source && html`<${MenuItem} icon="external" label="원문 열기" onClick=${() => { close(); window.open(m.source, '_blank', 'noopener'); }} />`}
    <${MenuItem} icon="copy" label="노트 링크 복사" onClick=${async () => { close(); try { await navigator.clipboard.writeText(location.href); toast('링크를 복사했어요.'); } catch { toast('복사하지 못했어요.'); } }} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="trash" label="지우기" danger onClick=${() => { close(); remove(); }} />`);

  return html`
    <${SheetBar} noteId=${noteId} right=${html`
      <${SaveState} state=${saveState} />
      <span class="grow"></span>
      ${note && html`<button type="button" class=${`icon-btn${pinned ? ' starred' : ''}`} aria-pressed=${pinned} aria-label="즐겨찾기" title="즐겨찾기" onClick=${togglePin}><${Icon} name="star" /></button>`}
      <button type="button" class="icon-btn" aria-label="더 보기" onClick=${(e) => more(e.currentTarget)}><${Icon} name="more" /></button>`} />
    <div class="sheet-body">
      <article class="note-page">
          <${Grow} class="note-title" value=${title} onInput=${change(setTitle)} placeholder=${note ? titleOf(note) : '제목 없음'} label="제목" autofocus=${!noteId}
            onKeyDown=${(e) => { if ((e.key === 'Enter' || e.key === 'ArrowDown') && !e.isComposing) { e.preventDefault(); focusBody(); } }} />
          <div class="meta-row">
            <button type="button" class=${`mpill${folder ? '' : ' quiet'}`} title="폴더 옮기기" onClick=${(e) => pickFolder(e.currentTarget)}>
              <${Icon} name=${folder ? 'folder' : 'inbox'} />${folder ? categoryParts(folder).join(' / ') : '인박스'}
            </button>
            <${TagEditor} tags=${m.tags ?? []} onChange=${(tags) => update({ tags })} />
            ${m.source && html`<a class="mpill" href=${m.source} target="_blank" rel="noopener" title=${m.source}><${Icon} name="external" />${hostOf(m.source)}</a>`}
            <span class="mtext">${KIND_LABEL[m.type] ?? '메모'}${m.author ? ` @${m.author}` : ''}</span>
            <span class="mtext" title=${note ? fullDate(m.created) : ''}>${note ? shortDate(m.created) : '지금'}</span>
          </div>
          <div class="annot">
            ${m.summary && html`<div class="annot-ai"><${Icon} name="sparkle" /><p>${m.summary}</p></div>`}
            <div class="annot-me"><${Icon} name="thought" />
              <${Grow} value=${thought} onInput=${change(setThought)} label="내 생각" placeholder="내 생각: 왜 저장했는지, 어디에 쓸지 한 줄" />
            </div>
          </div>
          ${loaded
            ? html`<${NoteEditor} noteId=${noteId} value=${main} onChange=${change(setMain)} editorRef=${editorRef}
                onReady=${(ed) => { if (wantBody.current) { wantBody.current = false; ed.commands.focus('start'); } }}
                placeholder="내용을 쓰세요. / 를 치면 제목·목록·사진, [[ 를 치면 다른 노트를 이어요."
                onImage=${(src) => modal((close) => html`<${Lightbox} src=${src} close=${close} />`)} />`
            : html`<div class="sk" style="height:16px;width:80%;margin-bottom:10px"></div><div class="sk" style="height:16px;width:60%"></div>`}
          ${note && html`<section class="note-links"><${Links} note=${note} /></section>
            <dl class="facts">
              <dt>만든 날</dt><dd>${fullDate(m.created)}</dd>
              <dt>수정</dt><dd>${relTime(m.updated || m.created)}</dd>
              ${m.organized && html`<dt>정리</dt><dd>Claude가 ${relTime(m.organized)}</dd>`}
              <dt>번호</dt><dd class="num">${note.id}</dd>
            </dl>`}
        </article>
    </div>`;
}
