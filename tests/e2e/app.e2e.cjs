// 화면 시험: 1) 쉽게 넣기 2) 어느 기기에서나 3) 무엇이든 담기 4) 자동 분류, 그리고 노트·할 일·안내
// 실행: npm run serve 를 켜 둔 채 node tests/e2e/app.e2e.cjs
const { open, launch, check } = require('./harness.cjs');
const ok = check();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEKmBioDQDJPgP9pNMHlAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const b = await launch();
  let p = await open(b);
  await p.waitForSelector('.drawers .dtile');
  const notes = () => p.evaluate(() => window.__TD_APP__.lib.all.map((n) => ({ id: n.id, title: n.meta.title ?? '', type: n.meta.type, status: n.meta.status, category: n.meta.category ?? '', source: n.meta.source ?? '', body: n.body ?? '', tags: n.meta.tags ?? [], daily: n.meta.daily })));
  const drawers = () => p.$$eval('.dtile', (els) => els.map((e) => [e.querySelector('b').textContent, Number(e.querySelector('.dt-n').textContent)]));
  const box = '.capture textarea';

  // ---- 첫 화면: 넣는 칸, 오늘, 자동으로 나뉜 서랍 ----
  ok(await p.locator('.capture').count() === 1 && await p.locator('.today').count() === 1, 'home: capture box and today card');
  let d = Object.fromEntries(await drawers());
  ok(d['쇼핑'] >= 1 && d['일·업무'] >= 1 && d['요리'] >= 3, `home: inbox notes auto-sorted into drawers ${JSON.stringify(d)}`);
  ok(await p.locator('.drawer.is-home .add-btn').isHidden(), 'home (PC): no duplicate add button in the header');

  // ---- 1. 쉽게 넣기: 적고 Enter, 미리 보이는 서랍, 되돌리기 ----
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.activeElement?.matches('.capture textarea')), 'Enter on the home screen puts the cursor in the box');
  await p.keyboard.type('김치찌개 레시피 메모');
  ok((await p.locator('.cap-guess').innerText()).includes('요리'), 'box previews the drawer while typing');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  let n = (await notes()).find((x) => x.body.includes('김치찌개 레시피 메모'));
  ok(n && (await p.inputValue(box)) === '', 'Enter saves and clears the box');
  ok(await p.locator('.toast', { hasText: '요리 서랍에 넣었어요' }).count() === 1, 'toast names the drawer');
  await p.locator('.toast', { hasText: '서랍에 넣었어요' }).last().locator('button').click();
  await p.waitForTimeout(400);
  ok(!(await notes()).some((x) => x.body.includes('김치찌개 레시피 메모')), 'undo removes it');
  await p.fill(box, 'https://www.agoda.com/ko-kr/hotel 다음 달 숙소');
  ok((await p.locator('.cap-hint').innerText()).includes('링크로 넣어요') && (await p.locator('.cap-guess').innerText()).includes('여행'), 'link hint + 여행 guess');
  await p.click('.cap-save');
  await p.waitForTimeout(300);
  ok((await notes()).some((x) => x.type === 'bookmark' && x.source === 'https://www.agoda.com/ko-kr/hotel'), 'link becomes a bookmark note');

  // ---- 3. 무엇이든 담기: 붙여넣기 단추, 사진, 브라우저 단추(공유), 북마크 파일 ----
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
  await p.evaluate(() => navigator.clipboard.writeText('https://www.youtube.com/watch?v=abc 나중에 볼 영상'));
  await p.click('.cap-btn:has-text("붙여넣기")');
  await p.waitForTimeout(200);
  ok((await p.inputValue(box)).startsWith('https://www.youtube.com/watch?v=abc') && (await p.locator('.cap-guess').innerText()).includes('영상'), 'paste button fills the box from the clipboard');
  await p.fill(box, '');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.cap-btn:has-text("사진·캡처")')]);
  await chooser.setFiles([{ name: 'shot.png', mimeType: 'image/png', buffer: PNG }]);
  await p.waitForSelector('.toast:has-text("사진을 넣었어요")');
  ok((await notes()).some((x) => x.type === 'capture' && x.status === 'inbox'), 'photo button saves a screenshot');

  await p.evaluate(() => { location.hash = '#/share?via=browser&url=' + encodeURIComponent('https://www.10000recipe.com/recipe/42') + '&title=' + encodeURIComponent('된장찌개 끓이는 법') + '&text=' + encodeURIComponent('멸치 육수 먼저'); });
  await p.waitForSelector('.sheet .note-title');
  n = (await notes()).find((x) => x.source === 'https://www.10000recipe.com/recipe/42');
  ok(n && n.title === '된장찌개 끓이는 법' && n.body.includes('멸치 육수 먼저'), 'browser button/share keeps url, title and selection');
  ok((await p.locator('.sheet .mpill.auto').innerText()).includes('요리'), 'shared page lands in 요리 (auto)');
  await p.keyboard.press('Escape');

  await p.evaluate(() => { location.hash = '#/bookmarks'; });
  await p.waitForSelector('.dropzone input');
  const bm = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p><DT><H3>북마크바</H3><DL><p>
    <DT><A HREF="https://www.musinsa.com/app/goods/1" ADD_DATE="1700000000">겨울 패딩</A>
    <DT><H3>여행</H3><DL><p><DT><A HREF="https://www.airbnb.co.kr/rooms/9">강릉 숙소</A></DL><p>
    <DT><A HREF="https://brunch.co.kr/@jeju/42">이미 있는 글</A>
    <DT><A HREF="https://example.org/plain">아무 페이지</A></DL><p></DL>`;
  await p.setInputFiles('.dropzone input', { name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(bm) });
  await p.waitForSelector('.preview-groups .chip');
  ok((await p.locator('.banner').innerText()).includes('링크 3개') && (await p.locator('.banner').innerText()).includes('이미 있는 1개'), 'bookmark file: 3 new, 1 already there');
  ok((await p.locator('.preview-groups').innerText()).includes('여행'), 'bookmark file: drawer preview before importing');
  await p.click('.btn-primary:has-text("넣기")');
  await p.waitForSelector('.empty:has-text("링크 3개를 넣었어요")');
  const imported = (await notes()).filter((x) => /musinsa|airbnb|example\.org/.test(x.source));
  ok(imported.length === 3 && imported.find((x) => x.source.includes('airbnb')).tags.includes('여행') && imported.find((x) => x.source.includes('musinsa')).id.startsWith('2023'), 'bookmarks imported with folder tag and original date');

  // ---- 2·3. 넣는 방법 화면: 휴대폰 앱, 웹사이트(브라우저 단추·확장), 사진, 가져오기 ----
  await p.evaluate(() => { location.hash = '#/connect'; });
  await p.waitForSelector('.tabs-row');
  ok(await p.locator('.tabs-row button').count() === 4, 'how-to-add page has 4 tabs');
  ok((await p.locator('.bm-btn').getAttribute('href')).startsWith('javascript:') && (await p.locator('.bm-btn').getAttribute('href')).includes('#/share?via=browser'), 'browser button (bookmarklet) points at the share route');
  await p.click('.tabs-row button:has-text("휴대폰 앱")');
  ok((await p.locator('.connect-card').first().innerText()).includes('링크 복사'), 'phone tab explains copy → paste');
  await p.click('.pb-back');

  // ---- 4. 자동 분류: 서랍 화면, 이유, 바꾸면 배우기 ----
  await p.waitForSelector('.dtile');
  await p.click('.dtile:has-text("쇼핑")');
  await p.waitForSelector('.scope-head h1');
  ok((await p.locator('.scope-head h1').innerText()) === '쇼핑' && (await p.locator('.sh-note').count()) === 1, 'drawer view with auto note explanation');
  await p.locator('.wall .mcard', { hasText: 'coupang' }).click();
  await p.waitForSelector('.sheet .auto-why');
  ok((await p.locator('.sheet .auto-why').innerText()).includes('coupang.com'), 'note says why it was sorted (coupang.com 링크)');
  await p.click('.sheet .mpill.auto');
  await p.keyboard.type('집·생활');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  n = (await notes()).find((x) => x.source.includes('coupang'));
  ok(n.status === 'organized' && n.category === '집·생활', 'changing the drawer files it for real');
  ok(await p.locator('.sheet .mpill.auto').count() === 0, 'no longer marked 자동');
  await p.keyboard.press('Escape');
  await p.click('.back-link');
  await p.waitForSelector('.dtile');
  d = Object.fromEntries(await drawers());
  ok(d['집·생활'] >= 1, 'new drawer shows on the home screen');

  // ---- 찾기, 종류, 보기 ----
  await p.click('.search input');
  await p.keyboard.type('막국수');
  await p.waitForTimeout(300);
  ok(await p.locator('.wall .mcard').count() === 1 && (await p.locator('.found').innerText()).includes('찾은 노트 1개'), 'search filters all notes');
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.sheet .note-title');
  ok((await p.inputValue('.sheet .note-title')) === '들기름 막국수', 'search → open note');
  await p.keyboard.press('Escape');
  await p.click('.search input');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ok((await p.inputValue('.search input')) === '' && await p.locator('.capture').count() === 1, 'Esc clears search, home is back');
  await p.click('.type-chips .chip:has-text("링크")');
  await p.waitForTimeout(200);
  const types = await p.$$eval('.latest .wall .mcard', (els) => els.map((a) => window.__TD_APP__.lib.get(decodeURIComponent(a.getAttribute('href').split('/n/')[1])).meta.type));
  ok(types.length > 0 && types.every((t) => t === 'bookmark'), `type chip: links only (${types.length})`);
  await p.click('.type-chips .chip:has-text("전체")');
  await p.click('.view-btn');
  await p.click('.pop .mi:has-text("목록")');
  await p.waitForSelector('.rows .row');
  ok(await p.locator('.rows .row').count() > 5, 'view menu switches to list');
  await p.click('.view-btn');
  await p.click('.pop .mi:has-text("카드")');

  // ---- 오늘과 할 일 ----
  await p.click('.today-btn');
  await p.waitForSelector('.sheet .ProseMirror ul[data-type="taskList"] li');
  ok((await notes()).filter((x) => x.daily).length === 1, 'today button makes one daily note');
  await p.keyboard.press('Escape');
  const before = (await p.locator('.today-tasks li').count());
  await p.locator('.today-tasks input').first().click();
  await p.waitForTimeout(400);
  ok((await notes()).find((x) => x.title === '분기 회의 준비').body.includes('- [x] 지난 분기 숫자 정리'), `checking a task on the today card marks the note (${before} shown)`);

  // ---- 넣기 창(서랍 밖에서는 Enter가 가운데 창) ----
  await p.click('.dtile:has-text("요리")');
  await p.waitForSelector('.scope-head');
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter');
  await p.waitForSelector('.composer textarea');
  ok(true, 'Enter inside a drawer opens the centered box');
  await p.keyboard.press('Escape');
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 사용법 안내 ----
  p = await open(b, { tutorial: true });
  await p.waitForSelector('.tour-card', { timeout: 8000 });
  ok(await p.locator('.tour-count i').count() === 7, 'tutorial: 7 steps');
  const targets = [];
  for (const sel of ['.capture', '.drawers', '.today', '.search', '.drawer .me']) {
    await p.click('.tour-card .btn-primary');
    await p.waitForTimeout(500);
    const [h, t] = [await p.locator('.tour-hole').boundingBox(), await p.locator(sel).first().boundingBox()];
    targets.push(h && t && h.x <= t.x + 1 && h.y <= t.y + 1 && h.x + h.width >= t.x + t.width - 1);
  }
  ok(targets.every(Boolean), `tutorial spotlights each part ${JSON.stringify(targets)}`);
  await p.click('.tour-card .btn:has-text("넘기기")');
  ok(await p.evaluate(() => localStorage.getItem('td.tutorialDone')) === 'true', 'tutorial remembered');
  await p.context().close();

  // ---- 2. 휴대폰 ----
  p = await open(b, { viewport: { width: 390, height: 844 } });
  await p.waitForSelector('.drawers .dtile');
  const fab = await p.locator('.add-btn').boundingBox();
  ok(fab && fab.y > 740 && Math.abs(fab.x + fab.width / 2 - 195) < 3, 'phone: add button floats at the bottom middle');
  const cap = await p.locator('.capture').boundingBox();
  ok(cap && cap.width > 340, 'phone: capture box fills the width');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no sideways scroll');
  await p.click('.add-btn');
  await p.waitForSelector('.composer textarea');
  await p.keyboard.type('폰에서 적은 메모');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__TD_APP__.lib.all.some((n) => (n.body ?? '').includes('폰에서 적은 메모'))), 'phone: add button → box → saved');
  await p.locator('.wall .mcard').first().click();
  await p.waitForSelector('.sheet');
  const sb = await p.locator('.sheet').boundingBox();
  ok(sb && Math.round(sb.width) === 390 && sb.x === 0, 'phone: note opens full screen');
  ok(p.errors.length === 0, 'phone: no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 밤 화면, 빈 서랍 ----
  p = await open(b, { dark: true, seedData: { profile: { name: '나', email: 'me@example.com' }, files: [] } });
  await p.waitForSelector('.ways .way');
  ok(await p.locator('.ways .way').count() === 6 && await p.locator('.capture.big').count() === 1, 'empty drawer: big box + six ways to add');
  ok(p.errors.length === 0, 'dark/empty: no page errors ' + p.errors.join(' | '));
  await b.close();
})();
