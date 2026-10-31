// 확장 프로그램 팝업: 보고 있는 페이지, 보이는 화면 캡처, 메모를 넣는다 (서랍은 앱이 자동으로 나눈다).
// 저장과 구글 연결은 백그라운드가 한다 (팝업은 닫히면 멈추기 때문).

import { APP_URL } from './app/config.js';
import { postKey } from './app/core/instagram.js';
import { readPage, canRead } from './ext/page.js';

const ICONS = {
  memo: '<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>',
  capture: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 15.5-4.5-4.5L7 19"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><path d="M17.2 6.8h.01"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v5.5H4.5V6H10"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  logout: '<path d="M14.5 4.5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4M6 12h9.5"/>',
  inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5h5a3.5 3.5 0 0 0 7 0h5"/>',
  alert: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5M12 15.7h.01"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/>',
};
const GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

const icon = (name, size = 16) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel) => document.querySelector(sel);

const view = $('#view');
const welcome = new URLSearchParams(location.search).has('welcome');
const isMac = /Mac/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
const SAVE_KEY = isMac ? '⌘ Enter' : 'Ctrl Enter';
const MODES = [['page', 'link', '페이지'], ['capture', 'capture', '화면 캡처'], ['memo', 'memo', '메모']];
const SAVE_LABEL = { page: '페이지 넣기', capture: '캡처 넣기', memo: '메모 넣기' };
const KIND_NAME = { page: '페이지', capture: '화면 캡처', image: '이미지', memo: '메모' };
const KIND_ICON = { page: 'link', capture: 'capture', image: 'capture', memo: 'memo' };

if (welcome) document.body.classList.add('welcome');

const s = {
  profile: null, tab: null, page: null, readable: false,
  mode: 'page', title: '', memo: '', text: '', quote: '', shot: null, ocr: true,
  busy: false, step: '', error: null,
};

async function send(type, extra = {}) {
  const r = await chrome.runtime.sendMessage({ type, ...extra });
  if (!r?.ok) {
    const e = new Error(r?.error ?? '확장 프로그램이 응답하지 않아요. 다시 열어 주세요.');
    e.code = r?.code;
    throw e;
  }
  return r;
}

const openTab = (url) => { chrome.tabs.create({ url }); window.close(); };

function rel(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}

// 백그라운드가 알려 주는 진행 단계 (사진 줄이기, 올리기, 글자 읽기)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'progress' && s.busy) { s.step = msg.step; paintActions(); }
  return false;
});

/* ---------- 머리줄 ---------- */

