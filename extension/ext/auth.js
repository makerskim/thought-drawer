// 크롬 확장 프로그램의 구글 로그인. 웹앱과 같은 OAuth 클라이언트로 drive.file 권한만 받는다.
// 돌아올 주소는 https://<확장 번호>.chromiumapp.org/ 이고, 구글 클라우드의 클라이언트에 등록해 둬야 한다.
// 토큰(1시간)은 브라우저를 닫으면 사라지는 session 저장소에, 계정 정보는 local 저장소에 둔다.

import { GOOGLE_CLIENT_ID } from '../app/config.js';
import { DRIVE_SCOPE, AuthRequired } from '../app/store/auth.js';

const SCOPES = `${DRIVE_SCOPE} openid email profile`;
export const REDIRECT_URI = chrome.identity.getRedirectURL();

let state = null; // { token, exp, scope, email, name, picture }
chrome.storage.onChanged.addListener((changes) => {
  if ('td_token' in changes || 'td_profile' in changes) state = null;
});

async function load() {
  if (state) return state;
  const [{ td_token: t }, { td_profile: p }] = await Promise.all([
    chrome.storage.session.get('td_token'),
    chrome.storage.local.get('td_profile'),
  ]);
  state = { ...(p ?? {}), ...(t ?? {}) };
  return state;
}

async function store() {
  const { token, exp, scope, email, name, picture } = state;
  await Promise.all([
    chrome.storage.session.set({ td_token: token ? { token, exp, scope } : null }),
    chrome.storage.local.set({ td_profile: email ? { email, name, picture } : null }),
  ]);
}

const valid = () => !!state?.token && state.exp > Date.now() + 60_000;

// 구글이 돌려준 주소의 #access_token=... 을 읽는다
function readResponse(url, expect) {
  const p = new URLSearchParams(new URL(url).hash.slice(1));
  if (p.get('error')) {
    const e = new Error(p.get('error') === 'access_denied' ? '구글에서 허용하지 않았어요.' : `구글 로그인 오류: ${p.get('error')}`);
    e.code = p.get('error');
    throw e;
  }
  if (p.get('state') !== expect || !p.get('access_token')) throw new Error('구글 로그인 응답을 읽지 못했어요.');
  return { token: p.get('access_token'), exp: Date.now() + Number(p.get('expires_in') || 3600) * 1000, scope: p.get('scope') ?? '' };
}

// interactive=false: 창을 띄우지 않고 조용히 새 토큰을 받아 본다 (전에 허용했고 구글에 로그인돼 있으면 된다)
export async function signIn({ interactive = true, consent = false } = {}) {
  await load();
  const nonce = crypto.randomUUID();
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state: nonce,
  });
  if (state.email) p.set('login_hint', state.email);
  if (!interactive) p.set('prompt', 'none');
  else if (consent || !state.email) p.set('prompt', 'consent select_account');
  const opts = { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}`, interactive };
  if (!interactive) Object.assign(opts, { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 10_000 });
  let back;
  try {
    back = await chrome.identity.launchWebAuthFlow(opts);
  } catch (err) {
    if (!interactive) throw new AuthRequired();
    const e = new Error('구글 연결 창이 닫혔어요. 창에 「redirect_uri_mismatch」 오류가 보였다면 아래 주소를 구글 클라우드에 추가해 주세요.');
    e.code = 'auth_window';
    e.detail = String(err?.message ?? err);
    throw e;
  }
  Object.assign(state, readResponse(back, nonce));
  if (!state.scope.includes(DRIVE_SCOPE)) {
    await store();
    const e = new Error('드라이브 권한이 허용되지 않았어요. 다시 연결하면서 「Google Drive」 항목을 체크해 주세요.');
    e.code = 'scope';
    throw e;
  }
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${state.token}` } });
  if (r.ok) {
    const u = await r.json();
    Object.assign(state, { email: u.email, name: u.name, picture: u.picture });
  }
  await store();
  return profile();
}

export function profile() {
  return state?.email ? { email: state.email, name: state.name, picture: state.picture } : null;
}

export async function status() {
  await load();
  return { profile: profile(), connected: valid() };
}

// 드라이브 요청 전에 부른다. 토큰이 없거나 곧 끝나면 조용히 새로 받고, 안 되면 AuthRequired.
export async function ready() {
  await load();
  if (valid()) return;
  if (!state.email) throw new AuthRequired();
  await signIn({ interactive: false });
}

export async function signOut() {
  await load();
  const t = state.token;
  state = {};
  await store();
  if (t) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => {});
}

// 드라이브 저장소(app/store/drive.js)가 쓰는 모양
export const driveAuth = {
  token() {
    if (!valid()) throw new AuthRequired();
    return state.token;
  },
  expire() {
    if (state) state.exp = 0;
  },
  get profile() { return profile(); },
};
