// 로그인, 인스타·북마크 가져오기, 공유 받기, 붙여넣기 (설정은 settings.js)
import { html, useState, useEffect } from '../h.js';
import { Icon, Logo, GoogleG } from '../icons.js';
import { app, useLib, toast } from '../state.js';
import { go, noteHref } from '../router.js';
import { PageBar } from '../parts/shell.js';
import { Empty } from '../parts/common.js';
import { capturePhotos } from '../capture.js';
import { saveQuick } from '../quick.js';
import { categoryOf, guessCategory } from '../categories.js';
import { parseBookmarks, isBookmarksFile } from '../../core/bookmarks.js';
import { parseInstagramFile, mergeSaved } from '../../core/instagram.js';

export const JSZIP = 'js/vendor/jszip.min.js';
export function loadScript(src) {
  if (window.JSZip) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('압축 도구를 불러오지 못했어요.'));
    document.head.append(s);
  });
}

export function Login({ onSignIn, busy, error }) {
  const configured = app.auth.configured;
  return html`<main class="login">
    <div class="login-card">
      <${Logo} size=${88} mood="wave" />
      <h1>넣기만 하세요.<br />정리는 서랍이.</h1>
      <p class="lead">무엇이든 넣으면 알아서 분류해드립니다.</p>
      <ul class="login-feats">
        <li><span class="gs-ic"><${Icon} name="plus" /></span><span>어디서든 넣기</span></li>
        <li><span class="gs-ic"><${Icon} name="sparkle" /></span><span>알아서 나누기</span></li>
        <li><span class="gs-ic"><${Icon} name="search" /></span><span>바로 다시 찾기</span></li>
      </ul>
      ${configured
        ? html`<button type="button" class="gbtn" onClick=${onSignIn} disabled=${busy}><${GoogleG} />${busy ? '연결하는 중' : 'Google로 계속하기'}</button>`
        : html`<div class="banner warn"><${Icon} name="alert" /><p>구글 로그인 설정이 아직 없어요. docs/설정가이드.md의 2단계를 마쳐 주세요.</p></div>`}
      ${error && html`<p class="fine" style="color:var(--danger)">${error}</p>`}
      <p class="fine">노트는 내 구글 드라이브의 「메모」 폴더에 저장돼요.<br />앱은 자기가 만든 파일에만 접근하고, 다른 파일은 볼 수 없어요.</p>
      <nav class="login-links" aria-label="약관"><a href="privacy.html">개인정보처리방침</a><a href="terms.html">서비스 약관</a></nav>
      <p class="fine">© ${new Date().getFullYear()} makerskim. All rights reserved.</p>
    </div>
  </main>`;
}


async function readExport(files) {
  const lists = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
      await loadScript(JSZIP);
      const zipFile = await window.JSZip.loadAsync(file);
      const entries = Object.values(zipFile.files).filter((f) => !f.dir && /saved/i.test(f.name) && /\.(json|html?)$/i.test(f.name));
      for (const e of entries) lists.push(parseInstagramFile(e.name, await e.async('string')));
    } else {
      lists.push(parseInstagramFile(file.name, await file.text()));
    }
  }
  return mergeSaved(lists);
}