function header() {
  const open = $('#open-app');
  open.hidden = false;
  open.innerHTML = icon('external');
  open.onclick = () => openTab(APP_URL);
  const acc = $('#account');
  acc.hidden = !s.profile;
  if (!s.profile) return;
  const letter = (s.profile.name || s.profile.email || '?').trim()[0].toUpperCase();
  acc.innerHTML = s.profile.picture ? `<img src="${esc(s.profile.picture)}" alt="" referrerpolicy="no-referrer">` : esc(letter);
  acc.title = s.profile.email;
  acc.setAttribute('aria-label', `계정: ${s.profile.email}`);
  acc.onclick = (e) => {
    e.stopPropagation();
    const old = $('.menu');
    if (old) { old.remove(); acc.setAttribute('aria-expanded', 'false'); return; }
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="who"><b>${esc(s.profile.name || '')}</b><span>${esc(s.profile.email)}</span></div>
      <button type="button" role="menuitem" id="m-app">${icon('external')}앱 열기</button>
      <button type="button" role="menuitem" id="m-out">${icon('logout')}연결 끊기</button>`;
    document.body.append(menu);
    acc.setAttribute('aria-expanded', 'true');
    $('#m-app').onclick = () => openTab(APP_URL);
    $('#m-out').onclick = async () => {
      menu.remove();
      await send('signout').catch(() => {});
      s.profile = null;
      header();
      showConnect();
    };
    $('#m-app').focus();
  };
}
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) { $('.menu')?.remove(); $('#account')?.setAttribute('aria-expanded', 'false'); } });

/* ---------- 연결 ---------- */

async function showConnect(message, code) {
  const { uri } = await send('redirect').catch(() => ({ uri: '' }));
  view.innerHTML = `<div class="connect">
    <h1>${welcome ? '설치했어요. 이제 연결해요' : '구글 드라이브에 연결해요'}</h1>
    <p>보고 있는 페이지, 고른 글, 화면 캡처, 메모를 구글 드라이브 「메모」 폴더에 넣어요. 앱이 사이트와 내용을 보고 서랍에 나눠요. 웹사이트와 폰 앱에서 보는 것과 같은 곳이에요.</p>
    ${message ? `<p class="err">${icon('alert')}<span>${esc(message)}</span></p>` : ''}
    <button type="button" class="btn google" id="signin">${GOOGLE}<span>구글로 연결</span></button>
    <p class="small muted">이 앱이 만든 파일만 볼 수 있는 권한(drive.file)만 받아요.</p>
    <details class="help"${code === 'auth_window' ? ' open' : ''}>
      <summary>연결 창에 오류가 나오나요?</summary>
      <p>처음 한 번, 구글 클라우드의 <b>클라이언트 → 웹 애플리케이션 → 승인된 리디렉션 URI</b>에 아래 주소를 추가하고 저장해요. 저장 뒤 몇 분 지나 다시 연결해요.</p>
      <div class="code"><input readonly value="${esc(uri)}" aria-label="리디렉션 주소"><button type="button" class="btn" id="copy">${icon('copy')}복사</button></div>
      <button type="button" class="linkish" id="guide">${icon('external')}자세한 설정 방법 보기</button>
    </details>
  </div>`;
  const btn = $('#signin');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span><span>구글 창에서 계속해요</span>`;
    try {
      const r = await send('signin', { consent: code === 'scope' });
      s.profile = r.profile;
      header();
      await start();
    } catch (e) {
      showConnect(e.message, e.code);
    }
  };
  $('#copy').onclick = async () => {
    await navigator.clipboard.writeText(uri).catch(() => {});
    $('#copy').innerHTML = `${icon('check')}복사했어요`;
  };
  $('#guide').onclick = () => openTab(`${APP_URL}#/connect`);
}

async function showReady() {
  const cmds = await chrome.commands.getAll().catch(() => []);
  const key = cmds.find((c) => c.name === '_execute_action')?.shortcut || (isMac ? '⌘⇧Y' : 'Ctrl+Shift+Y');
  view.innerHTML = `<div class="connect">
    <div class="tick">${icon('check', 22)}</div>
    <h1>준비됐어요</h1>
    <ol class="steps">
      <li><span>주소창 옆 <b>퍼즐 아이콘</b>에서 Thought Drawer를 <b>고정</b>해요.</span></li>
      <li><span>넣고 싶은 페이지에서 아이콘을 누르거나 <kbd>${esc(key)}</kbd>를 눌러요.</span></li>
      <li><span>페이지에서 <b>오른쪽 클릭</b>해도 고른 글, 링크, 이미지, 화면 캡처를 바로 넣을 수 있어요.</span></li>
    </ol>
    <button type="button" class="btn" id="open">${icon('external')}Thought Drawer 열기</button>
  </div>`;
  $('#open').onclick = () => openTab(APP_URL);
}

/* ---------- 넣기 ---------- */

async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  s.tab = tab ?? null;
  s.readable = canRead(tab?.url);
  s.page = s.readable ? await readPage(tab.id).catch(() => null) : null;
  s.title = s.page?.title || tab?.title || '';
  s.quote = s.page?.selection || '';
  const [{ td_mode: mode = 'page' }, { td_draft: draft }] = await Promise.all([
    chrome.storage.local.get('td_mode'),
    chrome.storage.session.get('td_draft'),
  ]);
  s.text = draft?.text ?? '';
  s.memo = draft?.url && draft.url === tab?.url ? draft.memo ?? '' : '';
  s.mode = s.quote ? 'page' : (!s.readable && mode !== 'memo' ? 'memo' : mode);
}

const keepDraft = () => chrome.storage.session.set({ td_draft: { url: s.tab?.url, memo: s.memo, text: s.text } });

function canSave() {
  if (s.mode === 'memo') return !!s.text.trim();
  if (!s.readable) return false;
  return s.mode === 'page' || !!s.shot;
}

