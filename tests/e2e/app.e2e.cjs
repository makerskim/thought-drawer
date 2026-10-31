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
  ok(await p.locator('.gnav .nav-toggle').count() === 1 && await p.locator('.gnav .add-btn, .gn-links').count() === 0 && (await p.locator('.hero h1').innerText()).includes('넣기만 하세요'), 'home: ☰ menu, no add button, headline');
  ok((await p.locator('.hero-sub').innerText()) === '무엇이든 넣으면 알아서 분류해드립니다.' && (await p.locator('.hero-sub').boundingBox()).height < 40, 'subtitle is one line');
  ok(await p.locator('.hero-links').count() === 0 && await p.locator('.capbar-box .cap-plus').count() === 1, 'extra ways sit behind + in the box');
  const cap = await p.locator('.capbar-box').boundingBox();
  ok(cap && Math.abs(cap.y + cap.height / 2 - (52 + (900 - 52) / 2)) < 130, `landing: input sits around the middle (y=${Math.round(cap?.y)})`);
  ok(await p.evaluate(() => document.querySelector('.below').getBoundingClientRect().top >= innerHeight - 2), 'landing: notes start below the first screen');
  // 서랍이: 적으면 서랍을 말해 주고, 누르면 말을 건다
  await p.fill('.capbar textarea', 'https://www.coupang.com/vp/products/9 가습기');
  await p.waitForSelector('.cm-bubble:has-text("쇼핑")', { timeout: 3000 });
  ok(true, 'mascot says which drawer while typing');
  await p.fill('.capbar textarea', '');
  await p.waitForTimeout(200);
  ok(await p.locator('.cm-bubble:has-text("쇼핑")').count() === 0, 'bubble closes when the box is cleared');
  await p.click('.cm-body');
  ok(await p.locator('.cm-bubble').count() === 1 && (await p.locator('.cm-body').getAttribute('class')).includes('hop'), 'poking the mascot makes it talk and hop');
  // 옆 메뉴: 열기, 고정(왼쪽 → 오른쪽), 풀기
  await p.click('.nav-toggle');
  await p.waitForSelector('.sb.floating');
  ok((await p.locator('.sb .sb-item').allInnerTexts()).some((t) => t.includes('모든 서랍')), 'sidebar opens from ☰');
  await p.click('.sb [aria-label="고정하기"]');
  await p.waitForSelector('.sb.docked');
  ok(await p.locator('.shell.docked-left').count() === 1 && await p.locator('.nav-toggle').count() === 0, 'pinning docks it on the left');
  await p.click('.sb [aria-label="오른쪽으로 옮기기"]');
  const sbBox = await p.locator('.sb').boundingBox();
  ok(await p.locator('.shell.docked-right').count() === 1 && sbBox.x > 1000, 'it can move to the right');
  await p.click('.sb [aria-label="왼쪽으로 옮기기"]');
  await p.click('.sb [aria-label="고정 풀기"]');
  await p.waitForTimeout(200);
  ok(await p.locator('.sb').count() === 0 && await p.locator('.nav-toggle').count() === 1, 'unpinning hides it again');
  const rows = await rowTitles();
  ok(rows.includes('새로 넣은 것') && rows.includes('쇼핑') && rows.includes('일·업무') && rows.includes('요리'), `home: a poster row per drawer ${JSON.stringify(rows)}`);
  ok(await p.locator('.tiles .tile').count() === 4 && await p.locator('.foot').count() === 1, 'home: Apple-style tiles and footer');
  const heights = await p.$$eval('.rows.drawers .row .poster', (els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
  ok(heights.length === 1, `cards share one height ${JSON.stringify(heights)}`);
  ok(await p.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Pretendard')), 'type: Pretendard');
  ok(await p.evaluate(() => !document.querySelector('.poster[style*="gradient"]') && getComputedStyle(document.querySelector('.poster')).backgroundImage === 'none'), 'cards are plain paper, no gradients');

  // ---- 1. 쉽게 넣기 ----
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.activeElement?.matches('.capbar textarea')), 'Enter on home puts the cursor in the big box');
  await p.keyboard.type('김치찌개 레시피 메모');
  ok((await p.locator('.cap-guess').innerText()).includes('요리'), 'box previews the drawer while typing');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok((await notes()).some((x) => x.body.includes('김치찌개 레시피 메모')) && (await p.inputValue(box)) === '', 'Enter saves and clears');
  ok(await p.locator('.toast', { hasText: /요리 › 레시피 서랍에 넣었어요/ }).count() === 1, 'toast names the drawer and sub-drawer');
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
  await p.click('.cap-plus');
  await p.click('.pop .mi:has-text("붙여넣기")');
  await p.waitForTimeout(200);
  ok((await p.inputValue(box)).startsWith('https://www.youtube.com/watch?v=abc') && (await p.locator('.cap-guess').innerText()).includes('영상'), 'paste link fills the box from the clipboard');
  await p.fill(box, '');
  await p.click('.cap-plus');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('.pop .mi:has-text("사진")')]);
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
  await p.click('.nav-toggle');
  await p.click('.sb .sb-item:has-text("모든 서랍")');
  await p.waitForSelector('.dbig');
  ok((await p.locator('.dbig').allInnerTexts()).some((t) => t.includes('쇼핑')), 'all drawers page lists 쇼핑');
  await p.click('.dbig:has(b:text-is("쇼핑"))');
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
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'theme: dark');
  await p.click('text=기기 따라');
  ok(!(await p.evaluate(() => document.documentElement.dataset.theme)), 'theme: follows the device by default');
  await p.evaluate(() => { location.hash = '#/search?q=' + encodeURIComponent('셔츠'); });
  await p.waitForSelector('.grid .poster');
  ok(await p.locator('.grid .poster').count() >= 2 && await p.locator('.grid .poster mark').count() >= 1, 'search page shows highlighted posters');

  // ---- 서랍 화면: 필터 막대, 목록 ----
  await p.evaluate(() => { location.hash = '#/all'; });
  await p.waitForSelector('.fbar');
  const shown = () => p.$$eval('.grid .poster', (els) => els.map((a) => window.__TD_APP__.lib.get(decodeURIComponent(a.getAttribute('href').split('/n/')[1]))));
  const total = (await shown()).length;
  await p.click('.fpill[data-f="type"]');
  await p.click('.pop .mi:has-text("링크")');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  const kinds = (await shown()).map((n) => n.meta.type);
  ok(kinds.length > 0 && kinds.length < total && kinds.every((t) => t === 'bookmark') && /type=bookmark/.test(await p.evaluate(() => location.hash)), `filter: links only (${kinds.length}), kept in the address`);
  await p.click('.fpill-w.on .fpill-x');
  await p.waitForTimeout(200);
  ok((await shown()).length === total, 'filter: × clears it');
  await p.click('.fpill[data-f="d"]');
  await p.click('.pop .fopt:has-text("오늘")');
  await p.waitForTimeout(200);
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; });
  const todays = await shown();
  ok(todays.length > 0 && todays.length < total && todays.every((n) => n.id.startsWith(today)) && (await p.locator('.sh-count').innerText()).includes(`전체 ${total}개`), `filter: date 오늘 (${todays.length}/${total})`);
  await p.click('.fpill[data-f="dr"]');
  await p.click('.pop .mi:has-text("쇼핑")');
  await p.waitForTimeout(200);
  ok(await p.locator('.fpill-w.on').count() === 2, 'filter: date + drawer together');
  await p.click('.fbar-clear');
  await p.waitForTimeout(200);
  ok((await shown()).length === total && !(await p.evaluate(() => location.hash)).includes('?'), 'filter: 모두 지우기');
  await p.evaluate(() => { location.hash = '#/all?has=open'; });
  await p.waitForTimeout(600);
  const left = await shown();
  ok(left.length > 0 && left.every((n) => /- \[ \]/.test(n.body ?? '')), `filter: 남은 할 일 from the address (${left.length})`);
  await p.evaluate(() => { location.hash = '#/all'; });
  await p.waitForTimeout(300);
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
  await p.click('.nav-toggle');
  await p.click('.sb .sb-item:has-text("할 일")');
  await p.waitForSelector('.task-group');
  await p.locator('.task-group', { hasText: '분기 회의 준비' }).locator('input').first().click();
  await p.waitForTimeout(400);
  ok((await notes()).find((x) => x.title === '분기 회의 준비').body.includes('- [x] 지난 분기 숫자 정리'), 'tasks page checks the note');

  // ---- / 명령어, # 태그, @ 서랍, 자동 태그 ----
  await p.evaluate(() => { location.hash = '#/'; });
  await p.waitForSelector(box);
  await p.click(box);
  await p.keyboard.type('/할');
  await p.waitForSelector('.in-slash .mi');
  ok((await p.locator('.in-slash .mi').first().innerText()).includes('/할일'), 'slash: /할 shows 할 일 first');
  await p.keyboard.press('Enter');
  ok((await p.inputValue(box)) === '- [ ] ', 'slash: Enter puts a checkbox');
  await p.keyboard.type('우유 사기 #');
  await p.waitForSelector('.in-slash[aria-label="태그"] .mi');
  await p.keyboard.type('장보기 @쇼');
  await p.waitForSelector('.in-slash[aria-label="서랍"] .mi');
  await p.keyboard.press('Enter');
  ok((await p.inputValue(box)) === '- [ ] 우유 사기 #장보기 @쇼핑 ', 'slash: # and @ lists fill tag and drawer');
  ok((await p.locator('.cap-guess').innerText()).includes('쇼핑') && (await p.locator('.cap-tag').allInnerTexts()).includes('#장보기'), 'preview shows my drawer and tag');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  let made = (await notes()).find((x) => x.body === '- [ ] 우유 사기');
  ok(made && made.category === '쇼핑' && made.status === 'organized' && made.tags.includes('장보기'), 'saved: @쇼핑 files it, #장보기 tags it, tokens leave the text');
  await p.fill(box, '청소기 비교 https://www.coupang.com/vp/products/9');
  await p.waitForTimeout(100);
  ok((await p.locator('.cap-guess').innerText()).includes('가전'), 'preview: 쇼핑 › 가전 while typing');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  made = (await notes()).find((x) => x.body.includes('청소기 비교'));
  ok(made && made.tags.includes('쿠팡') && made.tags.includes('청소기'), `new notes get auto tags (${made?.tags})`);

  // ---- 설정: 말 고침, 키워드, 분류 규칙 ----
  await p.click('.nav-toggle');
  ok(await p.locator('.sb .sb-search').count() === 0 && await p.locator('.sb input').count() === 0, 'sidebar: no search box');
  await p.click('.sb .sb-item:has-text("설정")');
  await p.waitForSelector('#s-classify');
  const setText = await p.locator('.set-page').innerText();
  ok(!setText.includes('내가·Claude가') && setText.includes('서랍 폴더에 정리됨') && setText.includes('자동 분류만 됨'), 'settings: plain wording for the counts');
  ok(await p.locator('.set-sec').count() >= 10 && await p.locator('.set-toc .chip').count() >= 8, 'settings: many sections with a table of contents');
  await p.fill('#s-keywords .kw-form input', '주소');
  await p.fill('#s-keywords .kw-form textarea', '서울 마포구 {오늘}');
  await p.click('#s-keywords .kw-form .btn-primary');
  await p.waitForSelector('#s-keywords .rule-list li:has-text("/주소")');
  await p.fill('#s-rules .rule-form input[aria-label="낱말 또는 사이트"]', '다이슨');
  await p.fill('#s-rules .rule-form input[aria-label="서랍"]', '쇼핑/가전');
  await p.fill('#s-rules .rule-form input[aria-label="태그"]', '브랜드');
  await p.click('#s-rules .rule-form .btn-primary');
  await p.waitForSelector('#s-rules .rule-list li:has-text("다이슨")');
  await p.fill('#s-rules input[aria-label="분류 시험 글"]', '다이슨 드라이기 후기');
  ok((await p.locator('#s-rules .cap-hint').innerText()).replace(/\s+/g, ' ').includes('쇼핑 › 가전') && (await p.locator('#s-rules .cap-tag').first().innerText()) === '#브랜드', 'rule: tester shows 쇼핑 › 가전 #브랜드');
  const saved = await p.evaluate(() => window.__TD_APP__.lib.settings);
  ok(saved.keywords.some((k) => k.key === '주소') && saved.rules.some((r) => r.match === '다이슨'), 'settings saved to the shared file');
  await p.click('#s-classify .seg button:has-text("2개")');
  await p.waitForTimeout(200);
  ok((await p.evaluate(() => window.__TD_APP__.lib.settings.classify.tags)) === 2, 'auto tag count setting saved');
  await p.evaluate(() => { location.hash = '#/'; });
  await p.waitForSelector(box);
  await p.click(box);
  await p.keyboard.type('/주소');
  await p.waitForSelector('.in-slash .mi:has-text("내 키워드")');
  await p.keyboard.press('Enter');
  const day = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  ok((await p.inputValue(box)) === `서울 마포구 ${day}`, 'my keyword /주소 expands with today');
  await p.fill(box, '');

  // ---- 노트 편집기의 / ----
  await p.evaluate(() => { location.hash = '#/new'; });
  await p.waitForSelector('.ws .ProseMirror');
  await p.click('.ws .ProseMirror');
  await p.keyboard.type('/오늘');
  await p.waitForSelector('.pop.slash .mi');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  ok((await p.locator('.ws .ProseMirror').innerText()).includes(day), 'editor: /오늘 inserts the date');
  await p.keyboard.type(' /주소');
  await p.waitForSelector('.pop.slash .mi:has-text("주소")');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  ok((await p.locator('.ws .ProseMirror').innerText()).includes('서울 마포구'), 'editor: my keyword works mid-line');

  // ---- 내 계정 (오른쪽 위): 구글 계정에 관한 것만 ----
  await p.click('.gnav .me');
  await p.waitForSelector('.pop .acct');
  const acct = await p.locator('.pop').innerText();
  const acctItems = await p.$$eval('.pop .mi', (els) => els.map((e) => e.textContent.trim()));
  ok(acct.includes('나') && acct.includes('me@example.com') && acct.includes('연결됨'), 'account menu: name, email, connection');
  ok(JSON.stringify(acctItems) === JSON.stringify(['드라이브에서 「메모」 폴더 열기', '드라이브와 다시 맞추기', '구글 계정 관리', '로그아웃']), `account menu: Google items only (${acctItems.join(', ')})`);
  await p.click('.pop .mi:has-text("로그아웃")');
  await p.waitForSelector('.overlay :text("로그아웃할까요?")');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  ok(await p.locator('.overlay').count() === 0 && (await notes()).length > 0, 'logout asks first (cancel keeps everything)');

  // ---- 사용법 ----
  await p.evaluate(() => { location.hash = '#/help'; });
  await p.waitForSelector('.help-card');
  const help = await p.locator('.help-page').innerText();
  ok(['/ 명령어', '# 태그 · @ 서랍', '자동 분류', '필터', '단축키'].every((t) => help.includes(t)) && help.includes('/할일') && help.includes('/주소'), 'help page lists commands (with mine), tokens, classify, filters, keys');
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 사용법 안내 ----
  p = await open(b, { tutorial: true });
  await p.waitForSelector('.tour-card', { timeout: 8000 });
  ok(await p.locator('.tour-count i').count() === 6, 'tutorial: 6 steps');
  const lit = [];
  for (const sel of ['.capbar-box', '.nav-toggle', '.gn-search', '.rows.drawers']) {
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
  ok(await p.locator('.gnav .add-btn').count() === 0 && await p.locator('.nav-toggle').isVisible(), 'phone: ☰ menu, no add button');
  await p.click('.nav-toggle');
  await p.click('.sb .sb-item:has-text("넣기")');
  await p.waitForTimeout(300);
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
