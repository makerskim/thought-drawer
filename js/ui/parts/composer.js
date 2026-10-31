// 가운데 입력창: 어디서든 Enter를 누르면 화면 가운데에 뜬다.
// 적고 Enter면 넣고(서랍은 자동으로), Shift+Enter는 줄바꿈. 주소로 시작하면 링크, 여러 줄이면 첫 줄이 제목.
// 사진은 붙여 넣거나 끌어다 놓아도 된다.
import { html, useState, useRef, useLayoutEffect, autosize, cx } from '../h.js';
import { Icon, Mascot } from '../icons.js';
import { app, toast } from '../state.js';
import { go } from '../router.js';
import { openLayer } from './layers.js';
import { capturePhotos } from '../capture.js';
import { quickSave, kindOfText } from '../quick.js';
import { modKey } from '../format.js';

const HINT = {
  empty: ['memo', '메모, 링크, 할 일'],
  memo: ['memo', '메모로 저장'],
  titled: ['memo', '첫 줄이 제목'],
  link: ['link', '링크로 저장'],
  instagram: ['instagram', '인스타 게시물로 저장'],
};

let draft = ''; // 넣지 않고 닫으면 다음에 열 때 이어서 쓴다

function Composer({ close, initial = '' }) {
  const ref = useRef();
  const [text, setText] = useState(initial || draft);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  useLayoutEffect(() => autosize(ref.current), [text]);
  // 열리자마자 친 글자가 빠지지 않게 그리는 즉시 커서를 둔다
  useLayoutEffect(() => {
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const k = kindOfText(text);
  const [icon, hint] = HINT[k.kind];
  const save = async (open = false) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await quickSave(text, { open }); draft = ''; setText(''); close(); } catch (e) { toast(e.message); setBusy(false); }
  };
  const photos = (files) => { draft = ''; close(); capturePhotos(files, text); };
  const bigNote = () => {
    const [first, ...rest] = text.split('\n');
    draft = '';
    close();
    go(`#/new${first.trim() ? `?title=${encodeURIComponent(first.trim())}` : ''}`);
    if (rest.join('\n').trim()) toast('나머지는 본문에 붙여 넣으세요');
  };
  const onKeyDown = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(e.metaKey || e.ctrlKey); }
  };
  const mood = busy ? 'happy' : k.kind === 'link' || k.kind === 'instagram' ? 'wow' : text.trim() ? 'think' : 'smile';

  return html`<div class=${cx('composer', drag && 'drag')} role="dialog" aria-modal="true" aria-labelledby="composer-title"
      onDragOver=${(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
      onDragLeave=${() => setDrag(false)}
      onDrop=${(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); photos([...e.dataTransfer.files]); }}>
    <div class="peek" aria-hidden="true"><${Mascot} size=${76} mood=${mood} /></div>
    <div class="composer-head">
      <h2 id="composer-title">넣기</h2>
      <button type="button" class="icon-btn" aria-label="닫기" title="닫기 (Esc)" onClick=${close}><${Icon} name="x" /></button>
    </div>
    <textarea ref=${ref} rows="3" value=${text} aria-label="넣을 내용" enterkeyhint="send"
      placeholder="메모, 링크, 할 일"
      onInput=${(e) => { draft = e.target.value; setText(draft); }} onKeyDown=${onKeyDown}
      onPaste=${(e) => {
        const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) { e.preventDefault(); e.stopPropagation(); photos(files); }
      }}></textarea>
    <p class=${cx('composer-hint', `h-${k.kind}`)}><${Icon} name=${icon} /><span>${hint}${k.host ? html` <b>${k.host}</b>` : ''}${k.title ? html` <b>${k.title}</b>` : ''}</span></p>
    <div class="composer-foot">
      <button type="button" class="btn btn-ghost" onClick=${() => { draft = ''; close(); app.pickPhotos(text); }}><${Icon} name="capture" />사진</button>
      <button type="button" class="btn btn-ghost hide-m" onClick=${bigNote} title="편집기에서 길게 쓰기"><${Icon} name="pen" />크게 쓰기</button>
      <span class="grow"></span>
      <span class="keys hide-m"><kbd>Shift</kbd><kbd>Enter</kbd> 줄바꿈 <kbd>${modKey}</kbd><kbd>Enter</kbd> 넣고 열기</span>
      <button type="button" class="btn btn-primary" disabled=${busy || !text.trim()} onClick=${() => save()}>넣기<kbd class="hide-m">Enter</kbd></button>
    </div>
  </div>`;
}

let closeOpen = null;
export function openComposer(initial = '') {
  if (closeOpen) return;
  closeOpen = openLayer((close) => html`<${Composer} close=${close} initial=${initial} />`, {
    kind: 'modal', cls: 'composer-overlay', onClose: () => { closeOpen = null; },
  });
}
