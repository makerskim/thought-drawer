// 화면 시험: 1) 쉽게 넣기 2) 어느 기기에서나 3) 무엇이든 담기 4) 자동 분류,
// 그리고 애플식 위 막대·첫 화면, 넷플릭스식 서랍 줄, 옵시디언식 노트 작업 공간, 빠른 실행, 할 일, 안내
// 실행: npm run serve 를 켜 둔 채 npm run e2e
const { open, launch, check } = require('./harness.cjs');
const ok = check();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEKmBioDQDJPgP9pNMHlAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const b = await launch();
  let p = await open(b);
  await p.waitForSelector('.row .poster');
  const notes = () => p.evaluate(() => window.__TD_APP__.lib.all.map((n) => ({ id: n.id, title: n.meta.title ?? '', type: n.meta.type, status: n.meta.status, category: n.meta.category ?? '', source: n.meta.source ?? '', body: n.body ?? '', tags: n.meta.tags ?? [], daily: n.meta.daily })));
  const rowTitles = () => p.$$eval('.rows.drawers .row h2', (els) => els.map((e) => e.textContent));
  const box = '.capbar textarea';

  // ---- 애플식 첫 화면, 넷플릭스식 줄 ----
  ok(await p.locator('.gnav .gn-links a').count() === 5 && (await p.locator('.hero h1').innerText()).includes('넣기만 하세요'), 'home: Apple-style nav and headline');
  const rows = await rowTitles();
  ok(rows.includes('새로 넣은 것') && rows.includes('쇼핑') && rows.includes('일·업무') && rows.includes('요리'), `home: a poster row per drawer ${JSON.stringify(rows)}`);
  ok(await p.locator('.tiles .tile').count() === 4 && await p.locator('.foot').count() === 1, 'home: Apple-style tiles and footer');
  const pb = await p.locator('.row .poster').first().boundingBox();
  ok(pb && Math.abs(pb.width / pb.height - 16 / 9) < 0.05, 'posters are 16:9 like Netflix');

  // ---- 1. 쉽게 넣기 ----
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.activeElement?.matches('.capbar textarea')), 'Enter on home puts the cursor in the big box');
  await p.keyboard.type('김치찌개 레시피 메모');
  ok((await p.locator('.cap-guess').innerText()).includes('요리'), 'box previews the drawer while typing');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok((await notes()).some((x) => x.body.includes('김치찌개 레시피 메모')) && (await p.inputValue(box)) === '', 'Enter saves and clears');
  ok(await p.locator('.toast', { hasText: '요리 서랍에 넣었어요' }).count() === 1, 'toast names the drawer');
  await p.locator('.toast', { hasText: '서랍에 넣었어요' }).last().locator('button').click();
  await p.waitForTimeout(400);
  ok(!(await notes()).some((x) => x.body.includes('김치찌개 레시피 메모')), 'undo removes it');
  await p.fill(box, 'https://www.agoda.com/ko-kr/hotel 다음 달 숙소');
  ok((await p.locator('.cap-guess').innerText()).includes('여행'), 'link → 여행 guess');
  await p.click('.capbar .cap-save');
  await p.waitForTimeout(300);
  ok((await notes()).some((x) => x.type === 'bookmark' && x.source === 'https://www.agoda.com/ko-kr/hotel'), 'link becomes a bookmark note');

  // ---- 3. 무엇이든 담기 ----
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
  await p.evaluate(() => navigator.clipboard.writeText('https://www.youtube.com/watch?v=abc 나중에 볼 영상'));
  await p.click('.hero-links button:has-text("붙여넣기")');
  await p.waitForTimeout(200);
  ok((await p.inputValue(box)).startsWith('https://www.youtube.com/watch?v=abc') && (await p.locator('.cap-guess').innerText()).includes('영상'), 'paste link fills the box from the clipboard');
  await p.fill(box, '');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.hero-links button:has-text("사진")')]);
  await chooser.setFiles([{ name: 'shot.png', mimeType: 'image/png', buffer: PNG }]);
  await p.waitForSelector('.toast:has-text("사진을 넣었어요")');
  ok((await notes()).some((x) => x.type === 'capture' && x.status === 'inbox'), 'photo link saves a screenshot');
  await p.evaluate(() => { location.hash = '#/share?via=browser&url=' + encodeURIComponent('https://www.10000recipe.com/recipe/42') + '&title=' + encodeURIComponent('된장찌개 끓이는 법') + '&text=' + encodeURIComponent('멸치 육수 먼저'); });
  await p.waitForSelector('.ws .note-title');
  const shared = (await notes()).find((x) => x.source === 'https://www.10000recipe.com/recipe/42');
  ok(shared && shared.title === '된장찌개 끓이는 법' && shared.body.includes('멸치 육수 먼저'), 'browser button keeps url, title and selection');
  ok((await p.locator('.props .mpill.auto').innerText()).includes('요리'), 'shared page lands in 요리 (auto)');

  await p.evaluate(() => { location.hash = '#/bookmarks'; });
  await p.waitForSelector('.dropzone input');
  const bm = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p><DT><H3>북마크바</H3><DL><p>
    <DT><A HREF="https://www.musinsa.com/app/goods/1" ADD_DATE="1700000000">겨울 패딩</A>
    <DT><H3>여행</H3><DL><p><DT><A HREF="https://www.airbnb.co.kr/rooms/9">강릉 숙소</A></DL><p>
    <DT><A HREF="https://brunch.co.kr/@jeju/42">이미 있는 글</A></DL><p></DL>`;
  await p.setInputFiles('.dropzone input', { name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(bm) });
  await p.waitForSelector('.preview-groups .chip');
  await p.click('.btn-primary:has-text("넣기")');
  await p.waitForSelector('.empty:has-text("링크 2개를 넣었어요")');
  ok((await notes()).filter((x) => /musinsa|airbnb/.test(x.source)).length === 2, 'bookmark file imported (duplicate skipped)');
  await p.evaluate(() => { location.hash = '#/connect'; });
  await p.waitForSelector('.tabs-row');
  ok((await p.locator('.bm-btn').getAttribute('href')).includes('#/share?via=browser'), 'how-to page offers the browser button');

  // ---- 4. 자동 분류: 서랍 모음, 서랍 하나, 바꾸면 폴더로 ----
  await p.click('.gn-links a:has-text("서랍")');
  await p.waitForSelector('.dbig');
  ok((await p.locator('.dbig').allInnerTexts()).some((t) => t.includes('쇼핑')), 'all drawers page lists 쇼핑');
  await p.click('.dbig:has-text("쇼핑")');
  await p.waitForSelector('.page-hero h1');
  ok((await p.locator('.page-hero h1').innerText()) === '쇼핑.' && await p.locator('.sh-note').count() === 1, 'drawer page: title and auto note');
  await p.locator('.grid .poster', { hasText: 'coupang' }).click();
  await p.waitForSelector('.ws .auto-why');
  ok((await p.locator('.auto-why').innerText()).includes('coupang.com'), 'note says why (coupang.com 링크)');
  ok(await p.locator('.ws-left .ex-list a[aria-current="page"]').count() === 1, 'Obsidian-style explorer marks the open note');
  await p.click('.props .mpill.auto');
  await p.keyboard.type('집·생활');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  const moved = (await notes()).find((x) => x.source.includes('coupang'));
  ok(moved.status === 'organized' && moved.category === '집·생활' && await p.locator('.props .mpill.auto').count() === 0, 'changing the drawer files it for real');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => decodeURIComponent(location.hash))) === '#/f/쇼핑', 'Esc returns to the drawer page');

  // ---- 옵시디언식 작업 공간: 속성, 연결·목차·그래프 ----
  await p.evaluate(() => { location.hash = '#/n/20261020093000'; });
  await p.waitForSelector('.ws .props');
  ok((await p.locator('.props').innerText()).includes('패션 / 상의') && await p.locator('.callout').count() === 1, 'properties table and summary callout');
  await p.waitForSelector('.rp-rel');
  const relTitle = (await p.locator('.rp-rel b span:last-child').first().innerText()).trim();
  await p.locator('.rp-rel .link-btn').first().click();
  await p.waitForTimeout(500);
  ok((await notes()).find((x) => x.id === '20261020093000').body.includes('## 연결'), `link a similar note (${relTitle})`);
  await p.click('.rp-tabs button:has-text("그래프")');
  ok(await p.locator('.lgraph circle').count() >= 2, 'local graph shows neighbours');
  await p.click('.rp-tabs button:has-text("목차")');
  ok(await p.locator('.outline button').count() >= 1, 'outline lists headings');
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('j');
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => location.hash)) !== '#/n/20261020093000', 'J goes to the next note');

  // ---- 빠른 실행 (⌘K / /) ----
  await p.evaluate(() => { location.hash = '#/'; });
  await p.waitForSelector('.hero');
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('/');
  await p.waitForSelector('.spot input');
  await p.keyboard.type('막국수');
  await p.waitForTimeout(200);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.ws .note-title');
  ok((await p.inputValue('.ws .note-title')) === '들기름 막국수', 'spotlight: find and open a note');
  await p.keyboard.press('Control+k');
  await p.waitForSelector('.spot input');
  await p.keyboard.type('설정');
  await p.waitForTimeout(150);
  await p.keyboard.press('Enter');
  await p.waitForSelector('.set-sec');
  ok(true, 'spotlight: run a command (설정)');
  await p.click('text=낮');
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'theme: switch to light');
  await p.click('text=밤');
  ok(!(await p.evaluate(() => document.documentElement.dataset.theme)), 'theme: dark is the default');
  await p.evaluate(() => { location.hash = '#/search?q=' + encodeURIComponent('셔츠'); });
  await p.waitForSelector('.grid .poster');
  ok(await p.locator('.grid .poster').count() >= 2 && await p.locator('.grid .poster mark').count() >= 1, 'search page shows highlighted posters');

  // ---- 서랍 화면: 종류, 목록 ----
  await p.evaluate(() => { location.hash = '#/all'; });
  await p.waitForSelector('.type-chips');
  await p.click('.type-chips .chip:has-text("링크")');
  await p.waitForTimeout(200);
  const kinds = await p.$$eval('.grid .poster', (els) => els.map((a) => window.__TD_APP__.lib.get(decodeURIComponent(a.getAttribute('href').split('/n/')[1])).meta.type));
  ok(kinds.length > 0 && kinds.every((t) => t === 'bookmark'), `type chip: links only (${kinds.length})`);
  await p.click('.view-btn');
  await p.click('.pop .mi:has-text("목록")');
  await p.waitForSelector('.rows-list .row-item');
  ok(true, 'view menu: list');
  await p.click('.view-btn');
  await p.click('.pop .mi:has-text("포스터")');
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter');
  await p.waitForSelector('.composer textarea');
  ok(true, 'Enter away from home opens the centered box');
  await p.keyboard.press('Escape');

  // ---- 오늘과 할 일 ----
  await p.evaluate(() => { location.hash = '#/'; });
  await p.click('.today-line .today-btn');
  await p.waitForSelector('.ws .ProseMirror ul[data-type="taskList"] li');
  ok((await notes()).filter((x) => x.daily).length === 1, 'today note made once');
  await p.click('.gn-links a:has-text("할 일")');
  await p.waitForSelector('.task-group');
  await p.locator('.task-group', { hasText: '분기 회의 준비' }).locator('input').first().click();
  await p.waitForTimeout(400);
  ok((await notes()).find((x) => x.title === '분기 회의 준비').body.includes('- [x] 지난 분기 숫자 정리'), 'tasks page checks the note');
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 사용법 안내 ----
  p = await open(b, { tutorial: true });
  await p.waitForSelector('.tour-card', { timeout: 8000 });
  ok(await p.locator('.tour-count i').count() === 7, 'tutorial: 7 steps');
  const lit = [];
  for (const sel of ['.capbar', '.rows.drawers', '.today', '.gn-btn', '.gnav .me']) {
    await p.click('.tour-card .btn-primary');
    await p.waitForTimeout(550);
    const [h, t] = [await p.locator('.tour-hole').boundingBox(), await p.locator(sel).first().boundingBox()];
    lit.push(!!(h && t && h.x <= t.x + 1 && h.y <= t.y + 1 && h.x + h.width >= t.x + t.width - 1));
  }
  ok(lit.every(Boolean), `tutorial spotlights each part ${JSON.stringify(lit)}`);
  await p.click('.tour-card .btn:has-text("넘기기")');
  ok(await p.evaluate(() => localStorage.getItem('td.tutorialDone')) === 'true', 'tutorial remembered');
  await p.context().close();

  // ---- 2. 휴대폰 ----
  p = await open(b, { viewport: { width: 390, height: 844 } });
  await p.waitForSelector('.row .poster');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no sideways scroll');
  ok(await p.locator('.gn-links').isHidden() && await p.locator('.gnav .add-btn').isVisible(), 'phone: compact nav with add button');
  await p.click('.gnav .add-btn');
  ok(await p.evaluate(() => document.activeElement?.matches('.capbar textarea')), 'phone: add on home focuses the big box');
  await p.keyboard.type('폰에서 적은 메모');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__TD_APP__.lib.all.some((n) => (n.body ?? '').includes('폰에서 적은 메모'))), 'phone: saved');
  await p.locator('.row .poster').first().click();
  await p.waitForSelector('.ws .note-title');
  ok(await p.locator('.ws-left').isHidden() && await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: note is one column');
  ok(p.errors.length === 0, 'phone: no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 낮 화면, 빈 서랍 ----
  p = await open(b, { seedData: { profile: { name: '나', email: 'me@example.com' }, files: [] } });
  await p.evaluate(() => { localStorage.setItem('td.theme', '"light"'); });
  await p.reload();
  await p.waitForSelector('.empty');
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light' && await p.locator('.tiles .tile').count() === 4, 'empty + light: headline, empty note, tiles');
  ok(p.errors.length === 0, 'empty: no page errors ' + p.errors.join(' | '));
  await b.close();
})();
