// 로그인, 인스타·북마크 가져오기, 공유 받기, 붙여넣기 (설정은 settings.js)
import { html, useState, useEffect } from '../h.js';
import { Icon, Logo, GoogleG } from '../icons.js';
import { app, useLib, toast } from '../state.js';
import { go, noteHref } from '../router.js';
import { PageBar } from '../parts/shell.js';
import { Empty } from '../parts/common.js';
import { capturePhotos } from '../capture.js';
import { saveQuick } from '../quick.js';
import { SHORTCUT_OOPS, SHARE_IMG, SHARE_IMG_LEN, imageFromBase64, photoTrouble } from '../../core/shortcut.js';
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

// 폰의 「공유」로 보낸 사진: 서비스 워커(sw.js)가 잠시 저장해 둔 것을 꺼내고 지운다
export async function takeShared(id) {
  if (!('caches' in window) || !/^[a-z0-9]+$/.test(id)) return null;
  const cache = await caches.open('td-share');
  const base = new URL(`__share/${id}/`, new URL('./', location.href)).href;
  const res = await cache.match(`${base}info`);
  if (!res) return null;
  const info = await res.json();
  const files = [];
  for (let i = 0; i < info.files; i++) {
    const r = await cache.match(`${base}${i}`);
    if (!r) continue;
    const blob = await r.blob();
    files.push(new File([blob], decodeURIComponent(r.headers.get('x-name') || `shared-${i}.jpg`), { type: blob.type || 'image/jpeg' }));
  }
  for (const k of await cache.keys()) if (k.url.startsWith(base)) await cache.delete(k);
  return { ...info, files };
}

// 공유로 받은 글·링크 저장 → 노트 (받기 화면, 붙여넣기 화면이 함께 쓴다)
// 안드로이드 공유는 주소를 글(text) 속에 넣고 페이지 제목(title)을 따로 보낸다: 제목을 살려 링크로 (분류에 큰 단서)
export function saveShared({ title = '', text = '', url = '' }, via = 'phone') {
  title = title.trim(); text = text.trim(); url = url.trim();
  // 글 속에 주소가 있으면 링크로: 주소를 꺼내고 나머지는 메모 (지도 앱 공유 「[네이버지도] 가게 이름 / 주소 / 링크」)
  if (!url) {
    const m = /https?:\/\/\S+/.exec(text);
    // 단축어가 여러 개(링크 + 웹 페이지)를 이어 보내면 같은 링크가 또 나온다: 한 번만 남긴다
    if (m) { url = m[0]; text = text.split(url).join(' ').replace(/[ \t]+/g, ' ').replace(/^\s+|\s+$/gm, '').trim(); }
    // 링크와 함께 온 글의 첫 줄이 짧으면 그게 무엇인지(상품·가게·글 이름)라 제목으로 (「[네이버 쇼핑] 린넨 셔츠」 같은 머리말은 뗀다)
    if (m && !title) {
      const lines = text.split('\n').map((l) => l.replace(/^\[[^\]]{1,15}\]\s*/, '').trim()).filter(Boolean);
      if (lines.length && lines[0].length <= 60) { title = lines[0]; text = lines.slice(1).join('\n'); } else text = lines.join('\n');
    }
  }
  if (text === title) text = '';
  // 제목 끝의 사이트 이름은 뗀다 (「… : 네이버 블로그」「… - YouTube」「… : 네이버쇼핑」)
  title = title.replace(/\s*[:|·\-–—]\s*(네이버\s?블로그|네이버\s?카페|네이버\s?포스트|네이버\s?쇼핑|스마트스토어|티스토리|브런치(스토리)?|YouTube|유튜브|Instagram|인스타그램)\s*$/i, '').trim();
  const full = [url, text].filter(Boolean).join('\n').trim();
  if (!full) return Promise.resolve(null);
  return url ? app.lib.addLink(url, text, title, { via }) : saveQuick(full, { via });
}
// 공유로 넣은 뒤: 그 노트를 열고 「저장한 이유」 칸으로 (넣으면서 한마디 적을 수 있게)
const askMemo = () => setTimeout(() => document.querySelector('.thought-note textarea')?.focus(), 450);
const opened = (n) => {
  toast(`${categoryOf(n, app.lib).name} 서랍에 넣었어요 · 「저장한 이유」에 메모를 적을 수 있어요`, { duration: 5000 });
  go(noteHref(n.id), { replace: true });
  askMemo();
};

