// 폰 「공유」 시험: 가짜 구글 드라이브·가짜 구글 로그인으로, 아이폰 단축어·안드로이드 공유가 여는 주소를 그대로 열어
// 「실제로 드라이브의 어느 폴더에 무엇이 저장되는지」, 얼마나 걸리는지, 같은 것을 두 번 넣지 않는지 확인한다.
// 실행: npm run serve 를 켜 둔 채 node tests/e2e/share.e2e.cjs
const { launch, check } = require('./harness.cjs');
const { fakeDrive } = require('./fakedrive.cjs');
const ok = check();
const PORT = process.env.TD_PORT || 8080;
const ORIGIN = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
const FP = require('crypto').createHash('sha256').update('me@example.com').digest('hex');
const GIS = `window.google = { accounts: { oauth2: {
  initTokenClient(cfg) { return { requestAccessToken(o) { setTimeout(() => cfg.callback({ access_token: 'POP', expires_in: 3599, scope: ${JSON.stringify(SCOPE)} }), 30); } }; },
  revoke() {} } } };`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEKmBioDQDJPgP9pNMHlAAAAABJRU5ErkJggg==';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// 「사파리」 하나: 저장 공간(로그인·기기 사본)은 이 안의 탭끼리 함께 쓴다
async function safari(b, { drive, signedIn = true, exp = 3600e3, ua = IPHONE_UA } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, isMobile: true, hasTouch: true });
  const trips = [];
  await ctx.route(/\/js\/config\.js(\?.*)?$/, async (r) => {
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace(/export const OWNERS = \[[^\]]*\];/, `export const OWNERS = ['${FP}'];`) });
  });
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|www\.google\.com\/s2)\//, (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/^https:\/\/accounts\.google\.com\//, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/gsi/client')) return r.fulfill({ body: GIS, contentType: 'text/javascript' });
    trips.push(u.searchParams.get('state'));
    return r.fulfill({ status: 302, headers: { location: `${u.searchParams.get('redirect_uri')}#access_token=NEW&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(SCOPE)}&state=${u.searchParams.get('state')}` } });
  });
  await ctx.route(/^https:\/\/www\.googleapis\.com\//, (r) => drive.handle(r));
  await ctx.addInitScript(({ signedIn, exp }) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('td.tutorialDone', 'true');
    if (signedIn) localStorage.setItem('td.google', JSON.stringify({ token: 'TOK', exp: Date.now() + exp, email: 'me@example.com', name: '나', scope: 'https://www.googleapis.com/auth/drive.file openid email profile' }));
  }, { signedIn, exp });
  const tab = async (path) => {
    const p = await ctx.newPage();
    p.errors = [];
    p.on('pageerror', (e) => p.errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|net::|404/.test(m.text())) p.errors.push(m.text()); });
    p.t0 = Date.now();
    await p.goto(`${ORIGIN}/${path}`);
    return p;
  };
  return { ctx, tab, trips };
}

// 드라이브에 새로 생긴 노트가 나타날 때까지 (공유 하나가 끝날 때까지)
async function until(fn, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
  return null;
}
const inboxNote = (drive, pred) => drive.notes().find((n) => n.path.startsWith('메모/00_인박스/') && pred(n.text));
const stray = (drive) => drive.paths().filter((p) => !p.startsWith('메모/') && p !== '메모');
const secs = (p) => ((Date.now() - p.t0) / 1000).toFixed(1);