function paintActions() {
  const btn = $('#save');
  if (!btn) return;
  btn.disabled = s.busy || !canSave();
  btn.innerHTML = s.busy ? `<span class="spin"></span>${esc(s.step || '넣는 중')}` : SAVE_LABEL[s.mode];
  const err = $('#err');
  err.hidden = !s.error;
  err.innerHTML = s.error ? `${icon('alert')}<span>${esc(s.error)}</span>` : '';
}

function pane() {
  if (s.mode === 'memo') {
    return `<textarea id="text" class="big" rows="7" placeholder="떠오른 생각을 적어요" aria-label="메모">${esc(s.text)}</textarea>`;
  }
  if (!s.readable) {
    return `<div class="blank">${icon('alert', 20)}<p>이 화면은 크롬이 막아 둬서 넣을 수 없어요.<br>메모 탭에서 적어 주세요.</p></div>`;
  }
  const url = s.tab.url;
  let host = url;
  try { const u = new URL(url); host = (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, ''); } catch { /* 그대로 */ }
  const fav = s.tab.favIconUrl && /^https?:|^data:/.test(s.tab.favIconUrl) ? `<img class="fav" src="${esc(s.tab.favIconUrl)}" alt="">` : `<span class="fav ph">${icon('link', 14)}</span>`;
  const card = `<div class="card">${fav}<div class="card-t">
      <input id="title" class="title" value="${esc(s.title)}" placeholder="제목" aria-label="제목">
      <span class="host">${esc(host)}</span></div></div>`;
  if (s.mode === 'capture') {
    return `<figure class="shot" id="shot">${s.shot ? `<img src="${s.shot}" alt="보이는 화면">` : '<div class="sk"></div>'}</figure>
      ${card}
      <label class="check"><input type="checkbox" id="ocr"${s.ocr ? ' checked' : ''}><span>사진 속 글자도 읽어서 넣기</span></label>
      <textarea id="memo" rows="2" placeholder="메모 (선택)" aria-label="메모">${esc(s.memo)}</textarea>`;
  }
  const ig = postKey(url);
  return `${card}
    ${ig ? `<p class="chip">${icon('instagram', 14)}인스타 ${ig.kind === 'reel' ? '릴스' : '게시물'}로 넣어요. 글은 정리할 때 가져와요.</p>` : ''}
    ${s.quote
      ? `<blockquote class="quote"><p>${esc(s.quote)}</p><button type="button" class="x" id="drop-quote" title="고른 글 빼기" aria-label="고른 글 빼기">${icon('x', 14)}</button></blockquote>`
      : '<p class="hint">페이지에서 글을 고른 다음 열면, 고른 글도 함께 넣어요.</p>'}
    <textarea id="memo" rows="3" placeholder="생각 한 줄 (선택)" aria-label="생각">${esc(s.memo)}</textarea>`;
}

function showMain() {
  view.innerHTML = `
    <div class="tabs" role="tablist" aria-label="넣을 것">
      ${MODES.map(([m, ic, label]) => `<button type="button" role="tab" data-mode="${m}" aria-selected="${s.mode === m}" tabindex="${s.mode === m ? 0 : -1}">${icon(ic, 15)}${label}</button>`).join('')}
    </div>
    <form id="form" class="pane" role="tabpanel">
      ${pane()}
      <p class="err" id="err" hidden></p>
      <div class="actions">
        <button class="btn primary" id="save"></button>
        <span class="kbd">${SAVE_KEY}</span>
      </div>
    </form>
    <section class="recent" id="recent" hidden></section>`;
  paintActions();
  const tabs = [...view.querySelectorAll('[role=tab]')];
  tabs.forEach((t, i) => {
    t.onclick = () => switchMode(t.dataset.mode);
    t.onkeydown = (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = tabs[(i + d + tabs.length) % tabs.length];
      switchMode(next.dataset.mode, true);
    };
  });
  $('#form').onsubmit = (e) => { e.preventDefault(); submit(); };
  view.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } };
  const bind = (sel, key, after) => {
    const el = $(sel);
    if (el) el.oninput = () => { s[key] = el.value; keepDraft(); after?.(); };
  };
  bind('#title', 'title');
  bind('#memo', 'memo');
  bind('#text', 'text', paintActions);
  const ocr = $('#ocr');
  if (ocr) ocr.onchange = () => { s.ocr = ocr.checked; };
  const drop = $('#drop-quote');
  if (drop) drop.onclick = () => { s.quote = ''; showMain(); };
  if (s.mode === 'capture' && s.readable && !s.shot) takeShot();
  ($('#text') ?? $('#memo'))?.focus();
  renderRecent();
}

