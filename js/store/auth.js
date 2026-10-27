// 구글 로그인. 앱이 만든 파일에만 접근하는 drive.file 권한만 받는다.
// 일반 브라우저는 팝업, 아이폰 홈 화면 앱은 팝업이 막히기 쉬워 페이지 이동 방식으로 로그인한다.

const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';
const KEY = 'td.google';

export class AuthRequired extends Error {
  constructor() { super('구글 연결이 끊겼어요. 다시 연결해 주세요.'); this.code = 'auth_required'; }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('구글 로그인 스크립트를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    document.head.append(s);
  });
}

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* 저장 불가 */ } };

export function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
}

export function createAuth(clientId) {
  let state = read();

  const valid = () => !!state?.token && state.exp > Date.now() + 60_000;

  async function fetchProfile() {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${state.token}` } });
    if (r.ok) {
      const p = await r.json();
      state = { ...state, email: p.email, name: p.name, picture: p.picture };
      write(state);
    }
  }

  function accept(token, expiresIn) {
    state = { ...(state ?? {}), token, exp: Date.now() + Number(expiresIn || 3600) * 1000 };
    write(state);
  }

  async function signInPopup() {
    if (!window.google?.accounts?.oauth2) await loadScript('https://accounts.google.com/gsi/client');
    await new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        login_hint: state?.email,
        callback: (r) => (r.error ? reject(new Error(r.error_description || r.error)) : (accept(r.access_token, r.expires_in), resolve())),
        error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? '로그인 창이 닫혔어요.' : '로그인 창을 열지 못했어요.')),
      });
      client.requestAccessToken({ prompt: state?.email ? '' : 'consent' });
    });
    await fetchProfile();
  }

  function signInRedirect() {
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: location.origin + location.pathname,
      response_type: 'token',
      scope: SCOPES,
      include_granted_scopes: 'true',
      state: 'td-login',
    });
    if (state?.email) p.set('login_hint', state.email);
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  }

  return {
    get configured() { return !!clientId; },
    get profile() { return state && { email: state.email, name: state.name, picture: state.picture }; },
    get signedIn() { return valid(); },
    get everSignedIn() { return !!state?.email; },
    // 로그인 페이지에서 돌아왔을 때 주소의 #access_token=... 을 읽는다
    async handleRedirect() {
      if (!location.hash.includes('access_token=')) return false;
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.get('state') !== 'td-login') return false;
      accept(p.get('access_token'), p.get('expires_in'));
      history.replaceState(null, '', location.pathname + location.search);
      await fetchProfile();
      return true;
    },
    async signIn() {
      if (isStandalone()) return signInRedirect();
      return signInPopup();
    },
    signInRedirect,
    token() {
      if (!valid()) throw new AuthRequired();
      return state.token;
    },
    expire() { if (state) { state.exp = 0; write(state); } },
    signOut() {
      try { if (state?.token) window.google?.accounts?.oauth2?.revoke(state.token, () => {}); } catch { /* 무시 */ }
      state = null;
      write(null);
    },
  };
}
