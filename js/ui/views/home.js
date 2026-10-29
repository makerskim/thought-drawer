// 홈: 빠른 기록, 인박스, 최근 노트, 폴더
import { html, useState, useRef, autosize } from '../h.js';
import { Icon } from '../icons.js';
import { app, useLib, toast } from '../state.js';
import { go, noteHref, folderHref } from '../router.js';
import { Topbar } from '../parts/shell.js';
import { NoteRow, MCard, Empty, titleOf } from '../parts/common.js';
import { capturePhotos } from '../capture.js';

const URL_RE = /^(https?:\/\/\S+)\s*([\s\S]*)$/i;

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
      <span class="grow"></span>
      <span class="hint hide-m">↵ 저장, Shift ↵ 줄바꿈</span>
      <button type="button" class="btn btn-primary" disabled=${!text.trim() || busy} onClick=${submit}>저장</button>
    </div>
  </div>`;
}

export function Home() {
  const lib = useLib();
  const inbox = lib.inbox();
  const recent = lib.recent(24).filter((n) => n.meta.status !== 'inbox').slice(0, 12);
  const folders = lib.folders();
  return html`
    <${Topbar} crumbs=${[{ label: '홈' }]} />
    <div class="page home">
      <${QuickCapture} />

      ${inbox.length > 0 && html`<section class="section">
        <div class="section-head"><h2>인박스 <span class="count">${inbox.length}</span></h2><a href="#/inbox">모두 보기</a></div>
        <div class="rows">${inbox.slice(0, 3).map((n) => html`<${NoteRow} key=${n.id} note=${n} showFolder=${false} />`)}</div>
      </section>`}

      <section class="section">
        <div class="section-head"><h2>최근</h2></div>
        ${recent.length
          ? html`<div class="masonry">${recent.map((n) => html`<${MCard} key=${n.id} note=${n} />`)}</div>`
          : html`<${Empty} icon="memo" title="아직 정리된 노트가 없어요" text="위 칸에 적고 Enter를 누르면 인박스에 들어가요. 사진은 끌어다 놓거나 붙여 넣어도 돼요." />`}
      </section>

      ${folders.length > 0 && html`<section class="section">
        <div class="section-head"><h2>폴더</h2></div>
        <div class="folder-grid">${folders.map((f) => {
          const notes = lib.inFolder(f.path).slice(0, 3);
          return html`<a class="fcard" key=${f.path} href=${folderHref(f.path)}>
            <div class="top"><span>${f.name}</span><span class="n">${f.count}</span></div>
            <ul>${notes.map((n) => html`<li key=${n.id}>${titleOf(n)}</li>`)}</ul>
          </a>`;
        })}</div>
      </section>`}
    </div>`;
}
