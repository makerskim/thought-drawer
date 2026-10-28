// 홈: 인사, 빠른 기록, 인박스, 최근 노트, 폴더
import { html, useState, useRef, autosize } from '../h.js';
import { Icon } from '../icons.js';
import { app, useLib, toast } from '../state.js';
import { go, noteHref, folderHref } from '../router.js';
import { Topbar } from '../parts/shell.js';
import { NoteRow, Empty, titleOf } from '../parts/common.js';
import { greeting, todayLabel, modKey } from '../format.js';
import { capturePhotos } from '../capture.js';

const URL_RE = /^(https?:\/\/\S+)\s*([\s\S]*)$/i;

// 한 줄이면 내용만, 여러 줄이면 첫 줄을 제목으로 쓴다. 주소로 시작하면 링크 노트.
export async function saveQuick(text) {
  const t = text.trim();
  if (!t) return null;
  const m = URL_RE.exec(t);
  if (m) return app.lib.addLink(m[1], m[2]);
  const lines = t.split('\n');
  if (lines.length > 1 && lines[0].length <= 60) return app.lib.create({ type: 'memo', title: lines[0].trim(), body: lines.slice(1).join('\n').trim() });
  return app.lib.create({ type: 'memo', body: t });
}

function QuickCapture() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const n = await saveQuick(text);
      setText('');
      if (ref.current) { ref.current.value = ''; autosize(ref.current); }
      toast('인박스에 저장했어요.', { action: '열기', onAction: () => go(noteHref(n.id)) });
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); e.stopPropagation(); capturePhotos(files, text); setText(''); }
  };
  return html`<div class=${`capture${drag ? ' drag' : ''}`}
      onDragOver=${(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
      onDragLeave=${() => setDrag(false)}
      onDrop=${(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); capturePhotos([...e.dataTransfer.files], text); setText(''); }}>
    <textarea ref=${ref} rows="1" value=${text} aria-label="빠른 기록"
      placeholder="떠오른 생각, 링크, 사고 싶은 것. 무엇이든 적어 두세요"
      onInput=${(e) => { setText(e.target.value); autosize(e.target); }}
      onPaste=${onPaste}
      onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } }}></textarea>
    <div class="bar">
      <button type="button" class="icon-btn" aria-label="사진 넣기" title="사진 넣기" onClick=${() => app.pickPhotos(text)}><${Icon} name="capture" /></button>
      <button type="button" class="icon-btn" aria-label="링크 넣기" title="링크 넣기" onClick=${() => app.openLinkDialog()}><${Icon} name="link" /></button>
      <span class="hint hide-m">↵ 저장, Shift ↵ 줄바꿈</span>
      <button type="button" class="btn btn-primary" disabled=${!text.trim() || busy} onClick=${submit}>저장</button>
    </div>
  </div>`;
}

export function Home() {
  const lib = useLib();
  const inbox = lib.inbox();
  const recent = lib.recent(12).filter((n) => n.meta.status !== 'inbox').slice(0, 8);
  const folders = lib.folders();
  const name = (app.profile?.name ?? '').split(' ')[0];
  return html`
    <${Topbar} crumbs=${[{ label: '홈' }]} />
    <div class="page">
      <div class="greet"><h1>${name ? `${name}님, ` : ''}${greeting()}</h1><p>${todayLabel()}</p></div>
      <${QuickCapture} />
      <div class="stats">
        <a class="stat hot" href="#/inbox">인박스 <b>${inbox.length}</b></a>
        <span class="stat">노트 <b>${lib.all.length}</b></span>
        <span class="stat">폴더 <b>${folders.length}</b></span>
        <button type="button" class="stat hide-m" onClick=${() => app.openPalette()}><${Icon} name="search" size=${14} />검색 <kbd>${modKey} K</kbd></button>
      </div>

      ${inbox.length > 0 && html`<section class="section">
        <div class="section-head"><h2>인박스</h2><a href="#/inbox">모두 보기</a></div>
        <div class="rows">${inbox.slice(0, 4).map((n) => html`<${NoteRow} key=${n.id} note=${n} showFolder=${false} />`)}</div>
      </section>`}

      <section class="section">
        <div class="section-head"><h2>최근 수정</h2></div>
        ${recent.length
          ? html`<div class="rows">${recent.map((n) => html`<${NoteRow} key=${n.id} note=${n} />`)}</div>`
          : html`<${Empty} icon="memo" title="첫 노트를 남겨 보세요" text="위 칸에 적고 Enter를 누르면 인박스에 들어가요. 사진은 끌어다 놓거나 붙여 넣어도 돼요." />`}
      </section>

      ${folders.length > 0 && html`<section class="section">
        <div class="section-head"><h2>폴더</h2></div>
        <div class="folder-grid">${folders.map((f) => {
          const notes = lib.inFolder(f.path).slice(0, 3);
          return html`<a class="fcard" key=${f.path} href=${folderHref(f.path)}>
            <div class="top"><${Icon} name="folder" />${f.name}<span class="n">${f.count}</span></div>
            <ul>${notes.map((n) => html`<li key=${n.id}>${titleOf(n)}</li>`)}</ul>
          </a>`;
        })}</div>
      </section>`}
    </div>`;
}
