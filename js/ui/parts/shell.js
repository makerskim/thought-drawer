// 화면 틀 조각: 위 막대, 메뉴, 보조 화면의 두 번째 막대, 바닥, 저장 상태, 연결 문제 띠
import { html, useState, useEffect } from '../h.js';
import { Icon, Logo } from '../icons.js';
import { app, useConn, toast } from '../state.js';
import { popover, modal } from './layers.js';
import { MenuItem } from './common.js';
import { ConnBanner } from './conn.js';
import { ConfirmDialog } from './dialogs.js';
import { fmtBytes } from '../format.js';

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

// 저장 공간: 얇은 막대 하나(메모 · 드라이브 · Gmail·포토 · 남음)와 그 아래 이름·양
let lastQuota = null;
function Storage() {
  const [q, setQ] = useState(lastQuota);
  useEffect(() => {
    let alive = true;
    app.lib?.quota?.().then((v) => { if (alive && v) { lastQuota = v; setQ(v); } }).catch(() => { if (alive && !lastQuota) setQ('err'); });
    return () => { alive = false; };
  }, []);
  if (q === 'err') return html`<div class="quota"><div class="quota-head"><b>저장 공간</b><span class="grow"></span><span>불러오지 못함</span></div></div>`;
  if (!q) return html`<div class="quota sk-q" aria-busy="true"><div class="quota-head"><b>저장 공간</b></div><div class="qbar"></div></div>`;
  const app_ = Math.min(q.app, q.drive || q.app);
  const parts = [
    { key: 'app', label: '메모', v: app_, cls: 'q1' },
    { key: 'drive', label: '드라이브', v: Math.max(0, q.drive - app_), cls: 'q2' },
    { key: 'other', label: 'Gmail·포토', v: Math.max(0, q.used - Math.max(q.drive, app_)), cls: 'q3' },
  ];
  const whole = q.limit || q.used || 1;
  const left = q.limit ? Math.max(0, q.limit - q.used) : 0;
  const ratio = q.limit ? q.used / q.limit : 0;
  const total = q.limit ? `${fmtBytes(q.used)} / ${fmtBytes(q.limit)}` : `${fmtBytes(q.used)} · 무제한`;
  const label = `저장 공간 ${total}. ${parts.map((p) => `${p.label} ${fmtBytes(p.v)}`).join(', ')}${q.limit ? `, 남음 ${fmtBytes(left)}` : ''}`;
  return html`<div class="quota">
    <div class="quota-head"><b>저장 공간</b><span>${total}</span><span class="grow"></span>
      <a href="https://drive.google.com/settings/storage" target="_blank" rel="noopener">관리</a></div>
    <div class="qbar" role="img" aria-label=${label}>
      ${parts.filter((p) => p.v > 0).map((p) => html`<i key=${p.key} style=${`flex:0 0 ${(p.v / whole) * 100}%;background:var(--${p.cls})`} title=${`${p.label} ${fmtBytes(p.v)}`}></i>`)}
      ${q.limit > 0 && html`<i class="q-track" title=${`남음 ${fmtBytes(left)}`}></i>`}
    </div>
    <ul class="qlist">
      ${parts.map((p) => html`<li key=${p.key}><i class="qsw" style=${`background:var(--${p.cls})`}></i><span>${p.label}</span><b>${fmtBytes(p.v)}</b></li>`)}
      ${q.limit > 0 && html`<li><i class="qsw track"></i><span>남음</span><b>${fmtBytes(left)}</b></li>`}
    </ul>
    ${ratio >= 0.9 && html`<p class="quota-warn"><${Icon} name="alert" />${ratio >= 0.98 ? '공간이 꽉 찼어요' : '공간이 거의 찼어요'}</p>`}
  </div>`;
}

function AccountMenu({ close }) {
  const p = app.profile ?? {};
  const drive = app.lib?.adapter.kind === 'drive';
  const live = !drive || !!app.auth?.signedIn;
  const root = app.lib?.adapter.rootId;
  const folder = root ? `https://drive.google.com/drive/folders/${root}` : 'https://drive.google.com/drive/my-drive';
  const open = (url) => () => { close(); window.open(url, '_blank', 'noopener'); };
  const logout = () => { close(); modal((c) => html`<${ConfirmDialog} close=${c} title="로그아웃할까요?" text="이 기기의 사본만 지워요. 드라이브의 노트는 그대로예요." yes="로그아웃" danger onYes=${() => app.signOut()} />`); };
  return html`<div class="acct">
      <div class="acct-head"><span class="acct-pic"><${Avatar} size=${44} /></span><div class="acct-who"><b>${p.name || '내 계정'}</b>${p.email && html`<span>${p.email}</span>`}</div></div>
      <p class=${`acct-state ${live ? 'on' : 'off'}`}><i></i>${live ? '연결됨' : '연결 끊김'}
        ${!live && html`<button type="button" class="btn-link" onClick=${() => { close(); app.reconnect(); }}>다시 연결</button>`}</p>
    </div>
    <div class="mi-sep"></div>
    <${Storage} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="folder" label="메모 폴더 열기" onClick=${open(folder)} />
    <${MenuItem} icon="refresh" label="동기화" onClick=${() => { close(); toast('동기화 중'); app.resync(); }} />
    <${MenuItem} icon="external" label="구글 계정" onClick=${open('https://myaccount.google.com/')} />
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
