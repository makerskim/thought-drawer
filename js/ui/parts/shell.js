// 화면 틀 조각: 위 막대, 메뉴, 보조 화면의 두 번째 막대, 바닥, 저장 상태, 연결 문제 띠
import { html } from '../h.js';
import { Icon, Logo } from '../icons.js';
import { app, useConn } from '../state.js';
import { go } from '../router.js';
import { popover } from './layers.js';
import { MenuItem } from './common.js';
import { ConnBanner } from './conn.js';
import { openComposer } from './composer.js';
import { openTutorial } from './tutorial.js';
import { openToday } from '../notebook.js';

export function SaveState({ state }) {
  if (!state) return null;
  const label = { saving: '저장 중', saved: '저장됨', error: '저장 못 함' }[state];
  return html`<span class=${`save-state ${state}`} role="status"><span class="dot"></span>${label}</span>`;
}

export function Conn() {
  const conn = useConn();
  return conn && html`<${ConnBanner} conn=${conn} onRetry=${() => app.resync()} onReconnect=${(o) => app.reconnect(o)} clientId=${app.auth?.clientId} />`;
}

// 메뉴: 넣기와 넣는 방법, 오늘·할 일, 보기, 설정
export function openMenu(anchor) {
  const to = (close, hash) => () => { close(); go(hash); };
  // 사용법은 서랍 화면에서 보여 준다
  const tour = (close) => () => { close(); if (!document.querySelector('.drawer')) go('#/'); setTimeout(openTutorial, 160); };
  popover(anchor, (close) => html`
    <${MenuItem} icon="plus" label="넣기" sub="Enter" onClick=${() => { close(); if (!app.focusCapture?.()) openComposer(); }} />
    <${MenuItem} icon="capture" label="사진·스크린샷 넣기" onClick=${() => { close(); app.pickPhotos(); }} />
    <${MenuItem} icon="phone" label="다른 앱·사이트에서 넣는 법" onClick=${to(close, '#/connect')} />
    <${MenuItem} icon="star" label="브라우저 북마크 가져오기" onClick=${to(close, '#/bookmarks')} />
    <${MenuItem} icon="instagram" label="인스타 저장 가져오기" onClick=${to(close, '#/import')} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="calendar" label="오늘 노트" sub="T" onClick=${() => { close(); openToday(); }} />
    <${MenuItem} icon="check" label="할 일 모아 보기" onClick=${to(close, '#/tasks')} />
    <${MenuItem} icon="pen" label="새 노트 크게 쓰기" sub="N" onClick=${to(close, '#/new')} />
    <${MenuItem} icon="graph" label="생각 지도" onClick=${to(close, '#/graph')} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="gear" label="설정" onClick=${to(close, '#/settings')} />
    <${MenuItem} icon="help" label="사용법 다시 보기" onClick=${tour(close)} />`, { width: 260 });
}

export function MenuButton() {
  const p = app.profile ?? {};
  const letter = (p.name || p.email || '나').trim()[0].toUpperCase();
  return html`<button type="button" class="me" aria-label="메뉴" aria-haspopup="menu" aria-expanded="false" onClick=${(e) => openMenu(e.currentTarget)}>
    ${p.picture ? html`<img src=${p.picture} alt="" referrerpolicy="no-referrer" />` : letter}
  </button>`;
}

// 위 막대: 왼쪽 ☰(옆 메뉴)와 이름, 오른쪽 찾기와 내 메뉴. 옆 메뉴를 고정하면 ☰는 숨는다
export function GlobalNav({ navOpen, docked }) {
  return html`<header class="gnav"><div class="gnav-in">
    ${!docked && html`<button type="button" class="gn-btn nav-toggle" aria-label="메뉴" aria-expanded=${navOpen} title="메뉴" onClick=${() => app.toggleNav?.()}><${Icon} name="menu" /></button>`}
    ${!docked && html`<a class="gn-brand" href="#/" aria-label="Thought Drawer 홈"><${Logo} size=${24} /><span>Thought Drawer</span></a>`}
    <div class="gn-end">
      <button type="button" class="gn-btn gn-search" aria-label="찾기와 빠른 실행" title=${`찾기 (/ 또는 ${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+K)`} onClick=${() => app.find()}><${Icon} name="search" /></button>
      <${MenuButton} />
    </div>
  </div></header>`;
}

// 보조 화면의 두 번째 막대: 뒤로, 화면 이름, 오른쪽 단추들
export function PageBar({ title, right = null, back = '#/' }) {
  return html`<div class="lnav"><div class="lnav-in">
    <a class="lnav-back" href=${back} aria-label="뒤로"><${Icon} name="back" /></a>
    <b class="lnav-title">${title}</b>
    <span class="grow"></span>
    ${right}
  </div></div>
  <${Conn} />`;
}

// 바닥 (애플 홈페이지 아래 작은 글씨)
export function Footer() {
  return html`<footer class="foot">
    <nav aria-label="바닥 메뉴"><a href="#/connect">넣는 법</a><a href="#/drawers">모든 서랍</a><a href="#/bookmarks">북마크 가져오기</a><a href="#/settings">설정</a><a href="privacy.html">개인정보처리방침</a><a href="terms.html">서비스 약관</a></nav>
    <p>노트는 구글 드라이브 「메모」 폴더에 마크다운으로 저장됩니다.</p>
  </footer>`;
}
