// 구글 연결 이어 가기 시험: 가짜 구글(로그인·드라이브)로
// 1) 앱을 열 때 만료됐으면 화면 없이 다녀와서 보던 화면으로 돌아온다
// 2) 구글이 거절하면(로그인 풀림) 「다시 연결」 띠만 보이고 되풀이하지 않는다
// 3) 쓰는 중 끝나 가면 다음 클릭 때 작은 창으로 새로 받는다
// 실행: npm run serve 를 켜 둔 채 node tests/e2e/auth.e2e.cjs
const { launch, check } = require('./harness.cjs');
const ok = check();
const PORT = process.env.TD_PORT || 8080;
const ORIGIN = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
const GIS = `window.google = { accounts: { oauth2: {
  initTokenClient(cfg) { return { requestAccessToken(o) { (window.__gis = window.__gis || []).push(o);
    setTimeout(() => cfg.callback({ access_token: 'POP', expires_in: 3599, scope: ${JSON.stringify(SCOPE)} }), 30); } }; },
  revoke() {} } } };`;

async function start(b, { token, exp, hash = '#/', google = 'ok' }) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const log = { auth: [], bearer: new Set() };
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|www\.google\.com\/s2)\//, (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/^https:\/\/accounts\.google\.com\//, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/gsi/client')) return r.fulfill({ body: GIS, contentType: 'text/javascript' });
    log.auth.push(Object.fromEntries(u.searchParams));
    const back = u.searchParams.get('redirect_uri');
    const st = u.searchParams.get('state');
    const frag = google === 'ok'
      ? `access_token=NEW&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(SCOPE)}&state=${st}`
      : `error=interaction_required&state=${st}`;
    return r.fulfill({ status: 302, headers: { location: `${back}#${frag}` } });
  });
  let n = 0;
  await ctx.route(/^https:\/\/www\.googleapis\.com\//, (r) => {
    const req = r.request();
    log.bearer.add(req.headers().authorization);
    const u = new URL(req.url());
    if (u.pathname.includes('userinfo')) return r.fulfill({ json: { email: 'me@example.com', name: '나' } });
    if (req.method() === 'GET') return r.fulfill({ json: { files: [] } });
    return r.fulfill({ json: { id: `f${++n}`, name: 'x', parents: ['root'], mimeType: 'application/vnd.google-apps.folder', modifiedTime: new Date().toISOString() } });
  });
  await ctx.addInitScript(({ token, exp }) => {
    if (sessionStorage.getItem('seeded')) return; // 구글에 다녀온 뒤에는 다시 넣지 않는다
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('td.tutorialDone', 'true');
    localStorage.setItem('td.google', JSON.stringify({ token, exp: Date.now() + exp, email: 'me@example.com', name: '나', scope: 'https://www.googleapis.com/auth/drive.file openid email profile' }));
  }, { token, exp });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(`${ORIGIN}/${hash}`);
  return { p, ctx, log };
}
const saved = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('td.google')));

(async () => {
  const b = await launch();

  // 1) 열 때 만료 → 화면 없이 다녀옴
  let { p, ctx, log } = await start(b, { token: 'OLD', exp: -60_000, hash: '#/settings' });
  await p.waitForSelector('.set-page', { timeout: 15000 });
  const a = log.auth[0] ?? {};
  ok(log.auth.length === 1 && a.prompt === 'none' && a.login_hint === 'me@example.com' && a.state === 'td-renew' && a.response_type === 'token', 'open: expired → silent trip to Google (prompt=none, login_hint)');
  ok((await saved(p)).token === 'NEW' && (await p.evaluate(() => location.hash)) === '#/settings', 'open: new token, back on the same screen');
  ok(log.bearer.has('Bearer NEW') && !log.bearer.has('Bearer OLD'), 'open: Drive uses the new token');
  ok(await p.locator('.conn').count() === 0 && p.errors.length === 0, 'open: no banner, no errors ' + p.errors.join(' | '));
  await ctx.close();

  // 2) 구글이 거절 → 띠 하나, 되풀이 없음
  ({ p, ctx, log } = await start(b, { token: 'OLD', exp: -60_000, google: 'deny' }));
  await p.waitForSelector('.conn', { timeout: 15000 });
  await p.waitForTimeout(1500);
  ok(log.auth.length === 1, `denied: tried once, no loop (${log.auth.length})`);
  ok((await p.locator('.conn').innerText()).includes('다시 연결') && (await p.evaluate(() => location.hash)) === '#/', 'denied: banner with 다시 연결, address cleaned');
  await ctx.close();

  // 3) 쓰는 중 끝나 감 → 다음 클릭에 작은 창
  ({ p, ctx, log } = await start(b, { token: 'OLD2', exp: 2 * 60_000 }));
  await p.waitForSelector('.capbar textarea', { timeout: 15000 });
  ok(log.auth.length === 0, 'in use: still valid, no trip on open');
  await p.waitForFunction(() => !!window.google?.accounts?.oauth2, null, { timeout: 5000 });
  await p.click('.hero h1');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('td.google')).token === 'POP', null, { timeout: 5000 });
  const calls = await p.evaluate(() => window.__gis);
  ok(calls.length === 1 && calls[0].prompt === '', 'in use: one click renews quietly (popup with no prompt)');
  await p.click('.hero h1');
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => window.__gis.length)) === 1, 'in use: no more popups once renewed');
  ok(p.errors.length === 0, 'in use: no errors ' + p.errors.join(' | '));
  await ctx.close();

  await b.close();
})();