export function Import() {
  const [items, setItems] = useState(null);
  const [over, setOver] = useState(false);
  const [prog, setProg] = useState(null);
  const [done, setDone] = useState(null);
  const read = async (files) => {
    setDone(null);
    try {
      const list = await readExport([...files]);
      if (!list.length) { toast('게시물 없음. 「저장됨」을 JSON으로 받았는지 확인하세요.', { duration: 6000 }); return; }
      setItems(list);
    } catch (e) { toast(e.message); }
  };
  const start = async () => {
    setProg(0);
    try {
      const r = await app.lib.importInstagram(items, (d, t) => setProg(Math.round((d / t) * 100)));
      setDone(r); setItems(null);
    } catch (e) { toast(`멈췄어요. ${e.message} 다시 올리면 이어서 만들어요.`, { duration: 6000 }); }
    setProg(null);
  };
  const reels = items?.filter((i) => i.kind === 'reel').length ?? 0;
  const cols = new Set(items?.map((i) => i.collection).filter(Boolean));
  return html`
    <${PageBar} title="인스타 가져오기" />
    <div class="page narrow">
      <div class="page-head"><h1>인스타 가져오기</h1>
        <p>「내 정보 다운로드」 파일을 올리면 저장한 게시물이 노트가 됩니다.</p></div>
      <ol class="steps">
        <li><span>인스타그램 앱에서 <b>설정 및 활동, 계정 센터, 내 정보 및 권한, 내 정보 다운로드</b>로 가요.</span></li>
        <li><span><b>일부 정보</b>를 고르고 <b>저장됨</b>만 체크해요. 형식은 <b>JSON</b>, 기간은 <b>전체 기간</b>이에요.</span></li>
        <li><span>준비됐다는 알림이 오면 받은 zip 파일을 아래에 올려요. 보통 몇 분에서 하루 걸려요.</span></li>
      </ol>
      ${!items && !done && html`<label class=${`dropzone${over ? ' over' : ''}`}
          onDragOver=${(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }} onDragLeave=${() => setOver(false)}
          onDrop=${(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); read(e.dataTransfer.files); }}>
        <${Icon} name="upload" /><b>zip 파일을 고르거나 끌어다 놓으세요</b><span>압축을 푼 saved_posts.json도 돼요</span>
        <input class="sr" type="file" accept=".zip,.json,.html,application/zip,application/json,text/html" multiple onChange=${(e) => read(e.target.files)} />
      </label>`}
      ${items && html`<div class="banner"><${Icon} name="instagram" /><p><b>${items.length}개</b>를 찾았어요. 릴스 ${reels}개, 컬렉션 ${cols.size}개.
          노트는 바로 만들어지고, Claude가 하루에 정해진 양씩 캡션을 읽어 정리해요.</p></div>
        ${prog !== null ? html`<div class="progress"><i style=${`width:${prog}%`}></i></div><p class="muted">${prog}% 만드는 중</p>`
          : html`<div class="row-ctl" style="display:flex;gap:8px"><button type="button" class="btn btn-primary btn-lg" onClick=${start}>노트 ${items.length}개 만들기</button><button type="button" class="btn btn-ghost btn-lg" onClick=${() => setItems(null)}>취소</button></div>`}`}
      ${done && html`<${Empty} icon="check" title=${`${done.made}개를 넣었어요`} text=${done.skipped ? `이미 있던 ${done.skipped}개는 건너뛰었어요.` : '캡션을 보고 서랍에 나눠 두었어요.'}>
        <button type="button" class="btn" onClick=${() => go('#/')}>서랍 보기</button></${Empty}>`}
    </div>`;
}