function switchMode(mode, focusTab = false) {
  if (s.busy || mode === s.mode) return;
  s.mode = mode;
  s.error = null;
  chrome.storage.local.set({ td_mode: mode });
  showMain();
  if (focusTab) view.querySelector(`[data-mode="${mode}"]`)?.focus();
}

async function takeShot() {
  try {
    s.shot = await chrome.tabs.captureVisibleTab(s.tab.windowId, { format: 'jpeg', quality: 92 });
    const fig = $('#shot');
    if (fig && s.mode === 'capture') fig.innerHTML = `<img src="${s.shot}" alt="보이는 화면">`;
  } catch (e) {
    s.error = `화면을 캡처하지 못했어요. ${e.message ?? ''}`.trim();
  }
  paintActions();
}

async function submit() {
  if (s.busy || !canSave()) return;
  s.busy = true;
  s.step = '';
  s.error = null;
  paintActions();
  const kind = s.mode;
  const base = { url: s.tab?.url, title: s.title.trim() };
  const data = kind === 'memo' ? { text: s.text }
    : kind === 'page' ? { ...base, memo: s.memo, quote: s.quote }
    : { ...base, memo: s.memo, image: s.shot, ocr: s.ocr };
  try {
    const r = await send('save', { kind, data });
    if (kind === 'memo') s.text = '';
    s.memo = '';
    await chrome.storage.session.remove('td_draft');
    showDone(r, kind === 'memo' ? data.text.trim().split('\n')[0] : data.title);
  } catch (e) {
    s.busy = false;
    if (e.code === 'auth_required') { showConnect('구글 연결이 끝났어요. 다시 연결하면 바로 넣을 수 있어요.'); return; }
    s.error = e.message;
    paintActions();
  }
}

function showDone(r, title) {
  s.busy = false;
  view.innerHTML = `<div class="done">
    <div class="tick">${icon('check', 22)}</div>
    <h2>넣었어요</h2>
    ${title ? `<p class="t">${esc(title)}</p>` : ''}
    <div class="row">
      <button type="button" class="btn primary" id="see">${icon('external')}앱에서 보기</button>
      <button type="button" class="btn" id="again">하나 더 넣기</button>
    </div>
    <p class="small muted">Claude가 정리할 때 제목, 폴더, 태그, 연결을 붙여요.</p>
  </div>`;
  $('#see').onclick = () => openTab(r.url);
  $('#again').onclick = () => { s.quote = ''; s.shot = null; s.mode = s.mode === 'page' ? 'memo' : s.mode; showMain(); };
  $('#see').focus();
}

async function renderRecent() {
  const el = $('#recent');
  const { list = [] } = await send('recent').catch(() => ({}));
  if (!el || !list.length) return;
  el.hidden = false;
  el.innerHTML = `<h3>최근에 넣은 노트</h3>${list.slice(0, 3).map((x) => `
    <button type="button" class="ritem" data-id="${esc(x.id)}">${icon(KIND_ICON[x.kind] ?? 'memo', 15)}<span>${esc(x.title || KIND_NAME[x.kind] || '노트')}</span><time>${rel(x.at)}</time></button>`).join('')}`;
  el.querySelectorAll('.ritem').forEach((b) => { b.onclick = () => openTab(`${APP_URL}#/n/${b.dataset.id}`); });
}

/* ---------- 시작 ---------- */

async function start() {
  if (welcome) { showReady(); return; }
  await loadTab();
  showMain();
}

(async function init() {
  view.innerHTML = '<div class="loading"><div class="sk" style="height:34px"></div><div class="sk" style="height:62px"></div><div class="sk" style="height:76px"></div></div>';
  const st = await send('status').catch(() => ({ profile: null }));
  s.profile = st.profile;
  header();
  if (!s.profile) { showConnect(); return; }
  await start();
})();
