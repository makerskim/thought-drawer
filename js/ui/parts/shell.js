// 화면 틀 조각: 메뉴 단추, 보조 화면(설정 등)의 머리줄, 저장 상태, 연결 문제 띠
import { html } from '../h.js';
import { Icon, Logo } from '../icons.js';
import { app, useConn } from '../state.js';
import { go } from '../router.js';
import { popover } from './layers.js';
import { MenuItem } from './common.js';
import { ConnBanner } from './conn.js';

export function SaveState({ state }) {
  if (!state) return null;
  const label = { saving: '저장 중', saved: '저장됨', error: '저장 못 함' }[state];
  return html`<span class=${`save-state ${state}`} role="status"><span class="dot"></span>${label}</span>`;
}

export function Conn() {
  const conn = useConn();
  return conn && html`<${ConnBanner} conn=${conn} onRetry=${() => app.resync()} onReconnect=${(o) => app.reconnect(o)} clientId=${app.auth?.clientId} />`;
}

// 서랍 밖의 것들: 새 노트, 사진, 그래프, 폰과 크롬, 인스타 가져오기, 설정
export function openMenu(anchor) {
  const to = (close, hash) => () => { close(); go(hash); };
  popover(anchor, (close) => html`
    <${MenuItem} emoji="📝" label="새 노트" sub="N" onClick=${to(close, '#/new')} />
    <${MenuItem} emoji="📸" label="사진 넣기" onClick=${() => { close(); app.pickPhotos(); }} />
    <div class="mi-sep"></div>
    <${MenuItem} emoji="🕸️" label="생각 지도 (그래프)" onClick=${to(close, '#/graph')} />
    <${MenuItem} emoji="📱" label="폰과 크롬에서 쓰기" onClick=${to(close, '#/connect')} />
    <${MenuItem} emoji="💗" label="인스타 가져오기" onClick=${to(close, '#/import')} />
    <${MenuItem} emoji="⚙️" label="설정" onClick=${to(close, '#/settings')} />`, { width: 240 });
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
