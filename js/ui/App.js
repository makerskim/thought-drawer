// 앱 뼈대: 로그인 → 기기 사본으로 바로 열기 → 드라이브와 맞추기.
// 화면은 위 막대(애플) 아래 한 장씩: 홈, 서랍, 할 일, 노트 작업 공간(옵시디언), 보조 화면. 단축키, 붙여넣기·끌어다 놓기.
import { html, useState, useEffect, useRef, cx } from './h.js';
import { Icon } from './icons.js';
import { app, toast, setConn, usePref } from './state.js';
import { useRoute, go, syncFromLocation } from './router.js';
import { Layers, Toasts, closeAll } from './parts/layers.js';
import { openComposer } from './parts/composer.js';
import { openToday } from './notebook.js';
import { capturePhotos, pickPhotos } from './capture.js';
import { Home, Drawers, Shelf, Tasks } from './views/drawer.js';
import { GlobalNav } from './parts/shell.js';
import { Sidebar } from './parts/sidebar.js';
import { openSpotlight } from './parts/spotlight.js';
import { NoteView } from './views/note.js';
import { preloadEditor } from './editor.js';
import { Ask } from './views/ask.js';
import { Graph } from './views/graph.js';
import { Login, Settings, Import, Bookmarks, Share, Paste } from './views/more.js';
import { Connect } from './views/connect.js';
import { Help } from './views/help.js';
import { enrichNew } from './categories.js';
import { createLibrary } from '../store/library.js';
import { createDriveAdapter } from '../store/drive.js';
import { createMemoryAdapter } from '../store/memory.js';
import { AuthRequired, isStandalone } from '../store/auth.js';
import { DriveError } from '../store/drive.js';

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// 노트 작업 공간으로 여는 것 (닫으면 보던 목록으로 돌아간다)
const NOTE = /^\/(n\/.+|new)$/;
let listHash = '#/';

function Screen({ route, offline }) {
  const { path, params, seq } = route;
  let m;
  if ((m = /^\/n\/(.+)$/.exec(path))) return html`<${NoteView} key=${`n:${m[1]}`} id=${decodeURIComponent(m[1])} />`;
  if (path === '/new') return html`<${NoteView} key=${`new:${seq}`} id="new" params=${params} />`;
  if (path === '/ask') return html`<${Ask} key=${`ask:${seq}`} params=${params} />`;
  if (path === '/drawers') return html`<${Drawers} />`;
  if (path === '/tasks') return html`<${Tasks} />`;
  if (path === '/all') return html`<${Shelf} scope=${{ kind: 'all' }} params=${params} />`;
  if (path === '/star') return html`<${Shelf} scope=${{ kind: 'star' }} params=${params} />`;
  if (path === '/inbox') return html`<${Shelf} scope=${{ kind: 'inbox' }} params=${params} />`;
  if (path === '/search') return html`<${Shelf} key=${`s:${params.get('q') ?? ''}`} scope=${{ kind: 'search', value: params.get('q') ?? '' }} params=${params} />`;
  if ((m = /^\/f\/(.+)$/.exec(path))) return html`<${Shelf} scope=${{ kind: 'folder', value: decodeURIComponent(m[1]) }} params=${params} />`;
  if ((m = /^\/t\/(.+)$/.exec(path))) return html`<${Shelf} scope=${{ kind: 'tag', value: decodeURIComponent(m[1]) }} params=${params} />`;
  if (path === '/graph') return html`<${Graph} />`;
  if (path === '/import') return html`<${Import} />`;
  if (path === '/bookmarks') return html`<${Bookmarks} />`;
  if (path === '/connect') return html`<${Connect} />`;
  if (path === '/settings') return html`<${Settings} offline=${offline} params=${params} />`;
  if (path === '/help') return html`<${Help} />`;
  if (path === '/share') return html`<${Share} params=${params} />`;
  if (path === '/paste') return html`<${Paste} />`;
  return html`<${Home} />`;
}

