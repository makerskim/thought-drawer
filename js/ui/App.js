// 앱 뼈대: 로그인 → 기기 사본으로 바로 열기 → 드라이브와 맞추기. 그 위에 화면, 단축키, 붙여넣기·끌어다 놓기.
import { html, useState, useEffect, useRef, cx } from './h.js';
import { Icon } from './icons.js';
import { app, toast, setConn } from './state.js';
import { useRoute, go, parse, syncFromLocation } from './router.js';
import { Layers, Toasts, closeAll } from './parts/layers.js';
import { openComposer } from './parts/composer.js';
import { capturePhotos, pickPhotos } from './capture.js';
import { Drawer } from './views/drawer.js';
import { NoteView } from './views/note.js';
import { preloadEditor } from './editor.js';
import { Ask } from './views/ask.js';
import { Graph } from './views/graph.js';
import { Login, Settings, Import, Share, Paste } from './views/more.js';
import { Connect } from './views/connect.js';
import { createLibrary } from '../store/library.js';
import { createDriveAdapter } from '../store/drive.js';
import { createMemoryAdapter } from '../store/memory.js';
import { AuthRequired } from '../store/auth.js';
import { DriveError } from '../store/drive.js';

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// 서랍 위에 옆 창으로 여는 것: 노트, 새 노트, 묻기
const SHEET = /^\/(n\/.+|new|ask)$/;
// 서랍 대신 화면을 채우는 것
const PAGES = new Set(['/settings', '/import', '/connect', '/graph', '/share', '/paste']);
let listHash = '#/'; // 옆 창을 닫으면 돌아갈 서랍 주소

function Sheet({ route }) {
  const { path, params, seq } = route;
  const m = /^\/n\/(.+)$/.exec(path);
  if (m) return html`<${NoteView} key=${`n:${m[1]}`} id=${decodeURIComponent(m[1])} />`;
  if (path === '/new') return html`<${NoteView} key=${`new:${seq}`} id="new" params=${params} />`;
  return html`<${Ask} key=${`ask:${seq}`} params=${params} />`;
}

function Page({ route, offline }) {
  const { path, params } = route;
  if (path === '/graph') return html`<${Graph} />`;
  if (path === '/import') return html`<${Import} />`;
  if (path === '/connect') return html`<${Connect} />`;
  if (path === '/settings') return html`<${Settings} offline=${offline} />`;
  if (path === '/share') return html`<${Share} params=${params} />`;
  return html`<${Paste} />`;
}

export function App({ auth }) {
  const route = useRoute();
  const [phase, setPhase] = useState('boot');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [veil, setVeil] = useState(false);
  const offline = useRef(null);

  app.auth = auth;
  app.pickPhotos = pickPhotos;
  const isSheet = SHEET.test(route.path);
  const isPage = PAGES.has(route.path);
  if (!isSheet && !isPage) listHash = route.hash;
  app.closeSheet = () => go(listHash);
  // 어디서든 칸으로: 다른 화면이면 서랍으로 돌아온 뒤
  app.find = () => { if (isPage) go(listHash); setTimeout(() => app.focusOmni?.(), 0); };

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
      await openLibrary();
    })();
  }, []);

  const signIn = async () => {
    setBusy(true); setError(null);
    try { await auth.signIn(); await openLibrary(); } catch (e) { setError(e.message); }
    setBusy(false);
  };

  // 설정 같은 화면은 맨 위부터 연다
  useEffect(() => { if (isPage) window.scrollTo(0, 0); }, [route.path]);

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
      if (e.defaultPrevented || document.querySelector('.overlay, .pop, .tour')) return;
      if (e.key === 'Escape') {
        if (isTyping(document.activeElement)) { if (!document.activeElement.closest('.omni')) document.activeElement.blur(); return; }
        if (isSheet) { e.preventDefault(); app.closeSheet(); }
        return;
      }
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter: 무엇에도 커서가 없으면 가운데 입력창 (단추나 카드에 있으면 그것을 누른 것)
      const idle = !document.activeElement || document.activeElement === document.body || document.activeElement.matches('.stage-main, .results, .sheet');
      if (e.key === 'Enter' && !e.shiftKey && !isPage && idle) { e.preventDefault(); openComposer(); return; }
      if (e.key === '/') { e.preventDefault(); app.find(); }
      else if (e.key === 'n') { e.preventDefault(); go('#/new'); }
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
  }, [phase, route.path, isSheet, isPage]);

  if (phase === 'boot') {
    return html`<div class="login" aria-busy="true"><div class="login-card"><div class="sk" style="width:52px;height:52px;margin:0 auto;border-radius:12px"></div></div></div>`;
  }
  if (phase === 'login') return html`<${Login} onSignIn=${signIn} busy=${busy} error=${error} /><${Toasts} />`;

  if (isPage) {
    return html`<div class="page-shell"><${Page} route=${route} offline=${offline.current} /></div>
    <${Layers} />
    <${Toasts} />`;
  }
  const sheetNote = /^\/n\/(.+)$/.exec(route.path)?.[1];
  return html`
    <div class=${cx('stage', isSheet && 'with-sheet')}>
      <div class="stage-main"><${Drawer} path=${parse(listHash).path} activeId=${sheetNote && decodeURIComponent(sheetNote)} /></div>
      ${isSheet && html`<div class="sheet-scrim" onClick=${() => app.closeSheet()}></div>
        <aside class="sheet" aria-label=${route.path === '/ask' ? '묻기' : '노트'}><${Sheet} route=${route} /></aside>`}
    </div>
    <${Layers} />
    <${Toasts} />
    ${veil && html`<div class="drop-veil"><div><${Icon} name="capture" />놓으면 인박스에 저장돼요</div></div>`}`;
}

