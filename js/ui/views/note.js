// 노트 화면: 제목, 속성(폴더·태그·출처·날짜), Claude 요약, 내 생각, 본문(누르면 편집, 자동 저장),
// 오른쪽 패널(연결, 비슷한 노트). /new 는 아무것도 적기 전까지 파일을 만들지 않는다.
import { html, useState, useEffect, useLayoutEffect, useRef, useCallback, autosize } from '../h.js';
import { Icon, TYPE_ICON } from '../icons.js';
import { app, useLib, usePref, toast } from '../state.js';
import { go, setUrl, noteHref, folderHref } from '../router.js';
import { Topbar, SaveState } from '../parts/shell.js';
import { Tag, MenuItem, Empty, titleOf } from '../parts/common.js';
import { popover, modal } from '../parts/layers.js';
import { FolderPicker, Lightbox, ConfirmDialog } from '../parts/dialogs.js';
import { renderMarkdown, hydrate, withoutLinks } from '../render.js';
import { categoryParts } from '../../core/note.js';
import { relTime, fullDate, KIND_LABEL } from '../format.js';

function Grow({ value, onInput, class: cls, placeholder, onKeyDown, inputRef, label, autofocus }) {
  const ref = useRef();
  useLayoutEffect(() => autosize(ref.current), [value]);
  useLayoutEffect(() => { if (autofocus) ref.current?.focus(); }, []);
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
    <input class="tag-input" value=${text} placeholder=${tags.length ? '' : '태그 추가'} aria-label="태그 추가"
      onInput=${(e) => setText(e.target.value)}
      onKeyDown=${(e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
        else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
      }}
      onBlur=${add} />`;
}

function Prop({ icon, label, children }) {
  return html`<div class="prop"><div class="k"><${Icon} name=${icon} />${label}</div><div class="v">${children}</div></div>`;
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

function Body({ note, body, setBody, editing, setEditing }) {
  const lib = useLib();
  const viewRef = useRef();
  const edRef = useRef();
  const shown = withoutLinks(body);
  useEffect(() => {
    if (!editing && viewRef.current) hydrate(viewRef.current, lib, (src) => modal((close) => html`<${Lightbox} src=${src} close=${close} />`));
  });
  // 편집으로 바뀌는 그 순간 바로 커서를 옮긴다 (다음 글자가 제목에 들어가지 않게)
  useLayoutEffect(() => {
    if (editing && edRef.current) { const el = edRef.current; el.focus(); el.setSelectionRange(el.value.length, el.value.length); autosize(el); }
  }, [editing]);
  if (editing) {
    return html`<div>
      <${Grow} inputRef=${edRef} class="editor" value=${body} onInput=${setBody} label="본문"
        placeholder="여기에 쓰세요. 마크다운을 쓸 수 있고, [[노트 제목]]으로 다른 노트를 이어요."
        onKeyDown=${(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); } }} />
      <div class="edit-hint"><span>Esc 보기로 돌아가기</span><span># 제목, - 목록, **굵게**, [[노트 잇기]]</span></div>
    </div>`;
  }
  const onClick = (e) => { if (!e.target.closest('a, img')) setEditing(true); };
  return html`<div ref=${viewRef} class=${`prose body-view${shown ? '' : ' empty'}`} tabindex="0" role="button" aria-label="본문 편집"
    data-placeholder="여기를 눌러 내용을 쓰세요."
    onClick=${onClick} onKeyDown=${(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); setEditing(true); } }}
    dangerouslySetInnerHTML=${{ __html: shown ? renderMarkdown(shown, lib) : '' }}></div>`;
}

export function NoteView({ id, params }) {
  const lib = useLib();
  const [noteId, setNoteId] = useState(id === 'new' ? null : id);
  const note = noteId ? lib.get(noteId) : null;
  const [loaded, setLoaded] = useState(!note || note.body !== undefined);
  const [title, setTitle] = useState(note?.meta.title ?? params?.get('title') ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [thought, setThought] = useState(note?.meta.thought ?? '');
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState(null);
  const [panel, setPanel] = usePref('panel', true);
  const dirty = useRef(false);
  const queue = useRef(Promise.resolve());
  const latest = useRef({});
  latest.current = { title, body, thought, noteId };

  // 본문이 아직 없으면(색인에서만 읽은 노트) 드라이브에서 가져온다
  useEffect(() => {
    if (!note || note.body !== undefined) { setLoaded(true); return; }
    lib.ensureBody(note).then((n) => { setBody(n.body ?? ''); setTitle(n.meta.title ?? ''); setThought(n.meta.thought ?? ''); setLoaded(true); })
      .catch((e) => { toast(e.message); setLoaded(true); });
  }, [noteId]);

  // 다른 기기에서 바뀐 내용은, 내가 고치는 중이 아닐 때만 받아들인다
  useEffect(() => {
    if (!note || dirty.current || note.body === undefined) return;
    if (note.body !== body) setBody(note.body);
    if ((note.meta.title ?? '') !== title) setTitle(note.meta.title ?? '');
    if ((note.meta.thought ?? '') !== thought) setThought(note.meta.thought ?? '');
  }, [note?.modifiedTime]);

  const flush = useCallback(() => {
    if (!dirty.current) return queue.current;
    dirty.current = false;
    const { title: t, body: b, thought: th, noteId: nid } = latest.current;
    setSaveState('saving');
    queue.current = queue.current.then(async () => {
      try {
        if (!nid) {
          if (!t.trim() && !b.trim() && !th.trim()) { setSaveState(null); return; }
          const n = await lib.create({ type: 'memo', title: t.trim(), body: b, thought: th.trim() || undefined });
          setNoteId(n.id);
          latest.current.noteId = n.id;
          setUrl(noteHref(n.id));
        } else {
          const cur = lib.get(nid);
          if (!cur) return;
          await lib.update(cur, { meta: { title: t.trim(), thought: th.trim() }, body: b });
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

  if (noteId && !note) {
    return html`<${Topbar} crumbs=${[{ label: '노트' }]} /><div class="page narrow"><${Empty} icon="alert" title="노트를 찾지 못했어요" text="지워졌거나 아직 불러오지 못했어요."><button type="button" class="btn" onClick=${() => go('#/')}>홈으로</button></${Empty}></div>`;
  }

  const m = note?.meta ?? { type: 'memo', status: 'inbox' };
  const folder = m.status === 'organized' ? m.category : null;
  const crumbs = [
    ...(folder ? categoryParts(folder).map((p, i, a) => ({ label: p, href: folderHref(a.slice(0, i + 1).join('/')) })) : [{ label: '인박스', href: '#/inbox' }]),
    { label: title.trim() || (note ? titleOf(note) : '새 노트') },
  ];

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
      if (!n) { go('#/'); return; }
      try {
        const undo = await lib.remove(n);
        go(folder ? folderHref(folder) : '#/inbox', { replace: true });
        toast('노트를 지웠어요.', { action: '되돌리기', duration: 6000, onAction: async () => { await undo(); go(noteHref(n.id)); } });
      } catch (e) { toast(e.message); }
    }} />`);
  const more = (anchor) => popover(anchor, (close) => html`
    <${MenuItem} icon="folder" label="폴더 옮기기" onClick=${() => { close(); pickFolder(anchor); }} />
    ${m.source && html`<${MenuItem} icon="external" label="원문 열기" onClick=${() => { close(); window.open(m.source, '_blank', 'noopener'); }} />`}
    <${MenuItem} icon="copy" label="노트 링크 복사" onClick=${async () => { close(); try { await navigator.clipboard.writeText(location.href); toast('링크를 복사했어요.'); } catch { toast('복사하지 못했어요.'); } }} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="trash" label="지우기" danger onClick=${() => { close(); remove(); }} />`);

  return html`
    <${Topbar} crumbs=${crumbs} right=${html`
      <${SaveState} state=${saveState} />
      <button type="button" class="icon-btn hide-m" aria-pressed=${panel} aria-label="연결 패널" title="연결 패널" onClick=${() => setPanel(!panel)}><${Icon} name="panel" /></button>
      <button type="button" class="icon-btn" aria-label="더 보기" onClick=${(e) => more(e.currentTarget)}><${Icon} name="more" /></button>`} />
    <div class="note-wrap">
      <div class="scroll">
        <article class="note-page">
          <div class="note-icon"><${Icon} name=${TYPE_ICON[m.type] ?? 'memo'} /></div>
          <${Grow} class="note-title" value=${title} onInput=${change(setTitle)} placeholder=${note ? titleOf(note) : '제목 없음'} label="제목" autofocus=${!noteId}
            onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); setEditing(true); } }} />
          <div class="props">
            <${Prop} icon="folder" label="폴더">
              <button type="button" class="val-btn" onClick=${(e) => pickFolder(e.currentTarget)}>
                ${folder ? categoryParts(folder).join(' / ') : html`<span class="empty-val">인박스, Claude가 정리할 예정</span>`}
              </button>
            </${Prop}>
            <${Prop} icon="tag" label="태그"><${TagEditor} tags=${m.tags ?? []} onChange=${(tags) => update({ tags })} /></${Prop}>
            <${Prop} icon="type" label="종류"><span>${KIND_LABEL[m.type] ?? '메모'}${m.author ? html` <span class="muted">@${m.author}</span>` : ''}</span></${Prop}>
            ${m.source && html`<${Prop} icon="link" label="출처"><a class="src" href=${m.source} target="_blank" rel="noopener">${m.source.replace(/^https?:\/\/(www\.)?/, '')}</a></${Prop}>`}
            <${Prop} icon="calendar" label="만든 날"><span title=${fullDate(m.created)}>${note ? fullDate(m.created) : '지금'}</span></${Prop}>
            ${m.organized && html`<${Prop} icon="sparkle" label="정리"><span class="muted">Claude가 ${relTime(m.organized)} 정리함</span></${Prop}>`}
          </div>
          ${m.summary && html`<div class="callout ai"><${Icon} name="sparkle" /><div class="c-body"><div class="c-label">Claude 요약</div>${m.summary}</div></div>`}
          <div class="callout"><${Icon} name="thought" /><div class="c-body"><div class="c-label">내 생각</div>
            <${Grow} value=${thought} onInput=${change(setThought)} label="내 생각" placeholder="왜 저장했는지, 어디에 쓸지 내 말로 한 줄" />
          </div></div>
          <div class="divider"></div>
          ${loaded
            ? html`<${Body} note=${note} body=${body} setBody=${change(setBody)} editing=${editing} setEditing=${setEditing} />`
            : html`<div class="sk" style="height:16px;width:80%;margin-bottom:10px"></div><div class="sk" style="height:16px;width:60%"></div>`}
          ${note && html`<section class=${`note-links-inline${panel ? ' wide-only' : ''}`}><${Links} note=${note} /></section>`}
        </article>
      </div>
      ${note && panel && html`<aside class="rpanel" aria-label="연결"><${Links} note=${note} />
        <div class="rp-sec"><h3><span>정보</span></h3><p class="rp-empty">수정 ${relTime(m.updated || m.created)}<br />글자 ${withoutLinks(body).length.toLocaleString()}자<br />번호 ${note.id}</p></div>
      </aside>`}
    </div>`;
}