export function App({ auth }) {
  const route = useRoute();
  const [phase, setPhase] = useState('boot');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [veil, setVeil] = useState(false);
  const offline = useRef(null);
  // 옆 메뉴: 고정(왼쪽·오른쪽)은 넓은 화면에서만, 좁으면 ☰로 열고 닫는다
  const [navPinned, setNavPinned] = usePref('navPinned', false);
  const [navSide, setNavSide] = usePref('navSide', 'left');
  const [navOpen, setNavOpen] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const docked = navPinned && wide;
  app.toggleNav = () => setNavOpen((o) => !o);

  app.auth = auth;
  app.pickPhotos = pickPhotos;
  const isSheet = NOTE.test(route.path);
  if (!isSheet && !/^\/(share|paste)$/.test(route.path)) listHash = route.hash;
  app.closeSheet = () => go(listHash === route.hash ? '#/' : listHash);
  app.find = () => openSpotlight();

  // 드라이브와 맞추기. 문제가 있으면 원인과 고치는 버튼을 위쪽 띠에 보여 준다.
  const sync = async () => {
    if (!app.lib) return;
    try {
      if (app.lib.adapter.kind === 'drive') {
        if (!auth.signedIn) throw new AuthRequired();
        if (!auth.hasDrive) throw new DriveError('scope', '드라이브 권한이 허용되지 않았어요.', 'granted scope: drive.file 없음');
      }
      await app.lib.adapter.init();
      await app.lib.sync();
      setConn(null);
    } catch (e) {
      console.warn('[sync]', e);
      setConn(e instanceof AuthRequired ? { code: 'auth', message: e.message } : { code: e.code ?? 'other', message: e.message, detail: e.detail ?? String(e), project: e.project });
    }
  };
  app.resync = sync;
  app.reconnect = async (opts) => {
    try { await auth.signIn(opts); await sync(); } catch (e) { toast(e.message); }
  };
  app.signOut = async () => {
    await app.lib?.clearCache();
    auth.signOut();
    app.lib = null; app.profile = null;
    closeAll();
    setPhase('login');
  };

  const openLibrary = async () => {
    const test = window.__TD_TEST__;
    const profile = test?.profile ?? auth.profile ?? {};
    app.profile = profile;
    const adapter = test ? createMemoryAdapter(test) : createDriveAdapter(auth);
    app.lib = createLibrary(adapter, { cacheName: test ? 'td-test' : `td-cache:${profile.email ?? 'me'}` });
    app.lib.enrich = (n) => enrichNew(n, app.lib); // 새 노트에 자동 태그
    if (test) { await app.lib.clearCache(); window.__TD_APP__ = app; }
    const cached = await app.lib.loadCached();
    if (cached) setPhase('ready');
    await sync();
    setPhase('ready');
    syncFromLocation();
  };

  useEffect(() => {
    (async () => {
      if (window.__TD_TEST__) { await openLibrary(); return; }
      offline.current = await auth.takeOfflineCode().catch(() => null);
      await auth.handleRedirect().catch(() => false);
      if (!auth.signedIn && !auth.everSignedIn) { setPhase('login'); return; }
      // 한 시간이 지나 구글 연결이 끝났으면 구글에 잠깐 다녀온다 (로그인돼 있으면 화면 없이 돌아온다)
      if (!auth.signedIn && auth.canAutoRenew && !offline.current) { auth.renewRedirect(); return; }
      await openLibrary();
    })();
  }, []);

  const signIn = async () => {
    setBusy(true); setError(null);
    try { await auth.signIn(); await openLibrary(); } catch (e) { setError(e.message); }
    setBusy(false);
  };

  // 구글 연결 이어 가기: 끝나기 5분 전부터 다음 클릭 때 작은 창으로 새로 받는다(이미 허용했으면 저절로 닫힘).
  // 아이폰 홈 화면 앱은 창 대신, 앱으로 돌아올 때 구글에 잠깐 다녀온다(적던 글이 없을 때만).
  useEffect(() => {
    if (phase !== 'ready' || app.lib?.adapter.kind !== 'drive') return undefined;
    const standalone = isStandalone();
    let want = false;
    const check = () => {
      want = auth.msLeft < 5 * 60_000;
      if (want && !standalone && auth.canAutoRenew) auth.preload().catch(() => {});
    };
    const onClick = () => {
      check();
      if (!want || standalone || auth.renewing || !auth.canAutoRenew || !auth.canPopup) return;
      want = false;
      auth.renewPopup().then(() => { setConn(null); return sync(); }).catch(() => { /* 위쪽 띠의 「다시 연결」로 */ });
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      check();
      const busy = isTyping(document.activeElement) && document.activeElement.value?.trim();
      if (want && standalone && auth.canAutoRenew && !busy && !document.querySelector('.overlay')) auth.renewRedirect();
    };
    check();
    const iv = setInterval(check, 30_000);
    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(iv); document.removeEventListener('click', onClick, true); document.removeEventListener('visibilitychange', onVisible); };
  }, [phase]);

  // 화면을 바꾸면 맨 위부터 (노트 사이를 오갈 때는 제외)
  useEffect(() => { if (!isSheet) window.scrollTo(0, 0); }, [route.path]);

  // 편집기는 커서 첫 화면에 필요 없어서, 화면이 뜬 뒤 쉬는 틈에 받아 둔다
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
    const id = idle(() => preloadEditor());
    return () => (window.cancelIdleCallback ?? clearTimeout)(id);
  }, [phase]);

  // 단축키, 붙여넣기, 끌어다 놓기, 앱으로 돌아왔을 때 맞추기
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); app.find(); return; }
      // 입력창이 이미 처리한 키(넣고 닫은 Enter 등)는 다시 받지 않는다
      if (e.defaultPrevented || document.querySelector('.overlay, .pop, .tour, .sb.floating')) return;
      if (e.key === 'Escape') {
        if (isTyping(document.activeElement)) { if (!document.activeElement.closest('.capbar')) document.activeElement.blur(); return; }
        if (isSheet) { e.preventDefault(); app.closeSheet(); }
        return;
      }
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter: 무엇에도 커서가 없으면 가운데 입력창 (단추나 카드에 있으면 그것을 누른 것)
      const idle = !document.activeElement || document.activeElement === document.body || document.activeElement.matches('.ws-main, main');
      if (e.key === 'Enter' && !e.shiftKey && idle && !/^\/(settings|import|bookmarks|connect|share|paste|help)$/.test(route.path)) { e.preventDefault(); if (isSheet || !app.focusCapture?.()) openComposer(); return; }
      if (e.key === '/') { e.preventDefault(); app.find(); }
      else if (e.key === 'n') { e.preventDefault(); go('#/new'); }
      else if (e.key === 't') { e.preventDefault(); openToday(); }
      else if (isSheet && (e.key === 'j' || e.key === 'ArrowDown')) { e.preventDefault(); app.sheetNav?.(1); }
      else if (isSheet && (e.key === 'k' || e.key === 'ArrowUp')) { e.preventDefault(); app.sheetNav?.(-1); }
    };
    const onPaste = (e) => {
      if (isTyping(document.activeElement) || route.path === '/paste') return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); capturePhotos(files); }
    };
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const onEnter = (e) => { if (hasFiles(e)) { depth++; setVeil(true); } };
    const onLeave = (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setVeil(false); } };
    const onOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const onDrop = (e) => {
      depth = 0; setVeil(false);
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      capturePhotos([...e.dataTransfer.files]);
    };
    let last = Date.now();
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - last > 60_000) { last = Date.now(); sync(); } };
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [phase, route.path, isSheet]);

  if (phase === 'boot') {
    return html`<div class="login" aria-busy="true"><div class="login-card"><div class="sk" style="width:52px;height:52px;margin:0 auto;border-radius:12px"></div></div></div>`;
  }
  if (phase === 'login') return html`<${Login} onSignIn=${signIn} busy=${busy} error=${error} /><${Toasts} />`;

  return html`
    <div class=${cx('shell', docked && `docked-${navSide}`)}>
      <${Sidebar} path=${route.path} pinned=${navPinned} side=${navSide} docked=${docked} open=${navOpen} setOpen=${setNavOpen} setPinned=${setNavPinned} setSide=${setNavSide} />
      <div class="shell-main">
        <${GlobalNav} navOpen=${navOpen} docked=${docked} />
        <main class=${cx('view', isSheet && 'is-note')} id="main"><${Screen} route=${route} offline=${offline.current} /></main>
      </div>
    </div>
    <${Layers} />
    <${Toasts} />
    ${veil && html`<div class="drop-veil"><div><${Icon} name="capture" />놓으면 바로 넣어요</div></div>`}`;
}

