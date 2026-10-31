// 화면 틀 조각: 메뉴 단추, 보조 화면(설정 등)의 머리줄, 저장 상태, 연결 문제 띠
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

// 보조 화면 위쪽: 서랍으로 돌아가기, 제목
export function PageBar({ title, right = null }) {
  return html`<header class="pagebar">
    <a class="pb-back" href="#/" aria-label="서랍으로 돌아가기"><${Icon} name="back" /><${Logo} size=${34} /></a>
    <b class="pb-title">${title}</b>
    <span class="grow"></span>
    ${right}
    <${MenuButton} />
  </header>
  <${Conn} />`;
}
