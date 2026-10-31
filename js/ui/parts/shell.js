// 화면 틀 조각: 위 막대, 메뉴, 보조 화면의 두 번째 막대, 바닥, 저장 상태, 연결 문제 띠
import { html } from '../h.js';
import { Icon, Logo } from '../icons.js';
import { app, useConn, toast } from '../state.js';
import { popover, modal } from './layers.js';
import { MenuItem } from './common.js';
import { ConnBanner } from './conn.js';
import { ConfirmDialog } from './dialogs.js';

export function SaveState({ state }) {
  if (!state) return null;
  const label = { saving: '저장 중', saved: '저장됨', error: '저장 못 함' }[state];
  return html`<span class=${`save-state ${state}`} role="status"><span class="dot"></span>${label}</span>`;
}

export function Conn() {
  const conn = useConn();
  return conn && html`<${ConnBanner} conn=${conn} onRetry=${() => app.resync()} onReconnect=${(o) => app.reconnect(o)} clientId=${app.auth?.clientId} />`;
}

// 내 계정 (오른쪽 위 동그라미): 구글 계정과 드라이브 연결에 관한 것만. 나머지 메뉴는 왼쪽 옆 메뉴에 있다.
function Avatar({ size = 32 }) {
  const p = app.profile ?? {};
  const letter = (p.name || p.email || '나').trim()[0].toUpperCase();
  return p.picture
    ? html`<img src=${p.picture} alt="" referrerpolicy="no-referrer" width=${size} height=${size} />`
    : html`<span aria-hidden="true">${letter}</span>`;
}

function AccountMenu({ close }) {
  const p = app.profile ?? {};
  const drive = app.lib?.adapter.kind === 'drive';
  const live = !drive || !!app.auth?.signedIn;
  const root = app.lib?.adapter.rootId;
  const folder = root ? `https://drive.google.com/drive/folders/${root}` : 'https://drive.google.com/drive/my-drive';
  const open = (url) => () => { close(); window.open(url, '_blank', 'noopener'); };
  const logout = () => { close(); modal((c) => html`<${ConfirmDialog} close=${c} title="로그아웃할까요?" text="이 기기에 저장해 둔 노트 사본도 지워요. 드라이브의 노트는 그대로예요." yes="로그아웃" danger onYes=${() => app.signOut()} />`); };
  return html`<div class="acct">
      <div class="acct-head"><span class="acct-pic"><${Avatar} size=${44} /></span><div class="acct-who"><b>${p.name || '내 계정'}</b>${p.email && html`<span>${p.email}</span>`}</div></div>
      <p class=${`acct-state ${live ? 'on' : 'off'}`}><i></i>${live ? '구글 드라이브 연결됨' : '구글 연결을 다시 받아야 해요'}</p>
      ${!live && html`<button type="button" class="btn btn-primary acct-re" onClick=${() => { close(); app.reconnect(); }}>다시 연결</button>`}
    </div>
    <div class="mi-sep"></div>
    <${MenuItem} icon="folder" label="드라이브에서 「메모」 폴더 열기" onClick=${open(folder)} />
    <${MenuItem} icon="refresh" label="드라이브와 다시 맞추기" onClick=${() => { close(); toast('드라이브와 맞추는 중'); app.resync(); }} />
    <${MenuItem} icon="external" label="구글 계정 관리" onClick=${open('https://myaccount.google.com/')} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="logout" label="로그아웃" danger onClick=${logout} />`;
}

export function MenuButton() {
  return html`<button type="button" class="me" aria-label="내 계정" title="내 계정" aria-haspopup="menu" aria-expanded="false"
    onClick=${(e) => popover(e.currentTarget, (close) => html`<${AccountMenu} close=${close} />`, { width: 300 })}><${Avatar} /></button>`;
}

// 위 막대: 왼쪽 ☰(옆 메뉴)와 이름, 오른쪽 찾기와 내 계정. 옆 메뉴를 고정하면 ☰는 숨는다
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
