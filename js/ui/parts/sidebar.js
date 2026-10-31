// 옆 메뉴: 위 막대의 ☰ 로 열고, 핀을 누르면 왼쪽이나 오른쪽에 고정된다 (옵시디언의 옆 막대처럼).
// 홈 · 모든 서랍 · 할 일 · 생각 지도 · 즐겨찾기, 서랍 목록, 넣는 곳, 설정.
import { html, useEffect } from '../h.js';
import { Icon, Mascot } from '../icons.js';
import { app, useLib } from '../state.js';
import { go, folderHref } from '../router.js';
import { drawerList } from '../categories.js';
import { openComposer } from './composer.js';
import { openTutorial } from './tutorial.js';
import { openSpotlight } from './spotlight.js';
import { openToday } from '../notebook.js';
import { openTasks } from '../../core/tasks.js';

export function Sidebar({ path, pinned, side, docked, open, setOpen, setPinned, setSide }) {
  const lib = useLib();
  useEffect(() => { if (!docked) setOpen(false); }, [path]);
  useEffect(() => {
    if (!open || docked) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, docked]);
  if (!docked && !open) return null;
  const drawers = lib ? drawerList(lib) : [];
  const tasksLeft = lib ? lib.all.reduce((s, n) => s + (n.body ? openTasks(n.body).length : 0), 0) : 0;
  const on = (test) => (test ? 'page' : undefined);
  const act = (fn) => () => { if (!docked) setOpen(false); fn(); };
  const item = (href, icon, label, current, extra = null) => html`<a class="sb-item" href=${href} aria-current=${on(current)}><${Icon} name=${icon} /><span>${label}</span>${extra}</a>`;
  return html`
    ${!docked && html`<div class="sb-scrim" onClick=${() => setOpen(false)}></div>`}
    <aside class=${`sb ${side}${docked ? ' docked' : ' floating'}`} aria-label="메뉴">
      <div class="sb-head">
        <a class="sb-brand" href="#/"><${Mascot} size=${26} mood=${open && !docked ? 'wave' : 'smile'} /><b>Thought Drawer</b></a>
        <span class="grow"></span>
        <button type="button" class="icon-btn" aria-label=${side === 'left' ? '오른쪽으로 옮기기' : '왼쪽으로 옮기기'} title=${side === 'left' ? '오른쪽으로 옮기기' : '왼쪽으로 옮기기'} onClick=${() => setSide(side === 'left' ? 'right' : 'left')}><${Icon} name="arrowLeftRight" /></button>
        <button type="button" class="icon-btn" aria-pressed=${pinned} aria-label=${pinned ? '고정 풀기' : '고정하기'} title=${pinned ? '고정 풀기' : '고정하기'} onClick=${() => { setPinned(!pinned); if (pinned) setOpen(false); }}><${Icon} name="pin" /></button>
        ${!docked && html`<button type="button" class="icon-btn" aria-label="메뉴 닫기" onClick=${() => setOpen(false)}><${Icon} name="x" /></button>`}
      </div>
      <button type="button" class="sb-search" onClick=${act(() => openSpotlight())}><${Icon} name="search" /><span>찾기</span><kbd>/</kbd></button>
      <nav class="sb-nav" aria-label="주요 메뉴">
        <button type="button" class="sb-item" onClick=${act(() => { if (path !== '/') go('#/'); setTimeout(() => { if (!app.focusCapture?.()) openComposer(); }, 60); })}><${Icon} name="plus" /><span>넣기</span><kbd>Enter</kbd></button>
        ${item('#/', 'home', '홈', path === '/')}
        ${item('#/drawers', 'drawer', '모든 서랍', path === '/drawers' || path === '/all')}
        ${item('#/tasks', 'check', '할 일', path === '/tasks', tasksLeft > 0 && html`<span class="n">${tasksLeft}</span>`)}
        <button type="button" class="sb-item" onClick=${act(() => openToday())}><${Icon} name="calendar" /><span>오늘 노트</span><kbd>T</kbd></button>
        ${item('#/graph', 'graph', '생각 지도', path === '/graph')}
        ${lib?.pinned().length > 0 && item('#/star', 'star', '즐겨찾기', path === '/star')}
      </nav>
      ${drawers.length > 0 && html`<p class="sb-label">서랍</p>
        <nav class="sb-nav" aria-label="서랍">${drawers.map((d) => html`<a key=${d.name} class="sb-item" href=${folderHref(d.name)} aria-current=${on(decodeURIComponent(path) === `/f/${d.name}`)}><i class=${`fdot f${d.look.tone}`}></i><span>${d.name}</span><span class="n">${d.count}</span></a>`)}</nav>`}
      <p class="sb-label">넣는 곳</p>
      <nav class="sb-nav" aria-label="넣는 곳">
        ${item('#/connect', 'phone', '다른 앱·사이트에서', path === '/connect')}
        ${item('#/bookmarks', 'star', '북마크 가져오기', path === '/bookmarks')}
        ${item('#/import', 'instagram', '인스타 가져오기', path === '/import')}
      </nav>
      <span class="grow"></span>
      <nav class="sb-nav sb-foot" aria-label="설정">
        ${item('#/settings', 'gear', '설정', path === '/settings')}
        <button type="button" class="sb-item" onClick=${act(() => { go('#/'); setTimeout(openTutorial, 160); })}><${Icon} name="help" /><span>사용법 다시 보기</span></button>
      </nav>
    </aside>`;
}
