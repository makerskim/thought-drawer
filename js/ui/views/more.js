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
import { categoryOf, guessCategory, settingsOf, drawerTargets } from '../categories.js';
import { normalizeSettings } from '../../core/settings.js';
import { BUILTINS, VARS, keyOk } from '../../core/slash.js';
import { SORTS } from '../../core/filter.js';
import { preview, GuessLine } from '../parts/guess.js';
import { CommandTable, SHORTCUTS, Keys } from './help.js';
import { parseBookmarks, isBookmarksFile } from '../../core/bookmarks.js';
import { parseInstagramFile, mergeSaved } from '../../core/instagram.js';
import { convertForExport } from '../../core/export.js';
import { ATTACH_DIR } from '../../config.js';
import { relTime, modKey } from '../format.js';

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
    </div>
  </main>`;
}


function Section({ id, title, desc, children }) {
  return html`<section class="set-sec" id=${id ? `s-${id}` : undefined}><div><h2>${title}</h2>${desc && html`<p class="desc">${desc}</p>`}</div><div class="ctl">${children}</div></section>`;
}

function Switch({ label, desc, checked, onChange }) {
  return html`<label class="sw-row"><span class="sw-text"><b>${label}</b>${desc && html`<small>${desc}</small>`}</span>
    <input type="checkbox" role="switch" class="switch" checked=${checked} onChange=${(e) => onChange(e.target.checked)} /></label>`;
}

const seg = (value, set, opts, label) => html`<div class="seg" role="group" aria-label=${label}>${opts.map(([v, l]) => html`<button type="button" key=${String(v)} aria-pressed=${value === v} onClick=${() => { set(v); applyAppearance(); }}>${l}</button>`)}</div>`;
const Line = ({ label, children }) => html`<div class="row-ctl"><span class="muted set-label">${label}</span>${children}</div>`;

// 함께 쓰는 설정(드라이브) 저장
function useShared(lib) {
  const [state, setState] = useState('');
  const s = settingsOf(lib);
  const save = async (patch) => {
    setState('saving');
    try { await lib.saveSettings(normalizeSettings({ ...s, ...patch })); setState('saved'); } catch (e) { setState('error'); toast(e.message); }
  };
  return [s, save, state];
}
const SAVED = { saving: '저장 중', saved: '드라이브에 저장됨', error: '저장 실패' };

function RuleTester() {
  const lib = useLib();
  const [t, setT] = useState('');
  const pre = t.trim() ? preview(t, lib) : null;
  return html`<div class="field" style="margin:0"><span>시험해 보기</span>
    <input class="input" value=${t} onInput=${(e) => setT(e.target.value)} placeholder="예: 다이슨 청소기 최저가 https://www.coupang.com/…" aria-label="분류 시험 글" />
    ${pre ? html`<${GuessLine} pre=${pre} />` : html`<small>적으면 어느 서랍·태그로 갈지 보여 줍니다.</small>`}</div>`;
}

function RulesEditor() {
  const lib = useLib();
  const [s, save, state] = useShared(lib);
  const [form, setForm] = useState({ match: '', drawer: '', tags: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const add = (e) => {
    e.preventDefault();
    if (!form.match.trim()) { toast('낱말이나 사이트를 적으세요'); return; }
    if (!form.drawer.trim() && !form.tags.trim()) { toast('서랍이나 태그 중 하나는 정하세요'); return; }
    const rule = { match: form.match, drawer: form.drawer.replace(/\s*›\s*/g, '/'), tags: form.tags };
    save({ rules: [...s.rules.filter((r) => r.match !== form.match.trim()), rule] });
    setForm({ match: '', drawer: '', tags: '' });
  };
  const targets = drawerTargets(lib);
  return html`
    ${s.rules.length > 0
      ? html`<ul class="rule-list">${s.rules.map((r, i) => html`<li key=${`${r.match}:${i}`}>
          <span class="rl-match">${r.match}</span><${Icon} name="chevron" />
          <span class="rl-to">${r.drawer && html`<b>${r.drawer.replace('/', ' › ')}</b>`}${r.tags.map((t) => html`<span class="cap-tag" key=${t}>#${t}</span>`)}</span>
          <span class="grow"></span>
          <button type="button" class="btn btn-ghost btn-sm" onClick=${() => setForm({ match: r.match, drawer: r.drawer, tags: r.tags.join(', ') })}>고치기</button>
          <button type="button" class="icon-btn" aria-label=${`${r.match} 규칙 지우기`} onClick=${() => save({ rules: s.rules.filter((_, j) => j !== i) })}><${Icon} name="trash" /></button>
        </li>`)}</ul>`
      : html`<p class="muted small">아직 규칙이 없습니다.</p>`}
    <form class="rule-form" onSubmit=${add}>
      <label><span>낱말·사이트</span><input class="input" value=${form.match} onInput=${set('match')} placeholder="가습기, 제습기 또는 musinsa.com" aria-label="낱말 또는 사이트" /></label>
      <label><span>서랍</span><input class="input" list="rule-drawers" value=${form.drawer} onInput=${set('drawer')} placeholder="쇼핑/가전" aria-label="서랍" /></label>
      <label><span>태그</span><input class="input" value=${form.tags} onInput=${set('tags')} placeholder="가전, 계절" aria-label="태그" /></label>
      <button class="btn btn-primary"><${Icon} name="plus" />규칙 추가</button>
      <datalist id="rule-drawers">${targets.map((d) => html`<option key=${d} value=${d} />`)}</datalist>
    </form>
    ${state && html`<small class="muted">${SAVED[state]}</small>`}
    <${RuleTester} />`;
}

function KeywordsEditor() {
  const lib = useLib();
  const [s, save, state] = useShared(lib);
  const [form, setForm] = useState({ key: '', text: '' });
  const add = (e) => {
    e.preventDefault();
    const key = form.key.trim().replace(/^\//, '');
    if (!keyOk(key)) { toast('키워드는 띄어쓰기 없이 16자까지'); return; }
    if (!form.text.trim()) { toast('넣을 글을 적으세요'); return; }
    save({ keywords: [...s.keywords.filter((k) => k.key !== key), { key, text: form.text }] });
    setForm({ key: '', text: '' });
  };
  return html`
    ${s.keywords.length > 0
      ? html`<ul class="rule-list">${s.keywords.map((k) => html`<li key=${k.key}>
          <code class="rl-key">/${k.key}</code><span class="rl-text">${k.text.replace(/\n/g, ' ⏎ ')}</span>
          <span class="grow"></span>
          <button type="button" class="btn btn-ghost btn-sm" onClick=${() => setForm({ key: k.key, text: k.text })}>고치기</button>
          <button type="button" class="icon-btn" aria-label=${`/${k.key} 지우기`} onClick=${() => save({ keywords: s.keywords.filter((x) => x.key !== k.key) })}><${Icon} name="trash" /></button>
        </li>`)}</ul>`
      : html`<p class="muted small">내 키워드가 없습니다.</p>`}
    <form class="kw-form" onSubmit=${add}>
      <label><span>키워드</span><div class="kw-key"><span>/</span><input class="input" value=${form.key} onInput=${(e) => setForm({ ...form, key: e.target.value })} placeholder="회의" aria-label="키워드" /></div></label>
      <label><span>넣을 글</span><textarea class="input" rows="3" value=${form.text} onInput=${(e) => setForm({ ...form, text: e.target.value })} placeholder=${'회의 {오늘}\n- [ ] '} aria-label="넣을 글"></textarea></label>
      <small class="muted">${VARS.map(([v]) => v).join(' ')} 은 그때 날짜·시각으로. #태그, @서랍 도 됩니다.</small>
      <div><button class="btn btn-primary"><${Icon} name="plus" />키워드 저장</button></div>
    </form>
    ${state && html`<small class="muted">${SAVED[state]}</small>`}
    <details class="help-tree"><summary>기본 명령어 ${BUILTINS.length}개</summary><${CommandTable} lib=${lib} /></details>`;
}

const TOC = [['account', '계정'], ['screen', '화면'], ['input', '넣기'], ['classify', '자동 분류'], ['rules', '분류 규칙'], ['keywords', '/ 명령어'], ['claude', 'Claude'], ['share', '공유·내보내기'], ['keys', '단축키']];

export function Settings({ offline, params }) {
  const lib = useLib();
  const [theme, setTheme] = usePref('theme', '');
  const [font, setFont] = usePref('font', '');
  const [view, setView] = usePref('view', 'wall');
  const [sort, setSort] = usePref('sort', 'new');
  const [navPinned, setNavPinned] = usePref('navPinned', false);
  const [navSide, setNavSide] = usePref('navSide', 'left');
  const [talk, setTalk] = usePref('mascotTalk', 'on');
  const [openAfter, setOpenAfter] = usePref('openAfterSave', false);
  const [firstTitle, setFirstTitle] = usePref('firstLineTitle', true);
  const [shared, save, savedState] = useShared(lib);
  const [secret, setSecret] = useState('');
  const [zip, setZip] = useState(null);
  const [token, setToken] = useState(offline);
  const p = app.profile ?? {};
  const shareUrl = `${location.origin}${location.pathname}?text=`;
  useEffect(() => {
    const id = params?.get('s');
    if (id) setTimeout(() => document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [params?.get('s')]);
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what}을 복사했어요.`); } catch { toast('복사 실패. 직접 선택해 복사하세요.'); } };
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
  const cls = shared.classify;
  return html`
    <${PageBar} title="설정" />
    <div class="page narrow set-page">
      <div class="page-head"><h1>설정</h1></div>
      <nav class="set-toc" aria-label="설정 목차">${TOC.map(([id, l]) => html`<a key=${id} class="chip" href=${`#/settings?s=${id}`}>${l}</a>`)}</nav>
      <${Section} id="account" title="계정" desc="구글 드라이브 「메모」 폴더">
        <div class="profile">${p.picture ? html`<img src=${p.picture} alt="" referrerpolicy="no-referrer" />` : html`<span class="avatar">${(p.name || p.email || '?')[0]}</span>`}
          <div><b>${p.name}</b><div class="muted">${p.email}</div></div></div>
        <div class="row-ctl">
          <button type="button" class="btn" onClick=${() => modal((close) => html`<${ConfirmDialog} close=${close} title="로그아웃할까요?" text="이 기기에 저장해 둔 노트 사본도 지워요. 드라이브의 노트는 그대로예요." yes="로그아웃" danger onYes=${() => app.signOut()} />`)}><${Icon} name="logout" />로그아웃</button>
          <button type="button" class="btn btn-ghost" onClick=${async () => { await lib.clearCache(); toast('기기 사본을 지우고 다시 맞추는 중'); app.resync(); }}><${Icon} name="refresh" />드라이브와 다시 맞추기</button>
        </div>
      </${Section}>
      <${Section} id="screen" title="화면" desc="이 기기에만 적용">
        <${Line} label="밝기">${seg(theme, setTheme, [['', '기기 따라'], ['light', '낮'], ['dark', '밤']], '밝기')}</${Line}>
        <${Line} label="노트 글꼴">${seg(font, setFont, [['', '기본'], ['serif', '명조'], ['mono', '고정폭']], '노트 글꼴')}</${Line}>
        <${Line} label="카드 보기">${seg(view, setView, [['wall', '포스터'], ['list', '목록']], '카드 보기')}</${Line}>
        <${Line} label="정렬">${seg(sort, setSort, SORTS.map(([k, l]) => [k, l.replace('최근 ', '')]), '정렬')}</${Line}>
        <${Line} label="옆 메뉴">${seg(navPinned, setNavPinned, [[false, '열 때만'], [true, '고정']], '옆 메뉴')}${seg(navSide, setNavSide, [['left', '왼쪽'], ['right', '오른쪽']], '옆 메뉴 위치')}</${Line}>
        <${Line} label="서랍이">${seg(talk, setTalk, [['on', '말 많이'], ['quiet', '필요할 때만'], ['off', '말 안 함']], '서랍이 말풍선')}</${Line}>
      </${Section}>
      <${Section} id="input" title="넣기" desc="이 기기에만 적용">
        <${Switch} label="넣고 바로 열기" desc="끄면 넣고 첫 화면에 그대로. ${modKey} Enter는 언제나 열기." checked=${openAfter} onChange=${setOpenAfter} />
        <${Switch} label="여러 줄이면 첫 줄을 제목으로" checked=${firstTitle} onChange=${setFirstTitle} />
      </${Section}>
      <${Section} id="classify" title="자동 분류" desc="넣는 즉시 서랍 › 세부 서랍과 태그를 정합니다. 기기 안에서 계산해서 비용이 없습니다. 모든 기기에 함께 적용.">
        <div class="kv">
          <div><b>${lib.all.length}</b><span>모든 노트</span></div>
          <div><b>${lib.organized().length}</b><span>서랍 폴더에 정리됨</span></div>
          <div><b>${lib.inbox().length}</b><span>자동 분류만 됨</span></div>
        </div>
        <small class="muted">정리됨: 직접 옮기거나 Claude가 폴더에 넣은 노트. 자동 분류만 됨: 화면에서만 나눈 노트(드라이브에서는 00_인박스).</small>
        <${Switch} label="세부 서랍까지 나누기" desc="예: 쇼핑 › 가전, 여행 › 숙소" checked=${cls.subs} onChange=${(v) => save({ classify: { ...cls, subs: v } })} />
        <${Switch} label="직접 옮긴 노트에서 배우기" desc="서랍을 바꿀수록 더 잘 맞습니다." checked=${cls.learn} onChange=${(v) => save({ classify: { ...cls, learn: v } })} />
        <${Line} label="자동 태그">${seg(cls.tags, (v) => save({ classify: { ...cls, tags: v } }), [[0, '끔'], [2, '2개'], [3, '3개'], [4, '4개'], [6, '6개']], '자동 태그 수')}</${Line}>
        ${savedState && html`<small class="muted">${SAVED[savedState]}</small>`}
      </${Section}>
      <${Section} id="rules" title="분류 규칙" desc="이 낱말이나 사이트가 나오면 이 서랍, 이 태그. 자동 분류보다 먼저 적용됩니다.">
        <${RulesEditor} />
      </${Section}>
      <${Section} id="keywords" title="/ 명령어" desc="입력칸과 노트에서 / 다음에 키워드를 적으면 정해 둔 글이 들어갑니다. 모든 기기에 함께 적용.">
        <${KeywordsEditor} />
      </${Section}>
      <${Section} id="claude" title="Claude로 더 다듬기 (선택)" desc="예약 작업이 제목, 요약, 태그, 연결을 붙입니다. 추가 비용 없음.">
        <div class="kv"><div><b>${lib.index?.generatedAt ? relTime(lib.index.generatedAt) : '아직 안 켬'}</b><span>마지막으로 다듬은 때</span></div></div>
        ${token?.refreshToken && html`<div class="banner"><${Icon} name="check" /><p><b>정리기용 토큰을 받았어요.</b> 복사해서 Claude Code 환경 설정의 TD_GOOGLE_REFRESH_TOKEN에 넣으세요. 이 화면을 벗어나면 다시 볼 수 없어요. 채팅창에는 붙여 넣지 마세요.</p></div>
          <div class="code-box"><input class="input mono" readonly value=${token.refreshToken} onFocus=${(e) => e.target.select()} aria-label="정리기용 토큰" /><button type="button" class="btn" onClick=${() => copy(token.refreshToken, '토큰')}><${Icon} name="copy" />복사</button></div>`}
        ${token?.error && html`<div class="banner warn"><${Icon} name="alert" /><p>${token.error}</p><button type="button" class="btn btn-ghost" onClick=${() => setToken(null)}>닫기</button></div>`}
        <form class="field" style="margin:0" onSubmit=${(e) => { e.preventDefault(); if (!secret.trim()) { toast('클라이언트 보안 비밀을 넣어 주세요.'); return; } app.auth.requestOfflineCode(secret.trim()); }}>
          <span>정리기 연결 (처음 한 번)</span>
          <div class="code-box"><input class="input" type="password" autocomplete="off" value=${secret} onInput=${(e) => setSecret(e.target.value)} placeholder="구글 클라우드의 클라이언트 보안 비밀" aria-label="클라이언트 보안 비밀" /><button class="btn">토큰 받기</button></div>
          <small>보안 비밀은 이 브라우저에서 구글로만 보내고 저장하지 않아요. 순서는 docs/설정가이드.md 4단계에 있어요.</small>
        </form>
      </${Section}>
      <${Section} id="share" title="공유·내보내기" desc="아이폰 단축어 주소와 노션용 zip. 옵시디언은 「메모」 폴더를 보관함으로 열면 됩니다.">
        <div class="field" style="margin:0"><span>아이폰 공유 주소</span>
          <div class="code-box"><input class="input mono" readonly value=${shareUrl} onFocus=${(e) => e.target.select()} aria-label="공유 주소" /><button type="button" class="btn" onClick=${() => copy(shareUrl, '주소')}><${Icon} name="copy" />복사</button></div>
          <small>단축어 「메모로 보내기」가 이 주소 뒤에 공유한 내용을 붙여 엽니다. 순서는 docs/단축어.md.</small></div>
        <div class="row-ctl"><button type="button" class="btn" onClick=${exportZip} disabled=${zip !== null}><${Icon} name="download" />노션용 zip 받기</button></div>
        ${zip !== null && html`<div class="progress"><i style=${`width:${zip}%`}></i></div>`}
      </${Section}>
      <${Section} id="keys" title="단축키">
        <dl class="help-keys">${SHORTCUTS.map(([k, l]) => html`<div key=${k}><dt><${Keys} keys=${k} /></dt><dd>${l}</dd></div>`)}</dl>
      </${Section}>
      <${Section} title="도움말">
        <div class="row-ctl"><a class="btn" href="#/help"><${Icon} name="help" />사용법</a><a class="btn btn-ghost" href="privacy.html">개인정보처리방침</a><a class="btn btn-ghost" href="terms.html">서비스 약관</a></div>
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