(async () => {
  const b = await launch();

  // 1) 사파리 → 메모로 보내기 (로그인돼 있음, 이 사파리에서 앱을 처음 여는 탭: 기기 사본 없음, 드라이브에 노트 300개)
  //    공유는 드라이브 전체 목록을 다 받기 전에 바로 저장해야 한다 (사파리는 오래 안 쓰면 기기 사본을 지운다)
  {
    const drive = fakeDrive(); drive.seed(300);
    const s = await safari(b, { drive });
    const p = await s.tab(`?text=${encodeURIComponent('https://www.musinsa.com/products/4242')}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('musinsa.com/products/4242')));
    const took = (Date.now() - p.t0) / 1000;
    ok(!!n && took < 3, `safari link (first tab, 300 notes on Drive): saved to 메모/00_인박스 in ${took.toFixed(1)}s (under 3s)`);
    ok(n && /type: "bookmark"/.test(n.text) && /site: "무신사"/.test(n.text), 'safari link: link note with the site name');
    ok(stray(drive).length === 0, `safari link: nothing saved outside 메모 (${stray(drive).join(', ')})`);
    await p.waitForSelector('.props', { timeout: 15000 });
    ok(p.errors.length === 0, 'safari link: no page errors ' + p.errors.join(' | '));
    await s.ctx.close();
  }

  // 2) 앱을 써 오던 사파리(기기 사본 있음) → 새 탭으로 공유: 동기화보다 저장이 먼저 시작돼도 제자리에
  {
    const drive = fakeDrive(); drive.seed(30);
    const s = await safari(b, { drive });
    const home = await s.tab('');
    await home.waitForSelector('.hero', { timeout: 15000 });
    await home.waitForTimeout(1500);
    await home.close();
    const p = await s.tab(`?text=${encodeURIComponent('https://www.instagram.com/reel/DAbc123/?igsh=MTc4bW9xZGxyZGx6Nw==')}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('instagram.com/reel/DAbc123')));
    ok(!!n, `safari (cached) instagram reel: saved in ${secs(p)}s`);
    ok(n && /type: "instagram"/.test(n.text) && n.text.includes('[instagram.com/reel/DAbc123](https://www.instagram.com/reel/DAbc123/)') && !n.text.includes('저장했어요') && !n.text.includes('igsh'), 'instagram reel: the clean reel link is in the note (no tracking part, no app sentence)');
    ok(stray(drive).length === 0 && drive.paths().filter((x) => x === '메모/00_인박스').length === 1, `instagram reel: one inbox folder, nothing outside 메모 (${stray(drive).join(', ')})`);
    // 같은 받기 주소를 다시 열어도(새로고침) 두 번 넣지 않는다
    const before = drive.notes().length;
    await p.reload();
    await p.waitForTimeout(2500);
    ok(drive.notes().length === before, `reload after a share does not save it twice (${before} → ${drive.notes().length})`);
    await s.ctx.close();
  }

  // 3) 열쇠(1시간)가 지난 사파리 → 구글에 화면 없이 다녀와서 저장
  {
    const drive = fakeDrive(); drive.seed(10);
    const s = await safari(b, { drive, exp: -60e3 });
    const p = await s.tab(`?text=${encodeURIComponent('https://blog.naver.com/abc/223')}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('blog.naver.com/abc/223')));
    ok(!!n && s.trips.length === 1 && s.trips[0] === 'td-renew', `expired token: one silent trip to Google, then saved in ${secs(p)}s`);
    await s.ctx.close();
  }

  // 4) 인스타 앱 → 메모로 보내기 (URL 인코딩 없이 만든 단축어: 주소 속 & 까지)
  {
    const drive = fakeDrive(); drive.seed(5);
    const s = await safari(b, { drive });
    const raw = 'https://www.instagram.com/reel/DXyz789/?utm_source=ig_web_copy_link&igsh=b2xxeA==';
    const p = await s.tab(`?text=${raw}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('instagram.com/reel/DXyz789')));
    ok(n && n.text.includes('source: "https://www.instagram.com/reel/DXyz789/"'), `instagram (no URL 인코딩): the reel is found even with & in the address, in ${secs(p)}s`);
    await s.ctx.close();
  }

  // 5) 네이버 쇼핑 앱 → 메모로 보내기 (상품 이름 + 짧은 주소, 줄 바꿈 → URL 인코딩)
  {
    const drive = fakeDrive(); drive.seed(5);
    const s = await safari(b, { drive });
    const p = await s.tab(`?text=${encodeURIComponent('[네이버 쇼핑] 오버핏 린넨 셔츠 화이트\nhttps://naver.me/Gx1234')}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('naver.me/Gx1234')));
    ok(n && /title: "오버핏 린넨 셔츠 화이트"/.test(n.text), `naver shopping: product name becomes the title in ${secs(p)}s`);
    await s.ctx.close();
  }

  // 6) 스크린샷 → 사진 보내기 (Base64 → URL 인코딩, 줄 바꿈 섞임): 사진은 _첨부, 노트는 인박스
  {
    const drive = fakeDrive(); drive.seed(40);
    const s = await safari(b, { drive });
    const b64 = PNG.replace(/(.{20})/g, '$1\n');
    const p = await s.tab(`#img=${encodeURIComponent(b64)}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('type: "capture"')));
    const att = drive.paths().filter((x) => x.startsWith('메모/_첨부/'));
    ok(!!n && att.length === 1 && n.text.includes(`![[${att[0].split('/').pop()}]]`), `screenshot: photo in 메모/_첨부, note in the inbox in ${secs(p)}s`);
    ok(!(await p.evaluate(() => location.href)).includes('iVBOR'), 'screenshot: the long photo address is cleared');
    // 같은 탭에서 한 장 더 (주소의 # 뒤만 바뀜)
    await p.evaluate((h) => { location.hash = h; }, `#img=${encodeURIComponent(PNG)}`);
    const two = await until(() => (drive.notes().filter((x) => x.text.includes('type: "capture"')).length === 2 ? true : null));
    ok(!!two, 'screenshot: a second photo in the same tab is saved too');
    ok(stray(drive).length === 0 && p.errors.length === 0, `screenshot: nothing outside 메모, no errors ${p.errors.join(' | ')}`);
    await s.ctx.close();
  }

  // 7) 스크린샷 + 열쇠가 지난 사파리: 구글에 다녀와도 사진이 남아 있다
  {
    const drive = fakeDrive(); drive.seed(5);
    const s = await safari(b, { drive, exp: -60e3 });
    const p = await s.tab(`#img=${encodeURIComponent(PNG)}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('type: "capture"')));
    ok(!!n && s.trips.length === 1, `screenshot + expired token: saved after the trip to Google in ${secs(p)}s`);
    await s.ctx.close();
  }

  // 8) 처음 쓰는 사파리(로그인 안 됨): 로그인하면 그 공유가 이어서 저장된다
  {
    const drive = fakeDrive(); drive.seed(5);
    const s = await safari(b, { drive, signedIn: false });
    const p = await s.tab(`?text=${encodeURIComponent('https://www.coupang.com/vp/products/77')}`);
    await p.waitForSelector('button:has-text("Google")', { timeout: 15000 });
    await p.click('button:has-text("Google")');
    const n = await until(() => inboxNote(drive, (t) => t.includes('coupang.com/vp/products/77')));
    ok(!!n, 'not signed in: after signing in, the shared link is saved');
    await s.ctx.close();
  }

  // 9) 메모 앱 글 → 메모로 보내기 (URL 인코딩)
  {
    const drive = fakeDrive(); drive.seed(5);
    const s = await safari(b, { drive });
    const p = await s.tab(`?text=${encodeURIComponent('내일 3시 치과 예약\n강남역 2번 출구')}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('강남역 2번 출구')));
    ok(n && /type: "memo"/.test(n.text), `notes app text: saved as a memo in ${secs(p)}s`);
    await s.ctx.close();
  }

  // 10) 다른 인터넷 앱(아이폰 크롬)이 기본 브라우저일 때: 단축어가 크롬으로 열어도 같다
  {
    const drive = fakeDrive(); drive.seed(20);
    const s = await safari(b, { drive, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1' });
    const p = await s.tab(`?text=${encodeURIComponent('https://map.naver.com/p/entry/place/1234567')}`);
    const n = await until(() => inboxNote(drive, (t) => t.includes('map.naver.com/p/entry/place/1234567')));
    ok(!!n && stray(drive).length === 0, `chrome on iPhone: saved in ${secs(p)}s`);
    await s.ctx.close();
  }

  await b.close();
})();