// 단축어 「메모로 보내기」가 여는 주소: ?text=... 또는 #/share?url=...&text=...
// 안드로이드 공유(설치한 앱): 글·링크는 ?title=&text=&url=, 사진은 #/share?shared=번호
export function Share({ params }) {
  const [error, setError] = useState(null);
  useEffect(() => {
    const saveText = (got, via) => {
      const job = saveShared(got, via);
      job.then((n) => (n ? opened(n) : go('#/paste', { replace: true }))).catch((e) => setError(e.message));
    };
    // 단축어가 잘못 만들어졌을 때: 무엇을 고치면 되는지
    const oops = params.get('oops');
    if (oops) { setError(SHORTCUT_OOPS[oops] ?? SHORTCUT_OOPS.empty); return; }
    // 아이폰 「사진 보내기」: 주소에 실려 온 사진 (main.js 가 이 탭에 옮겨 둠)
    if (params.get('img')) {
      let raw = null;
      let arrived = 0;
      try { raw = sessionStorage.getItem(SHARE_IMG); arrived = Number(sessionStorage.getItem(SHARE_IMG_LEN)) || 0; sessionStorage.removeItem(SHARE_IMG); sessionStorage.removeItem(SHARE_IMG_LEN); } catch { /* 없음 */ }
      const got = raw ? imageFromBase64(raw) : null;
      // 받지 못했으면 실제로 받은 것(글자 수·앞부분)으로 고칠 곳을 알려 준다
      if (!got) { setError(photoTrouble(raw, arrived)); return; }
      capturePhotos([new File([got.bytes], `shared.${got.type.split('/')[1]}`, { type: got.type })]).then((made) => {
        if (!made[0]) { setError('사진을 넣지 못했어요.'); return; }
        go(noteHref(made[0].id), { replace: true });
        toast('「저장한 이유」에 메모를 적을 수 있어요', { duration: 5000 });
        askMemo();
      });
      return;
    }
    const shared = params.get('shared');
    if (!shared) {
      const get = (k) => params.get(k) ?? '';
      saveText({ title: get('title'), text: get('text'), url: get('url') }, params.get('via') || 'phone');
      return;
    }
    (async () => {
      const got = shared === 'fail' ? null : await takeShared(shared).catch(() => null);
      if (!got) { setError('공유한 내용을 받지 못했어요. 한 번 더 공유해 주세요.'); return; }
      if (!got.files.length) { saveText(got, 'phone'); return; }
      // 사진과 함께 온 글·주소는 첫 사진의 메모로
      const memo = [got.title, got.text, got.url].filter((x, i, a) => x && a.indexOf(x) === i).join('\n');
      const made = await capturePhotos(got.files, memo);
      if (made[0]) go(made.length === 1 ? noteHref(made[0].id) : '#/', { replace: true });
      else setError('사진을 넣지 못했어요.');
    })();
  }, []);
  return html`<${PageBar} title="받는 중" />
    <div class="page narrow">${error
      ? html`<${Empty} icon="alert" title="저장하지 못했어요" text=${error}>
          ${(params.get('oops') || params.get('img')) && html`<button type="button" class="btn btn-primary" onClick=${() => go('#/connect')}>단축어 만드는 법</button>`}
          <button type="button" class="btn" onClick=${() => go('#/')}>홈으로</button></${Empty}>`
      : html`<${Empty} icon="inbox" title="넣는 중" text="잠시만요." />`}</div>`;
}

// 아이폰 단축어 「사진 보내기」가 사진을 복사해 두고 여는 화면 (링크·글이 복사돼 있어도 넣는다).
// 사파리는 복사해 둔 것을 사이트가 혼자 읽지 못한다: 버튼을 누르면 그 위에 작은 「붙여넣기」가 뜨고, 그걸 눌러야 읽힌다.
export function Paste() {
  const save = async ({ files = [], text = '' }) => {
    if (files.length) {
      const made = await capturePhotos(files);
      if (made[0]) { go(made.length === 1 ? noteHref(made[0].id) : '#/', { replace: true }); if (made.length === 1) askMemo(); }
      return;
    }
    if (!text.trim()) { toast('복사해 둔 사진이 없어요. 한 번 더 공유해 주세요.'); return; }
    try { const n = await saveShared({ text }, 'phone'); if (n) opened(n); } catch (e) { toast(e.message); }
  };
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (files.length || text.trim()) { e.preventDefault(); save({ files, text }); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
  const fromClipboard = async () => {
    const files = [];
    let text = '';
    const hint = toast('바로 위에 뜬 「붙여넣기」를 눌러 주세요', { duration: 5000 });
    try {
      if (navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          const img = item.types.find((t) => t.startsWith('image/'));
          if (img) { files.push(new File([await item.getType(img)], `paste.${img.split('/')[1]}`, { type: img })); continue; }
          const tt = item.types.includes('text/plain') ? 'text/plain' : item.types.includes('text/uri-list') ? 'text/uri-list' : '';
          if (tt && !text) text = (await (await item.getType(tt)).text()).split('\n').filter((l) => !(tt === 'text/uri-list' && l.startsWith('#'))).join('\n');
        }
      } else {
        text = await navigator.clipboard.readText();
      }
    } catch { hint.update('버튼 위에 뜨는 「붙여넣기」를 눌러야 넣을 수 있어요.', { duration: 5000 }); return; }
    hint.close();
    await save({ files, text });
  };
  return html`<${PageBar} title="사진 붙여넣기" />
    <div class="page narrow">
      <${Empty} icon="paste" title="복사한 사진을 붙여 넣어요" text="버튼을 누르고, 바로 위에 뜨는 「붙여넣기」를 한 번 더 누르면 저장돼요.">
        <button type="button" class="btn btn-primary btn-lg" onClick=${fromClipboard}><${Icon} name="paste" />붙여넣기</button>
      </${Empty}>
    </div>`;
}
