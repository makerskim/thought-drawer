// 구글 로그인. 앱이 만든 파일에만 접근하는 drive.file 권한만 받는다.
// 일반 브라우저는 팝업, 아이폰 홈 화면 앱은 팝업이 막히기 쉬워 페이지 이동 방식으로 로그인한다.
// 서버 없는 웹앱이 받는 구글 열쇠(access token)는 한 시간짜리다. 그래서 저절로 다시 받는다:
//  - 앱을 열 때 만료됐으면 구글에 잠깐 다녀온다(prompt=none: 구글에 로그인돼 있으면 화면 없이 바로 돌아온다)
//  - 쓰는 중에 끝나 가면 다음 클릭 때 작은 창이 잠깐 떴다 닫힌다(이미 허용했으면 누를 것 없음)

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `${DRIVE_SCOPE} openid email profile`;
const KEY = 'td.google';
const BACK = 'td.back'; // 구글에 다녀오기 전 보던 화면
const FAIL = 'td.renewFail'; // 저절로 다시 받기에 실패한 때 (10분 동안은 다시 시도하지 않는다)
const ss = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* 저장 불가 */ } },
};

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
  let renewing = null; // 다시 받는 중이면 그 약속 (드라이브 요청은 끝날 때까지 기다린다)
  const gisReady = () => !!window.google?.accounts?.oauth2;
  const preload = () => (gisReady() ? Promise.resolve() : loadScript('https://accounts.google.com/gsi/client'));

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
    if (!gisReady()) await preload();
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

  function redirect({ consent = false, silent = false } = {}) {
    ss.set(BACK, location.hash.startsWith('#/') ? location.hash : '');
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: location.origin + location.pathname,
      response_type: 'token',
      scope: SCOPES,
      include_granted_scopes: 'true',
      state: silent ? 'td-renew' : 'td-login',
    });
    if (state?.email) p.set('login_hint', state.email);
    if (consent) p.set('prompt', 'consent');
    else if (silent) p.set('prompt', 'none'); // 화면 없이: 로그인·허용이 필요하면 오류로 돌아온다
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  }
  const signInRedirect = (opts = {}) => redirect(opts);

  return {
    get configured() { return !!clientId; },
    clientId,
    get profile() { return state && { email: state.email, name: state.name, picture: state.picture }; },
    get signedIn() { return valid(); },
    get everSignedIn() { return !!state?.email; },
    // 구글에서 돌아왔을 때 주소의 #access_token=... (또는 #error=...) 을 읽고, 보던 화면으로 되돌린다
    async handleRedirect() {
      if (!/^#(.*&)?(access_token|error)=/.test(location.hash)) return false;
      const p = new URLSearchParams(location.hash.slice(1));
      const st = p.get('state');
      if (st !== 'td-login' && st !== 'td-renew') return false;
      const back = ss.get(BACK) || '';
      ss.set(BACK, null);
      history.replaceState(null, '', location.pathname + location.search + back);
      if (p.get('error') || !p.get('access_token')) { ss.set(FAIL, String(Date.now())); return false; }
      accept(p.get('access_token'), p.get('expires_in'), p.get('scope'));
      ss.set(FAIL, null);
      await fetchProfile();
      return true;
    },
    // 저절로 다시 받아도 되는지: 예전에 로그인했고, 인터넷이 되고, 최근 10분 안에 실패하지 않았을 때
    get canAutoRenew() {
      if (!clientId || !state?.email || navigator.onLine === false) return false;
      return Date.now() - Number(ss.get(FAIL) || 0) > 10 * 60_000;
    },
    get msLeft() { return state?.token && state.exp ? state.exp - Date.now() : 0; },
    get renewing() { return !!renewing; },
    get canPopup() { return gisReady(); },
    preload,
    // 앱을 열 때: 구글에 잠깐 다녀오기 (로그인돼 있으면 화면 없이 바로 돌아온다)
    renewRedirect() { redirect({ silent: true }); },
    // 쓰는 중: 클릭 한 번 안에서 불러야 창이 막히지 않는다. 이미 허용했으면 창이 저절로 닫힌다.
    renewPopup() {
      if (renewing) return renewing;
      if (!gisReady()) return Promise.reject(new Error('구글 로그인 스크립트를 아직 못 받았어요.'));
      renewing = signInPopup().then(() => { ss.set(FAIL, null); }, (e) => { ss.set(FAIL, String(Date.now())); throw e; })
        .finally(() => { renewing = null; });
      return renewing;
    },
    // 드라이브 요청 전에: 다시 받는 중이면 끝날 때까지 기다린다
    ready() { return renewing ? renewing.catch(() => {}) : Promise.resolve(); },
    // 드라이브 권한까지 허용했는지 (예전 로그인 기록에는 정보가 없으니 있다고 본다)
    get hasDrive() { return !state?.scope || state.scope.includes(DRIVE_SCOPE); },
    async signIn(opts = {}) {
      if (renewing && !opts.consent) return renewing;
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
