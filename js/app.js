// 생각서랍 시작점: 로그인 상태를 보고 저장소를 고른 뒤, 주소(#/...)에 맞는 화면을 그린다.

import { GOOGLE_CLIENT_ID } from './config.js';
import { createAuth, AuthRequired } from './store/auth.js';
import { createDriveAdapter } from './store/drive.js';
import { createDemoAdapter } from './store/demo.js';
import { createLibrary } from './store/library.js';
import { esc, icon, toast } from './ui/dom.js';
import { home, inbox, drawer } from './ui/views/home.js';
import { noteView, editor } from './ui/views/note.js';
import { chooser, photo, link, share, importer } from './ui/views/add.js';
import { find, ask } from './ui/views/find.js';
import { graph } from './ui/views/graph.js';
import { settings, welcome, applyTheme } from './ui/views/settings.js';

const auth = createAuth(GOOGLE_CLIENT_ID);
const view = document.getElementById('view');
const rail = document.getElementById('rail');
const topbar = document.getElementById('topbar');
const tabbar = document.getElementById('tabbar');

let lib = null;
let mode = null;
let cleanups = [];
let lastPath = null;

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 저장 불가 */ } },
};

// [주소 모양, 화면, 카드가 바뀌면 다시 그릴지]
const ROUTES = [
  [/^\/?$/, home, true],
  [/^\/inbox$/, inbox, true],
  [/^\/d\/(.+)$/, (c, p) => drawer(c, decodeURIComponent(p)), true],
  [/^\/n\/(.+)$/, noteView],
  [/^\/e\/(.+)$/, editor],
  [/^\/new$/, (c) => editor(c, null)],
  [/^\/add$/, chooser],
  [/^\/add\/photo$/, photo],
  [/^\/add\/link$/, link],
  [/^\/import$/, importer],
  [/^\/share$/, share],
  [/^\/s$/, find],
  [/^\/ask$/, ask],
  [/^\/graph$/, graph],
  [/^\/settings$/, settings],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

function go(hash, { replace = false } = {}) {
  if (replace) { history.replaceState(null, '', hash); render(); } else if (location.hash === hash) render(); else location.hash = hash;
}

function setTop({ home: isHome = false, title = '', back = null, actions = '' } = {}) {
  topbar.innerHTML = isHome
    ? `<a class="brand" href="#/">${icon('logo')}생각서랍</a>
       <a class="icon-btn" href="#/s" aria-label="찾기">${icon('search')}</a>
       <a class="icon-btn" href="#/settings" aria-label="설정">${icon('gear')}</a>`
    : `${back ? `<a class="icon-btn" href="${esc(back)}" aria-label="뒤로">${icon('back')}</a>` : ''}
       <h1>${esc(title)}</h1>${actions}`;
}

function renderChrome(path) {
  const cur = (p) => (path === p || (p === '/' && path === '') ? ' aria-current="page"' : '');
  tabbar.innerHTML = `
    <a href="#/"${cur('/')}>${icon('drawer')}<span>서랍장</span></a>
    <a href="#/s"${cur('/s')}>${icon('search')}<span>찾기</span></a>
    <a href="#/add" class="add" aria-label="카드 넣기">${icon('plus')}<span>넣기</span></a>
    <a href="#/ask"${cur('/ask')}>${icon('ask')}<span>묻기</span></a>
    <a href="#/graph"${cur('/graph')}>${icon('graph')}<span>지도</span></a>`;
  if (!lib) { rail.innerHTML = ''; return; }
  const inboxN = lib.inbox().length;
  const tree = lib.drawers().map((d) => `
    <a class="rail-link" href="#/d/${encodeURIComponent(d.path)}"${cur(`/d/${encodeURIComponent(d.path)}`)}>${icon('drawer')}${esc(d.name)}<span class="count">${d.count}</span></a>
    ${d.children.map((c) => `<a class="rail-link sub" href="#/d/${encodeURIComponent(c.path)}"${cur(`/d/${encodeURIComponent(c.path)}`)}>${esc(c.name)}<span class="count">${c.count}</span></a>`).join('')}`).join('');
  rail.innerHTML = `
    <a class="brand" href="#/">${icon('logo')}생각서랍</a>
    <a class="btn primary new" href="#/add">${icon('plus')}카드 넣기</a>
    <a class="rail-link" href="#/"${cur('/')}>${icon('drawer')}서랍장</a>
    <a class="rail-link" href="#/inbox"${cur('/inbox')}>${icon('inbox')}정리 대기<span class="count${inboxN ? ' hot' : ''}">${inboxN}</span></a>
    <a class="rail-link" href="#/s"${cur('/s')}>${icon('search')}찾기</a>
    <a class="rail-link" href="#/ask"${cur('/ask')}>${icon('ask')}묻기</a>
    <a class="rail-link" href="#/graph"${cur('/graph')}>${icon('graph')}연결 지도</a>
    ${tree ? `<h2>서랍</h2><div class="tree">${tree}</div>` : ''}
    <div class="foot"><a class="rail-link" href="#/settings"${cur('/settings')}>${icon('gear')}설정${mode === 'demo' ? '<span class="count">체험 중</span>' : ''}</a></div>`;
}

function shell(on) {
  document.getElementById('app').classList.toggle('bare', !on);
  rail.hidden = !on; topbar.hidden = !on; tabbar.hidden = !on;
}

async function render({ live = false } = {}) {
  const { path, params } = parseHash();
  if (!lib) {
    cleanups.forEach((f) => f()); cleanups = [];
    shell(false);
    view.className = 'view';
    welcome(context(params));
    return;
  }
  const hit = ROUTES.map(([re, fn, isLive]) => ({ m: re.exec(path), fn, isLive })).find((r) => r.m);
  if (live && (!hit?.isLive || path !== lastPath)) { renderChrome(path); return; }
  cleanups.forEach((f) => f()); cleanups = [];
  shell(true);
  view.className = 'view';
  renderChrome(path);
  if (!live && path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
  const ctx = context(params);
  try {
    if (hit) await hit.fn(ctx, ...hit.m.slice(1));
    else go('#/', { replace: true });
  } catch (e) {
    if (e instanceof AuthRequired) { reconnect(); return; }
    console.error(e);
    view.innerHTML = `<div class="empty"><h3>화면을 그리지 못했어요</h3><p>${esc(e.message)}</p><a class="btn" href="#/">서랍장으로</a></div>`;
  }
}

function context(params) {
  return {
    lib, auth, mode, el: view, params, go, top: setTop, start,
    cleanup: (fn) => cleanups.push(fn),
    banner: mode === 'demo' ? `<div class="banner"><p>체험 모드예요. 카드는 이 기기에만 저장되고, 자동 정리와 사진 글자 읽기는 구글로 연결하면 동작해요.</p><a class="btn small" href="#/settings">설정</a></div>` : '',
  };
}

function reconnect() {
  shell(false);
  view.className = 'view';
  view.innerHTML = `<div class="welcome"><div class="welcome-inner">
    <h1>다시 연결해 주세요</h1>
    <p class="lead">구글 연결은 한 시간마다 새로 받아요. 버튼을 누르면 서랍장으로 돌아가요.</p>
    <div class="actions"><button class="btn primary wide" id="re">${icon('drawer')}구글 다시 연결</button><button class="btn wide" id="demo">체험 모드로 보기</button></div>
  </div></div>`;
  view.querySelector('#re').onclick = () => start('drive');
  view.querySelector('#demo').onclick = () => start('demo');
}

async function start(next) {
  store.set('td.mode', next);
  if (next === 'drive' && !auth.signedIn) {
    if (location.hash && location.hash !== '#/') store.set('td.pending', location.hash);
    try { await auth.signIn(); } catch (e) { toast(e.message); return; }
  }
  await boot();
}

async function boot() {
  mode = store.get('td.mode');
  lib = null;
  if (mode === 'drive' && !auth.configured) mode = null;
  if (!mode) { render(); return; }
  if (mode === 'drive' && !auth.signedIn) { reconnect(); return; }
  const adapter = mode === 'drive' ? createDriveAdapter(auth) : createDemoAdapter();
  const next = createLibrary(adapter);
  shell(true);
  view.className = 'view';
  topbar.innerHTML = '';
  view.innerHTML = '<div class="loading">서랍을 여는 중<span class="card-id" id="lp"></span></div>';
  try {
    await adapter.init();
    await next.load((d, t) => { const lp = document.getElementById('lp'); if (lp) lp.textContent = `${d} / ${t}`; });
  } catch (e) {
    if (e instanceof AuthRequired) { reconnect(); return; }
    console.error(e);
    view.innerHTML = `<div class="empty"><h3>서랍을 열지 못했어요</h3><p>${esc(e.message)}</p><button class="btn" id="retry">다시 시도</button></div>`;
    view.querySelector('#retry').onclick = boot;
    return;
  }
  lib = next;
  lib.onChange(() => render({ live: true }));
  const pending = store.get('td.pending');
  if (pending) { store.set('td.pending', null); history.replaceState(null, '', pending); }
  lastPath = null;
  render();
}

// 단축어가 ?url=... 처럼 쿼리로 열었을 때도 받기 화면으로 보낸다
function adoptShareQuery() {
  const q = new URLSearchParams(location.search);
  if (!q.has('url') && !q.has('text') && !q.has('paste')) return;
  const target = q.has('paste') ? '#/add/photo?paste=1' : `#/share?${q}`;
  history.replaceState(null, '', location.pathname + target);
}

// 다른 기기에서 고친 카드를 다시 불러온다 (앱으로 돌아올 때, 최소 1분 간격)
let lastSync = Date.now();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !lib || mode !== 'drive' || Date.now() - lastSync < 60_000) return;
  lastSync = Date.now();
  try { await lib.load(); } catch (e) { if (e instanceof AuthRequired) toast('구글 연결이 끊겼어요. 설정에서 다시 연결해 주세요.'); }
});

window.addEventListener('hashchange', () => render());

applyTheme();
adoptShareQuery();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
auth.handleRedirect().catch(() => false).then(boot);
