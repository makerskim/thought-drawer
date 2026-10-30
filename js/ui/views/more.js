// 로그인, 설정, 인스타 가져오기, 공유 받기, 붙여넣기
import { html, useState, useEffect } from '../h.js';
import { Icon, Logo, GoogleG } from '../icons.js';
import { app, useLib, usePref, applyAppearance, toast } from '../state.js';
import { go, noteHref } from '../router.js';
import { PageBar } from '../parts/shell.js';
import { Empty } from '../parts/common.js';
import { modal } from '../parts/layers.js';
import { ConfirmDialog } from '../parts/dialogs.js';
import { capturePhotos } from '../capture.js';
import { saveQuick } from '../quick.js';
import { parseInstagramFile, mergeSaved, isInstagramUrl } from '../../core/instagram.js';
import { convertForExport } from '../../core/export.js';
import { ATTACH_DIR } from '../../config.js';
import { relTime } from '../format.js';

const JSZIP = 'js/vendor/jszip.min.js';
function loadScript(src) {
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
      <${Logo} size=${104} mood="wave" />
      <h1>Thought Drawer</h1>
      <p class="lead">떠오른 생각, 캡처, 링크, 인스타 저장을 한 서랍에 넣어 두면<br />Claude가 정리해서 다시 찾기 쉽게 해 줘요.</p>
      <ol class="login-feats">
        <li><span class="gs-ic g1"><${Icon} name="plus" /></span><span>무엇이든 넣으면 인박스에 모여요</span></li>
        <li><span class="gs-ic g2"><${Icon} name="sparkle" /></span><span>Claude가 제목, 요약, 태그를 달아 폴더로 옮겨요</span></li>
        <li><span class="gs-ic g3"><${Icon} name="search" /></span><span>찾거나 물어보면 바로 다시 꺼내 줘요</span></li>
      </ol>
      ${configured
        ? html`<button type="button" class="gbtn" onClick=${onSignIn} disabled=${busy}><${GoogleG} />${busy ? '연결하는 중' : 'Google로 계속하기'}</button>`
        : html`<div class="banner warn"><${Icon} name="alert" /><p>구글 로그인 설정이 아직 없어요. docs/설정가이드.md의 2단계를 마쳐 주세요.</p></div>`}
      ${error && html`<p class="fine" style="color:var(--danger)">${error}</p>`}
      <p class="fine">노트는 내 구글 드라이브의 「메모」 폴더에 저장돼요.<br />앱은 자기가 만든 파일에만 접근하고, 다른 파일은 볼 수 없어요.</p>
      <nav class="login-links" aria-label="약관"><a href="privacy.html">개인정보처리방침</a><a href="terms.html">서비스 약관</a></nav>
    </div>
  </main>`;
}

const PALETTES = [['', '초록'], ['blue', '파랑'], ['grape', '보라'], ['ink', '먹']];

function Section({ title, desc, children }) {
  return html`<section class="set-sec"><div><h2>${title}</h2>${desc && html`<p class="desc">${desc}</p>`}</div><div class="ctl">${children}</div></section>`;
}

export function Settings({ offline }) {
  const lib = useLib();
  const [theme, setTheme] = usePref('theme', '');
  const [font, setFont] = usePref('font', '');
  const [palette, setPalette] = usePref('palette', '');
  const [secret, setSecret] = useState('');
  const [zip, setZip] = useState(null);
  const [token, setToken] = useState(offline);
  const p = app.profile ?? {};
  const shareUrl = `${location.origin}${location.pathname}?text=`;
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what}을 복사했어요.`); } catch { toast('복사하지 못했어요. 직접 선택해서 복사해 주세요.'); } };
  const exportZip = async () => {
    setZip(0);
    try {
      await loadScript(JSZIP);
      const { notes, attachments } = await lib.exportFiles((d, t) => setZip(Math.round((d / t) * 80)));
      const z = new window.JSZip();
      for (const f of convertForExport(notes, ATTACH_DIR)) z.file(`Thought Drawer/${f.path}`, f.text);
      let i = 0;
      for (const a of attachments) {
        try { z.file(`Thought Drawer/${ATTACH_DIR}/${a.name}`, await a.load()); } catch { /* 빠진 사진은 건너뜀 */ }
        setZip(80 + Math.round((++i / Math.max(1, attachments.length)) * 20));
      }
      const blob = await z.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `thought-drawer-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`노트 ${notes.length}개를 zip으로 담았어요.`);
    } catch (e) { toast(e.message); }
    setZip(null);
  };
  const seg = (value, set, opts) => html`<div class="seg" role="group">${opts.map(([v, l]) => html`<button type="button" key=${v} aria-pressed=${value === v} onClick=${() => { set(v); applyAppearance(); }}>${l}</button>`)}</div>`;
  return html`
    <${PageBar} title="설정" />
    <div class="page narrow">
      <div class="page-head"><h1>설정</h1></div>
      <${Section} title="계정" desc="노트는 이 구글 계정의 드라이브 「메모」 폴더에 있어요.">
        <div class="profile">${p.picture ? html`<img src=${p.picture} alt="" referrerpolicy="no-referrer" />` : html`<span class="avatar">${(p.name || p.email || '?')[0]}</span>`}
          <div><b>${p.name}</b><div class="muted">${p.email}</div></div></div>
        <div class="row-ctl">
          <button type="button" class="btn" onClick=${() => modal((close) => html`<${ConfirmDialog} close=${close} title="로그아웃할까요?" text="이 기기에 저장해 둔 노트 사본도 지워요. 드라이브의 노트는 그대로예요." yes="로그아웃" danger onYes=${() => app.signOut()} />`)}><${Icon} name="logout" />로그아웃</button>
          <button type="button" class="btn btn-ghost" onClick=${async () => { await lib.clearCache(); toast('이 기기의 사본을 지웠어요. 다시 맞추는 중이에요.'); app.resync(); }}><${Icon} name="refresh" />드라이브와 다시 맞추기</button>
        </div>
      </${Section}>
      <${Section} title="화면" desc="이 기기에만 적용돼요.">
        <div class="row-ctl"><span class="muted" style="width:64px">색</span>
          <div class="palettes" role="radiogroup" aria-label="색">${PALETTES.map(([v, label]) => html`<button type="button" key=${v} role="radio" aria-checked=${palette === v || (!v && !PALETTES.some(([x]) => x === palette))} class=${`swatch p-${v || 'green'}`} onClick=${() => { setPalette(v); applyAppearance(); }}><span class="dot"></span><span>${label}</span></button>`)}</div></div>
        <div class="row-ctl"><span class="muted" style="width:64px">밝기</span>${seg(theme, setTheme, [['', '기기 따라'], ['light', '낮'], ['dark', '밤']])}</div>
        <div class="row-ctl"><span class="muted" style="width:64px">노트 글꼴</span>${seg(font, setFont, [['', '기본'], ['round', '동글'], ['serif', '명조'], ['mono', '고정폭']])}</div>
      </${Section}>
      <${Section} title="자동 정리" desc="Claude Code 예약 작업이 하루 몇 번 인박스의 새 노트만 읽고 정리해요. 지금 쓰는 Claude 구독으로 돌아서 추가 비용이 없어요.">
        <div class="kv"><div><b>${lib.inbox().length}</b><span>인박스</span></div><div><b>${lib.organized().length}</b><span>정리된 노트</span></div><div><b>${lib.index?.generatedAt ? relTime(lib.index.generatedAt) : '아직'}</b><span>마지막 정리</span></div></div>
        ${token?.refreshToken && html`<div class="banner"><${Icon} name="check" /><p><b>정리기용 토큰을 받았어요.</b> 복사해서 Claude Code 환경 설정의 TD_GOOGLE_REFRESH_TOKEN에 넣으세요. 이 화면을 벗어나면 다시 볼 수 없어요. 채팅창에는 붙여 넣지 마세요.</p></div>
          <div class="code-box"><input class="input mono" readonly value=${token.refreshToken} onFocus=${(e) => e.target.select()} aria-label="정리기용 토큰" /><button type="button" class="btn" onClick=${() => copy(token.refreshToken, '토큰')}><${Icon} name="copy" />복사</button></div>`}
        ${token?.error && html`<div class="banner warn"><${Icon} name="alert" /><p>${token.error}</p><button type="button" class="btn btn-ghost" onClick=${() => setToken(null)}>닫기</button></div>`}
        <form class="field" style="margin:0" onSubmit=${(e) => { e.preventDefault(); if (!secret.trim()) { toast('클라이언트 보안 비밀을 넣어 주세요.'); return; } app.auth.requestOfflineCode(secret.trim()); }}>
          <span>정리기 연결 (처음 한 번)</span>
          <div class="code-box"><input class="input" type="password" autocomplete="off" value=${secret} onInput=${(e) => setSecret(e.target.value)} placeholder="구글 클라우드의 클라이언트 보안 비밀" aria-label="클라이언트 보안 비밀" /><button class="btn">토큰 받기</button></div>
          <small>보안 비밀은 이 브라우저에서 구글로만 보내고 저장하지 않아요. 순서는 docs/설정가이드.md 4단계에 있어요.</small>
        </form>
      </${Section}>
      <${Section} title="아이폰 공유" desc="단축어 「메모로 보내기」가 여는 주소예요. 공유한 내용을 이 주소 뒤에 붙여 열면 인박스에 저장돼요.">
        <div class="code-box"><input class="input mono" readonly value=${shareUrl} onFocus=${(e) => e.target.select()} aria-label="공유 주소" /><button type="button" class="btn" onClick=${() => copy(shareUrl, '주소')}><${Icon} name="copy" />복사</button></div>
        <small class="muted">홈 화면에 추가: 사파리에서 이 앱을 열고 공유 버튼, 홈 화면에 추가. 만드는 순서는 docs/단축어.md에 있어요.</small>
      </${Section}>
      <${Section} title="내보내기" desc="옵시디언은 드라이브 「메모」 폴더를 PC에 동기화한 뒤 보관함으로 열면 그대로 보여요.">
        <div class="row-ctl"><button type="button" class="btn" onClick=${exportZip} disabled=${zip !== null}><${Icon} name="download" />노션용 zip 받기</button></div>
        ${zip !== null && html`<div class="progress"><i style=${`width:${zip}%`}></i></div>`}
        <small class="muted">노션의 가져오기, 텍스트와 마크다운에 zip을 올려요. 링크와 사진 경로를 노션이 읽는 형식으로 바꿔서 담아요.</small>
      </${Section}>
      <${Section} title="정보">
        <div class="row-ctl"><a class="btn btn-ghost" href="privacy.html">개인정보처리방침</a><a class="btn btn-ghost" href="terms.html">서비스 약관</a></div>
      </${Section}>
    </div>`;
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
      if (!list.length) { toast('저장한 게시물을 찾지 못했어요. "저장됨"을 JSON 형식으로 받았는지 확인해 주세요.', { duration: 6000 }); return; }
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
      <div class="page-head"><h1>인스타 저장함 가져오기</h1>
        <p>비밀번호는 필요 없어요. 인스타그램이 주는 내 정보 파일을 올리면 저장한 게시물과 릴스가 노트가 돼요.</p></div>
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
      ${done && html`<${Empty} icon="check" title=${`${done.made}개를 인박스에 넣었어요`} text=${done.skipped ? `이미 있던 ${done.skipped}개는 건너뛰었어요.` : '다음 정리 때부터 폴더로 나뉘어요.'}>
        <button type="button" class="btn" onClick=${() => go('#/inbox')}>인박스 보기</button></${Empty}>`}
    </div>`;
}

// 단축어 「메모로 보내기」가 여는 주소: ?text=... 또는 #/share?url=...&text=...
export function Share({ params }) {
  const [error, setError] = useState(null);
  useEffect(() => {
    const text = (params.get('text') ?? '').trim();
    const url = (params.get('url') ?? '').trim();
    const full = [url, text].filter(Boolean).join('\n').trim();
    if (!full) { go('#/paste', { replace: true }); return; }
    saveQuick(full, { via: 'phone' })
      .then((n) => { toast(isInstagramUrl(full) ? '인스타 게시물을 인박스에 넣었어요.' : '인박스에 저장했어요.'); go(noteHref(n.id), { replace: true }); })
      .catch((e) => setError(e.message));
  }, []);
  return html`<${PageBar} title="받는 중" />
    <div class="page narrow">${error
      ? html`<${Empty} icon="alert" title="저장하지 못했어요" text=${error}><button type="button" class="btn" onClick=${() => go('#/')}>홈으로</button></${Empty}>`
      : html`<${Empty} icon="inbox" title="인박스에 넣는 중" text="잠시만요." />`}</div>`;
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
    } catch { toast('붙여넣기를 허용해 주세요. 또는 길게 눌러 붙여넣기를 골라요.'); }
  };
  return html`<${PageBar} title="사진 붙여넣기" />
    <div class="page narrow">
      <${Empty} icon="paste" title="복사한 사진을 붙여 넣어요" text="버튼을 누르고, 아이폰이 묻는 '붙여넣기'를 한 번 더 누르면 인박스에 저장돼요.">
        <button type="button" class="btn btn-primary btn-lg" onClick=${fromClipboard}><${Icon} name="paste" />붙여넣기</button>
      </${Empty}>
    </div>`;
}
