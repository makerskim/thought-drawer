// 구글 로그인. 앱이 만든 파일에만 접근하는 drive.file 권한만 받는다.
// 일반 브라우저는 팝업, 아이폰 홈 화면 앱은 팝업이 막히기 쉬워 페이지 이동 방식으로 로그인한다.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `${DRIVE_SCOPE} openid email profile`;
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

  // scope: 사용자가 실제로 허용한 권한 (구글 동의 화면에서 드라이브 체크를 뺄 수 있다)
  function accept(token, expiresIn, scope) {
    state = { ...(state ?? {}), token, exp: Date.now() + Number(expiresIn || 3600) * 1000, scope: scope ?? state?.scope ?? '' };
    write(state);
  }

  async function signInPopup({ consent = false } = {}) {
    if (!window.google?.accounts?.oauth2) await loadScript('https://accounts.google.com/gsi/client');
    await new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        login_hint: state?.email,
        callback: (r) => (r.error ? reject(new Error(r.error_description || r.error)) : (accept(r.access_token, r.expires_in, r.scope), resolve())),
        error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? '로그인 창이 닫혔어요.' : '로그인 창을 열지 못했어요. 팝업 차단을 풀어 주세요.')),
      });
      client.requestAccessToken({ prompt: consent || !state?.email ? 'consent' : '' });
    });
    await fetchProfile();
  }

  function signInRedirect({ consent = false } = {}) {
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: location.origin + location.pathname,
      response_type: 'token',
      scope: SCOPES,
      include_granted_scopes: 'true',
      state: 'td-login',
    });
    if (state?.email) p.set('login_hint', state.email);
    if (consent) p.set('prompt', 'consent');
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  }

  return {
    get configured() { return !!clientId; },
    clientId,
    get profile() { return state && { email: state.email, name: state.name, picture: state.picture }; },
    get signedIn() { return valid(); },
    get everSignedIn() { return !!state?.email; },
    // 로그인 페이지에서 돌아왔을 때 주소의 #access_token=... 을 읽는다
    async handleRedirect() {
      if (!location.hash.includes('access_token=')) return false;
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.get('state') !== 'td-login') return false;
      accept(p.get('access_token'), p.get('expires_in'), p.get('scope'));
      history.replaceState(null, '', location.pathname + location.search);
      await fetchProfile();
      return true;
    },
    // 드라이브 권한까지 허용했는지 (예전 로그인 기록에는 정보가 없으니 있다고 본다)
    get hasDrive() { return !state?.scope || state.scope.includes(DRIVE_SCOPE); },
    async signIn(opts = {}) {
      if (isStandalone()) return signInRedirect(opts);
      return signInPopup(opts);
    },
    signInRedirect,
    // 자동 정리기(Claude Code 예약 작업)용 오래가는 토큰 받기.
    // 보안 비밀은 이 브라우저에서 구글로만 보내고 저장하지 않는다.
    requestOfflineCode(secret) {
      sessionStorage.setItem('td.sec', secret);
      const p = new URLSearchParams({
        client_id: clientId,
        redirect_uri: location.origin + location.pathname,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline',
        prompt: 'consent',
        state: 'td-code',
      });
      if (state?.email) p.set('login_hint', state.email);
      location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
    },
    async takeOfflineCode() {
      const q = new URLSearchParams(location.search);
      if (q.get('state') !== 'td-code') return null;
      const secret = sessionStorage.getItem('td.sec');
      sessionStorage.removeItem('td.sec');
      history.replaceState(null, '', `${location.pathname}#/settings`);
      if (q.get('error') || !q.get('code')) return { error: '구글에서 허용하지 않았어요. 다시 시도해 주세요.' };
      if (!secret) return { error: '보안 비밀이 사라졌어요. 같은 창에서 다시 시도해 주세요.' };
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: q.get('code'), client_id: clientId, client_secret: secret,
            redirect_uri: location.origin + location.pathname, grant_type: 'authorization_code',
          }),
        });
        const j = await r.json();
        if (!r.ok || !j.refresh_token) return { error: `토큰을 받지 못했어요: ${j.error_description || j.error || r.status}` };
        return { refreshToken: j.refresh_token };
      } catch {
        return { error: '구글에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' };
      }
    },
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
