// 앱 뼈대: 로그인 → 기기 사본으로 바로 열기 → 드라이브와 맞추기. 그 위에 화면, 단축키, 붙여넣기·끌어다 놓기.
import { html, useState, useEffect, useRef, cx } from './h.js';
import { Icon } from './icons.js';
import { app, usePref, toast } from './state.js';
import { useRoute, go, syncFromLocation } from './router.js';
import { Sidebar, TabBar } from './parts/shell.js';
import { Layers, Toasts, modal, closeAll } from './parts/layers.js';
import { Palette, LinkDialog } from './parts/dialogs.js';
import { capturePhotos, pickPhotos } from './capture.js';
import { Home } from './views/home.js';
import { Inbox, Folder, TagView, NotFound } from './views/lists.js';
import { NoteView } from './views/note.js';
import { Ask } from './views/ask.js';
import { Graph } from './views/graph.js';
import { Login, Settings, Import, Share, Paste } from './views/more.js';
import { createLibrary } from '../store/library.js';
import { createDriveAdapter } from '../store/drive.js';
import { createMemoryAdapter } from '../store/memory.js';
import { AuthRequired } from '../store/auth.js';

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const mobile = () => matchMedia('(max-width: 860px)').matches;

function Routes({ route, offline }) {
  const { path, params, seq } = route;
  let m;
  if (path === '/' || path === '') return html`<${Home} />`;
  if (path === '/inbox') return html`<${Inbox} />`;
  if ((m = /^\/f\/(.+)$/.exec(path))) return html`<${Folder} key=${path} path=${decodeURIComponent(m[1])} />`;
  if ((m = /^\/t\/(.+)$/.exec(path))) return html`<${TagView} key=${path} tag=${decodeURIComponent(m[1])} />`;
  if ((m = /^\/n\/(.+)$/.exec(path))) return html`<${NoteView} key=${`n:${m[1]}`} id=${decodeURIComponent(m[1])} />`;
  if (path === '/new') return html`<${NoteView} key=${`new:${seq}`} id="new" params=${params} />`;
  if (path === '/ask') return html`<${Ask} key=${`ask:${seq}`} params=${params} />`;
  if (path === '/graph') return html`<${Graph} />`;
  if (path === '/import') return html`<${Import} />`;
  if (path === '/settings') return html`<${Settings} offline=${offline} />`;
  if (path === '/share') return html`<${Share} params=${params} />`;
  if (path === '/paste') return html`<${Paste} />`;
  return html`<${NotFound} />`;
}

export function App({ auth }) {
  const route = useRoute();
  const [phase, setPhase] = useState('boot');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = usePref('sideClosed', false);
  const [open, setOpen] = useState(false);
  const [veil, setVeil] = useState(false);
  const offline = useRef(null);
  const connToast = useRef(null);

  app.auth = auth;
  app.toggleSidebar = () => (mobile() ? setOpen((o) => !o) : setCollapsed(!collapsed));
  app.openPalette = () => modal((close) => html`<${Palette} close=${close} />`);
  app.openLinkDialog = () => modal((close) => html`<${LinkDialog} close=${close} />`);
  app.pickPhotos = pickPhotos;

  // 드라이브와 맞추기. 연결이 끊겼으면 아래에 다시 연결 알림을 띄운다.
  const sync = async () => {
    if (!app.lib) return;
    try {
      if (app.lib.adapter.kind === 'drive' && !auth.signedIn) throw new AuthRequired();
      await app.lib.adapter.init();
      await app.lib.sync();
      connToast.current?.close(); connToast.current = null;
    } catch (e) {
      connToast.current?.close();
      connToast.current = e instanceof AuthRequired
        ? toast('구글 연결이 만료됐어요. 다시 연결하면 바뀐 내용을 맞춰요.', { action: '다시 연결', duration: 0, onAction: () => app.reconnect() })
        : toast('드라이브에 연결하지 못했어요. 지금은 이 기기의 사본을 보여 줘요.', { action: '다시 시도', duration: 0, onAction: () => sync() });
    }
  };
  app.resync = sync;
  app.reconnect = async () => {
    try { await auth.signIn(); await sync(); } catch (e) { toast(e.message); }
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

  // 모바일 사이드바는 화면을 옮기면 닫는다
  useEffect(() => { setOpen(false); }, [route.hash]);

  // 단축키, 붙여넣기, 끌어다 놓기, 앱으로 돌아왔을 때 맞추기
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); app.openPalette(); return; }
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.overlay')) return;
      if (e.key === '/') { e.preventDefault(); app.openPalette(); }
      else if (e.key === 'n') { e.preventDefault(); go('#/new'); }
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
  }, [phase, route.path]);

  if (phase === 'boot') {
    return html`<div class="login" aria-busy="true"><div class="login-card"><div class="sk" style="width:52px;height:52px;margin:0 auto;border-radius:12px"></div></div></div>`;
  }
  if (phase === 'login') return html`<${Login} onSignIn=${signIn} busy=${busy} error=${error} /><${Toasts} />`;

  return html`
    <div class=${cx('app', collapsed && 'side-closed', open && 'side-open')}>
      <${Sidebar} />
      <div class="scrim" onClick=${() => setOpen(false)}></div>
      <main class="main" id="main"><${Routes} route=${route} offline=${offline.current} /></main>
      <${TabBar} />
    </div>
    <${Layers} />
    <${Toasts} />
    ${veil && html`<div class="drop-veil"><div><${Icon} name="capture" />놓으면 인박스에 저장돼요</div></div>`}`;
}

