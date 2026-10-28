// 사이드바, 위 막대, 아래 탭(모바일), 추가 메뉴
import { html } from '../h.js';
import { Icon, Logo } from '../icons.js';
import { app, useLib, usePref } from '../state.js';
import { useRoute, folderHref, go } from '../router.js';
import { popover } from './layers.js';
import { MenuItem, Tag } from './common.js';
import { modKey } from '../format.js';

function FolderTree({ folders, depth = 0, path, open, toggle }) {
  return html`${folders.map((f) => {
    const isOpen = open.includes(f.path);
    const href = folderHref(f.path);
    return html`<div key=${f.path}>
      <div class="tree-row">
        <button type="button" class=${`twisty${f.children.length ? '' : ' none'}${isOpen ? ' open' : ''}`} aria-label=${isOpen ? '접기' : '펼치기'} onClick=${() => toggle(f.path)}><${Icon} name="chevron" /></button>
        <a class="sb-item" href=${href} aria-current=${path === href.slice(1) ? 'page' : undefined}>
          <${Icon} name="folder" /><span class="label">${f.name}</span><span class="badge">${f.count || ''}</span>
        </a>
      </div>
      ${isOpen && f.children.length > 0 && html`<div class="tree-kids"><${FolderTree} folders=${f.children} depth=${depth + 1} path=${path} open=${open} toggle=${toggle} /></div>`}
    </div>`;
  })}`;
}

export function Sidebar() {
  const lib = useLib();
  const { path } = useRoute();
  const [open, setOpen] = usePref('openFolders', []);
  const toggle = (p) => setOpen(open.includes(p) ? open.filter((x) => x !== p) : [...open, p]);
  const inboxN = lib.inbox().length;
  const cur = (p) => (path === p ? 'page' : undefined);
  const tags = lib.tags().slice(0, 14);
  const p = app.profile ?? {};
  return html`<aside class="sidebar" aria-label="탐색">
    <a class="sb-ws" href="#/settings">
      <${Logo} size=${24} />
      <div><div class="ws-name">Thought Drawer</div>${p.email && html`<div class="ws-mail">${p.email}</div>`}</div>
    </a>
    <div class="sb-scroll">
      <button type="button" class="sb-item" onClick=${() => app.openPalette()}><${Icon} name="search" /><span class="label">검색</span><kbd>${modKey} K</kbd></button>
      <a class="sb-item" href="#/new"><${Icon} name="plus" /><span class="label">새 노트</span></a>
      <div style="height:10px"></div>
      <a class="sb-item" href="#/" aria-current=${cur('/')}><${Icon} name="home" /><span class="label">홈</span></a>
      <a class="sb-item" href="#/inbox" aria-current=${cur('/inbox')}><${Icon} name="inbox" /><span class="label">인박스</span>${inboxN > 0 && html`<span class="badge hot">${inboxN}</span>`}</a>
      <a class="sb-item" href="#/ask" aria-current=${cur('/ask')}><${Icon} name="ask" /><span class="label">묻기</span></a>
      <a class="sb-item" href="#/graph" aria-current=${cur('/graph')}><${Icon} name="graph" /><span class="label">그래프</span></a>
      <div class="sb-group">
        <div class="sb-title"><span>폴더</span></div>
        ${lib.folders().length
          ? html`<${FolderTree} folders=${lib.folders()} path=${path} open=${open} toggle=${toggle} />`
          : html`<p class="muted" style="font-size:12.5px;padding:2px 8px;margin:0">정리되면 Claude가 폴더를 만들어요.</p>`}
      </div>
      ${tags.length > 0 && html`<div class="sb-group"><div class="sb-title"><span>태그</span></div><div class="sb-tags">${tags.map(([t]) => html`<${Tag} key=${t} name=${t} />`)}</div></div>`}
    </div>
    <div class="sb-foot">
      <a class="sb-item" href="#/import" aria-current=${cur('/import')}><${Icon} name="instagram" /><span class="label">인스타 가져오기</span></a>
      <a class="sb-item" href="#/settings" aria-current=${cur('/settings')}><${Icon} name="gear" /><span class="label">설정</span></a>
    </div>
  </aside>`;
}

export function SaveState({ state }) {
  if (!state) return null;
  const label = { saving: '저장 중', saved: '저장됨', error: '저장 못 함' }[state];
  return html`<span class=${`save-state ${state}`} role="status"><span class="dot"></span>${label}</span>`;
}

// crumbs: [{ label, href }] — 마지막이 지금 화면
export function Topbar({ crumbs = [], right = null, lined = false }) {
  return html`<header class=${`topbar${lined ? ' lined' : ''}`}>
    <button type="button" class="icon-btn" aria-label="사이드바" onClick=${() => app.toggleSidebar()}><${Icon} name="sidebar" /></button>
    <nav class="crumbs" aria-label="위치">
      ${crumbs.map((c, i) => html`${i > 0 && html`<span class="sep">/</span>`}${i === crumbs.length - 1 || !c.href
        ? html`<span class="cur" title=${c.label}>${c.label}</span>`
        : html`<a href=${c.href} title=${c.label}>${c.label}</a>`}`)}
    </nav>
    ${right}
    <button type="button" class="icon-btn show-m" aria-label="검색" onClick=${() => app.openPalette()}><${Icon} name="search" /></button>
  </header>`;
}

export function openAddMenu(anchor) {
  popover(anchor, (close) => html`
    <${MenuItem} icon="memo" label="새 노트" sub="N" onClick=${() => { close(); go('#/new'); }} />
    <${MenuItem} icon="capture" label="사진·캡처" onClick=${() => { close(); app.pickPhotos(); }} />
    <${MenuItem} icon="link" label="링크" onClick=${() => { close(); app.openLinkDialog(); }} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="instagram" label="인스타 저장함 가져오기" onClick=${() => { close(); go('#/import'); }} />`);
}

export function TabBar() {
  const lib = useLib();
  const { path } = useRoute();
  const n = lib.inbox().length;
  return html`<nav class="tabbar" aria-label="주요 메뉴">
    <a href="#/" aria-current=${path === '/' ? 'page' : undefined}><${Icon} name="home" />홈</a>
    <button type="button" onClick=${() => app.openPalette()}><${Icon} name="search" />검색</button>
    <button type="button" class="add-btn" aria-label="추가" onClick=${(e) => openAddMenu(e.currentTarget)}><${Icon} name="plus" /></button>
    <a href="#/inbox" aria-current=${path === '/inbox' ? 'page' : undefined}><${Icon} name="inbox" />인박스${n > 0 && html`<span class="dot">${n}</span>`}</a>
    <button type="button" onClick=${() => app.toggleSidebar()}><${Icon} name="menu" />메뉴</button>
  </nav>`;
}