// 브라우저 북마크 가져오기: 크롬·사파리·엣지·파이어폭스의 bookmarks.html. 미리 어느 서랍으로 갈지 보여 주고 한 번에 넣는다
const EXPORT_HOW = [
  ['크롬', '북마크 관리자(Ctrl+Shift+O, 맥은 ⌘+Option+B) → 오른쪽 위 ⋮ → 북마크 내보내기'],
  ['엣지', '즐겨찾기(Ctrl+Shift+O) → ⋯ → 즐겨찾기 내보내기'],
  ['사파리 (맥)', '파일 → 내보내기 → 북마크'],
  ['파이어폭스', '북마크 관리(Ctrl+Shift+O) → 가져오기 및 백업 → HTML로 내보내기'],
];
export function Bookmarks() {
  const lib = useLib();
  const [items, setItems] = useState(null);
  const [prog, setProg] = useState(null);
  const [done, setDone] = useState(null);
  const [over, setOver] = useState(false);
  const read = async (files) => {
    const f = [...files][0];
    if (!f) return;
    const text = await f.text();
    if (!isBookmarksFile(text)) { toast('북마크 파일(.html)이 아닙니다.'); return; }
    const list = parseBookmarks(text);
    const have = new Set(lib.all.map((n) => n.meta.source).filter(Boolean));
    const fresh = list.filter((b) => !have.has(b.url));
    const groups = new Map();
    for (const b of fresh) {
      const tags = b.folder ? [b.folder.split('/').at(-1)] : [];
      const c = guessCategory({ type: 'bookmark', source: b.url, title: b.title, tags }, '', lib).category;
      groups.set(c, (groups.get(c) ?? 0) + 1);
    }
    setDone(null);
    setItems({ fresh, skipped: list.length - fresh.length, groups: [...groups].sort((a, b) => b[1] - a[1]) });
  };
  const start = async () => {
    const queue = [...items.fresh];
    let made = 0;
    setProg(0);
    const work = async () => {
      while (queue.length) {
        const b = queue.shift();
        try {
          await lib.addLink(b.url, '', b.title, { via: 'bookmarks', ...(b.folder ? { tags: [b.folder.split('/').at(-1)] } : {}), ...(b.added ? { date: b.added } : {}) });
          made++;
        } catch { /* 하나 실패해도 나머지는 계속 */ }
        setProg(Math.round(((items.fresh.length - queue.length) / items.fresh.length) * 100));
      }
    };
    await Promise.all([work(), work(), work()]);
    setProg(null);
    setDone({ made, skipped: items.skipped, failed: items.fresh.length - made });
    setItems(null);
  };
  return html`<${PageBar} title="북마크 가져오기" />
    <div class="page narrow">
      <div class="page-head"><h1>북마크 가져오기</h1>
        <p>브라우저에서 내보낸 bookmarks.html을 올리면 링크마다 분류해 넣습니다.</p></div>
      ${!items && prog === null && html`<label class=${`dropzone${over ? ' over' : ''}`}
          onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
          onDrop=${(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}>
        <${Icon} name="upload" /><b>bookmarks.html 올리기</b><span class="muted">파일은 이 기기에서만 읽습니다</span>
        <input class="sr" type="file" accept=".html,.htm,text/html" onChange=${(e) => read(e.target.files)} />
      </label>
      <section class="set-sec how"><div><h2>내보내는 법</h2><p class="desc">아이폰은 맥·PC에서 내보내세요.</p></div>
        <div class="ctl"><ol class="steps">${EXPORT_HOW.map(([b, how]) => html`<li key=${b}><span><b>${b}</b>: ${how}</span></li>`)}</ol></div></section>`}
      ${items && prog === null && html`<div class="banner"><${Icon} name="star" /><p><b>링크 ${items.fresh.length}개</b>를 찾았어요${items.skipped ? ` (이미 있는 ${items.skipped}개는 건너뜀)` : ''}. 이렇게 나눌게요:</p></div>
        <div class="preview-groups">${items.groups.map(([c, n]) => html`<span class="chip" key=${c}>${c}<span class="n">${n}</span></span>`)}</div>
        <div class="row-ctl" style="display:flex;gap:8px;margin-top:16px">
          <button type="button" class="btn btn-primary btn-lg" disabled=${!items.fresh.length} onClick=${start}>링크 ${items.fresh.length}개 넣기</button>
          <button type="button" class="btn btn-ghost btn-lg" onClick=${() => setItems(null)}>취소</button></div>`}
      ${prog !== null && html`<div class="progress"><i style=${`width:${prog}%`}></i></div><p class="muted">${prog}% 넣는 중. 이 화면을 닫지 마세요.</p>`}
      ${done && html`<${Empty} icon="check" mood="happy" title=${`링크 ${done.made}개를 넣었어요`} text=${[done.skipped && `이미 있던 ${done.skipped}개는 건너뛰었어요.`, done.failed && `${done.failed}개는 넣지 못했어요. 다시 올리면 빠진 것만 넣어요.`].filter(Boolean).join(' ') || '서랍에서 확인해 보세요.'}>
        <button type="button" class="btn btn-primary" onClick=${() => go('#/')}>서랍 보기</button></${Empty}>`}
    </div>`;
}

// 단축어 「메모로 보내기」가 여는 주소: ?text=... 또는 #/share?url=...&text=...
export function Share({ params }) {
  const [error, setError] = useState(null);
  useEffect(() => {
    const text = (params.get('text') ?? '').trim();
    const url = (params.get('url') ?? '').trim();
    const title = (params.get('title') ?? '').trim();
    const full = [url, text].filter(Boolean).join('\n').trim();
    if (!full) { go('#/paste', { replace: true }); return; }
    // 브라우저 단추·공유는 주소, 제목, 고른 글을 따로 보낸다
    const via = params.get('via') || 'phone';
    (url ? app.lib.addLink(url, text, title, { via }) : saveQuick(full, { via }))
      .then((n) => { toast(`${categoryOf(n, app.lib).name} 서랍에 넣었어요`); go(noteHref(n.id), { replace: true }); })
      .catch((e) => setError(e.message));
  }, []);
  return html`<${PageBar} title="받는 중" />
    <div class="page narrow">${error
      ? html`<${Empty} icon="alert" title="저장하지 못했어요" text=${error}><button type="button" class="btn" onClick=${() => go('#/')}>홈으로</button></${Empty}>`
      : html`<${Empty} icon="inbox" title="넣는 중" text="잠시만요." />`}</div>`;
}

// 단축어가 사진을 복사해 두고 여는 화면
export function Paste() {
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); capturePhotos(files).then((made) => made[0] && go(noteHref(made[0].id), { replace: true })); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
  const fromClipboard = async () => {
    try {
      const files = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) files.push(new File([await item.getType(type)], `paste.${type.split('/')[1]}`, { type }));
      }
      if (!files.length) { toast('복사해 둔 사진이 없어요.'); return; }
      const made = await capturePhotos(files);
      if (made[0]) go(noteHref(made[0].id), { replace: true });
    } catch { toast('붙여넣기를 허용하거나 길게 눌러 붙여 넣으세요.'); }
  };
  return html`<${PageBar} title="사진 붙여넣기" />
    <div class="page narrow">
      <${Empty} icon="paste" title="복사한 사진을 붙여 넣어요" text="버튼을 누르고, 아이폰이 묻는 '붙여넣기'를 한 번 더 누르면 저장돼요.">
        <button type="button" class="btn btn-primary btn-lg" onClick=${fromClipboard}><${Icon} name="paste" />붙여넣기</button>
      </${Empty}>
    </div>`;
}
