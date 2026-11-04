// 화면 시험: 1) 쉽게 넣기 2) 어느 기기에서나 3) 무엇이든 담기 4) 자동 분류,
// 그리고 애플식 위 막대·첫 화면, 넷플릭스식 서랍 줄, 옵시디언식 노트 작업 공간, 빠른 실행, 할 일, 안내
// 실행: npm run serve 를 켜 둔 채 npm run e2e
const { open, launch, check } = require('./harness.cjs');
const ok = check();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEKmBioDQDJPgP9pNMHlAAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const b = await launch();
  let p = await open(b);
  await p.waitForSelector('.fold');
  const notes = () => p.evaluate(() => window.__TD_APP__.lib.all.map((n) => ({ id: n.id, title: n.meta.title ?? '', type: n.meta.type, status: n.meta.status, category: n.meta.category ?? '', source: n.meta.source ?? '', body: n.body ?? '', tags: n.meta.tags ?? [], daily: n.meta.daily })));
  const folderNames = () => p.$$eval('.home .folder-grid .fold b', (els) => els.map((e) => e.textContent));
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
  const folders = await folderNames();
  ok(['쇼핑', '일·업무', '요리', '모든 노트'].every((n) => folders.includes(n)) && await p.locator('.home .poster, .home .row').count() === 0, `home: only drawer folders, no notes ${JSON.stringify(folders)}`);
  ok(await p.locator('.home .fold svg.folder-ic').count() === folders.length && (await p.locator('.home .fold:has(b:text-is("쇼핑"))').getAttribute('href')) === '#/f/' + encodeURIComponent('쇼핑'), 'home: each folder has the folder icon and opens its drawer');
  ok(await p.locator('.tiles, .tile').count() === 0 && !(await p.locator('.home').innerText()).includes('어디서든 넣으세요'), 'home: no 「어디서든 넣으세요」 tiles');
  ok(/^© \d{4} makerskim\. All rights reserved\.$/.test((await p.locator('.foot').innerText()).trim()), 'footer: just the copyright line');
  ok(await p.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Pretendard')), 'type: Pretendard');

  // ---- 1. 쉽게 넣기 ----
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.activeElement?.matches('.capbar textarea')), 'Enter on home puts the cursor in the big box');
  await p.keyboard.type('김치찌개 레시피 메모');
  ok((await p.locator('.cap-guess').innerText()).includes('요리'), 'box previews the drawer while typing');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok((await notes()).some((x) => x.body.includes('김치찌개 레시피 메모')) && (await p.inputValue(box)) === '', 'Enter saves and clears');
  ok(await p.locator('.toast', { hasText: /요리 › 레시피 › 찌개 서랍에 넣었어요/ }).count() === 1, 'toast names 대분류 › 중분류 › 소분류');
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
  await p.waitForSelector('.drawers-page .fold');
  ok((await p.locator('.drawers-page .fold b').allInnerTexts()).includes('쇼핑'), 'all drawers page shows folders (쇼핑)');
  await p.click('.drawers-page .fold:has(b:text-is("쇼핑"))');
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
  ok((await p.locator('.props').innerText()).includes('패션 › 상의') && await p.locator('.callout').count() === 1, 'properties table and summary callout');
  ok(await p.locator('.ws .show-m:visible').count() === 0 && await p.locator('.ws-left').isVisible() && await p.locator('.ws-right').isVisible(), 'desktop: three panes side by side, phone-only buttons hidden');
  await p.waitForSelector('.rp-rel');
  const relTitle = (await p.locator('.rp-rel b span:last-child').first().innerText()).trim();
  await p.locator('.rp-rel .link-btn').first().click();
  await p.waitForTimeout(500);
  ok((await notes()).find((x) => x.id === '20261020093000').body.includes('## 연결'), `link a similar note (${relTitle})`);
  const relWhy = await p.locator('.rp-sec:has-text("비슷한 노트") .rp-item small').allInnerTexts();
  ok(relWhy.length > 0 && relWhy.every((w) => w.trim().length > 0), `similar notes say why (${relWhy.join(' / ')})`);
  await p.click('.rp-tabs button:has-text("그래프")');
  ok(await p.locator('.lgraph circle').count() >= 2, 'local graph shows neighbours');
  // 생각 지도: 이은 연결(실선)과 추천 연결(점선), 서랍끼리 모음
  await p.evaluate(() => { location.hash = '#/graph'; });
  await p.waitForSelector('.graph canvas');
  const autoN = Number((await p.locator('.g-auto').innerText()).replace(/\D/g, ''));
  const legend = await p.locator('.g-legend').innerText();
  ok(autoN >= 2 && /이은 연결 \d+/.test(legend) && legend.includes(`추천 연결 ${autoN}`), `mind map: recommended links shown (${autoN}) next to real links`);
  await p.click('.g-auto');
  ok((await p.locator('.g-auto').getAttribute('aria-pressed')) === 'false' && !(await p.locator('.g-legend').innerText()).includes('추천 연결'), 'mind map: recommended links can be hidden');
  await p.click('.g-auto');
  await p.waitForTimeout(3500);
  const dot = await p.evaluate(() => { const n = window.__TD_APP__.lib.all.find((x) => (x.meta.title ?? '').includes('옥스포드 셔츠')); return window.__TD_GRAPH__().find((d) => d.id === n.id); });
  await p.mouse.move(dot.x, dot.y);
  await p.waitForSelector('.g-info li');
  const infoText = await p.locator('.g-info').innerText();
  ok(infoText.includes('흰색 옥스포드 셔츠') && infoText.includes('가을 레이어드 코디') && infoText.includes('#셔츠'), 'mind map: hovering a note shows what it connects to and why');
  await p.goBack();
  await p.waitForSelector('.ws .props');
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
  await p.waitForSelector('.set-page .sg');
  ok(true, 'spotlight: run a command (설정)');
  await p.click('#s-screen .seg button:has-text("밝게")');
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'theme: switch to light');
  await p.click('#s-screen .seg button:has-text("어둡게")');
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'theme: dark');
  await p.click('#s-screen .seg button:has-text("기기")');
  ok(!(await p.evaluate(() => document.documentElement.dataset.theme)), 'theme: 기기 follows the device');
  await p.click('#s-screen .seg button:has-text("자동")');
  const byTime = await p.evaluate(async () => (await import('./js/core/sun.js')).themeByTime());
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === byTime && (await p.locator('#s-screen').innerText()).includes('낮 밝게 · 밤 어둡게'), `theme: 자동 follows the sun (now ${byTime})`);
  ok(await p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].every((m) => m.content === (document.documentElement.dataset.theme === 'dark' ? '#000000' : '#f5f5f7'))), 'theme: browser bar color follows too');
  await p.click('#s-screen .seg button:has-text("기기")');
  await p.evaluate(() => { location.hash = '#/search?q=' + encodeURIComponent('셔츠'); });
  await p.waitForSelector('.grid .poster');
  ok(await p.locator('.grid .poster').count() >= 2 && await p.locator('.grid .poster mark').count() >= 1, 'search page shows highlighted posters');
  ok(await p.evaluate(() => !document.querySelector('.poster[style*="gradient"]') && getComputedStyle(document.querySelector('.poster')).backgroundImage === 'none'), 'cards are plain paper, no gradients');

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
  const groups = await p.$$eval('.sg-title', (els) => els.map((e) => e.firstChild.textContent.trim()));
  ok(JSON.stringify(groups) === JSON.stringify(['화면', '입력', '자동 분류', '분류 규칙', '바꾼 서랍 이름', '내 명령어', '데이터', 'Claude 자동 정리']), `settings: grouped like iPhone settings (${groups.join(', ')})`);
  ok(await p.locator('.set-toc, #s-account, #s-keys, #s-help, .set-page .help-table, .set-page .help-keys').count() === 0 && !setText.includes('로그아웃') && !setText.includes('단축키') && !setText.includes('내가·Claude가'), 'settings: no top buttons, account, shortcuts, help or built-in command table');
  const labels0 = await p.$$eval('.sg-label b', (els) => els.map((e) => e.textContent.trim()));
  const descs = await p.$$eval('.sg-label small', (els) => els.map((e) => e.textContent.trim()));
  ok(labels0.every((l) => l.length <= 8) && descs.every((d) => d.length <= 12), `settings: short labels (${labels0.join('·')}) and tiny hints only`);
  // Claude 자동 정리: 켜기 전에는 짧은 상태창 (설정법은 길게 쓰지 않는다)
  const cg = p.locator('#s-claude');
  const cgLabels = await cg.locator('.sg-label b').allInnerTexts();
  ok(JSON.stringify(cgLabels) === JSON.stringify(['상태', '정리 대기', '보내는 노트', '비용']) && (await cg.locator('.cl-state').innerText()).includes('꺼짐'), `claude: off → short status (${cgLabels.join(', ')})`);
  ok(await cg.locator('.cg-steps, .cg-intro').count() === 0 && (await cg.locator('details summary').allInnerTexts()).join() === '정리기 연결 (토큰 받기)' && await cg.locator('.sg-foot a').count() === 1, 'claude: no long how-to, just token connect and a guide link');
  const kws = await p.$$eval('#s-keywords .item-row code', (els) => els.map((e) => e.textContent));
  ok(['/할일', '/오늘', '/내일', '/어제', '/지금'].every((k) => kws.includes(k)) && await p.locator('#s-keywords .fixed-row code').count() === 5, 'settings: default commands are listed and editable, actions shown as fixed');
  // 내 명령어: 창에서 이름, 글, 끼워 넣기
  await p.click('#s-keywords .sg-add');
  await p.waitForSelector('.sdlg');
  await p.click('.sdlg .btn-primary');
  ok((await p.locator('.sdlg-err').innerText()).includes('명령어 이름'), 'keyword dialog: says what is missing');
  await p.fill('.sdlg input[aria-label="명령어 이름"]', '주소');
  await p.click('.sdlg textarea');
  await p.keyboard.type('서울 마포구 ');
  await p.click('.kw-chips .chip:has-text("오늘 날짜")');
  ok((await p.inputValue('.sdlg textarea')) === '서울 마포구 {오늘}' && (await p.locator('.sdlg-prev pre').innerText()).startsWith('서울 마포구 20'), 'keyword dialog: chips insert values with a live preview');
  await p.click('.sdlg .btn-primary');
  await p.waitForSelector('#s-keywords .item-row:has-text("/주소")');
  // 분류 규칙: 창에서 낱말 → 서랍(고르기) + 태그
  await p.click('#s-rules .sg-add');
  await p.waitForSelector('.sdlg');
  await p.fill('.sdlg input[aria-label="낱말 또는 사이트"]', '다이슨');
  await p.selectOption('.sdlg select[aria-label="서랍"]', '쇼핑/가전');
  await p.fill('.sdlg input[aria-label="태그"]', '브랜드');
  ok((await p.locator('.sdlg-prev').innerText()).replace(/\s+/g, ' ').includes('쇼핑 › 가전 #브랜드'), 'rule dialog: sentence preview');
  await p.click('.sdlg .btn-primary');
  await p.waitForSelector('#s-rules .item-row:has-text("다이슨")');
  await p.fill('#s-classify input[aria-label="분류 해 보기"]', '다이슨 드라이기 후기');
  ok((await p.locator('#s-classify .cap-hint').innerText()).replace(/\s+/g, ' ').includes('쇼핑 › 가전') && (await p.locator('#s-classify .cap-tag').first().innerText()) === '#브랜드', 'try it: shows 쇼핑 › 가전 #브랜드 from my rule');
  await p.click('#s-rules .item-row:has-text("다이슨") [aria-label$="고치기"]');
  await p.waitForSelector('.sdlg');
  ok((await p.inputValue('.sdlg input[aria-label="낱말 또는 사이트"]')) === '다이슨' && (await p.inputValue('.sdlg select[aria-label="서랍"]')) === '쇼핑/가전', 'rule dialog: edit opens with the saved values');
  await p.keyboard.press('Escape');
  const saved = await p.evaluate(() => window.__TD_APP__.lib.settings);
  ok(saved.keywords.some((k) => k.key === '주소') && saved.rules.some((r) => r.match === '다이슨' && r.drawer === '쇼핑/가전'), 'settings saved to the shared file');
  await p.click('#s-classify .seg button:has-text("2")');
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
  ok(JSON.stringify(acctItems) === JSON.stringify(['메모 폴더 열기', '동기화', '구글 계정', '로그아웃']), `account menu: short Google items only (${acctItems.join(', ')})`);
  await p.waitForSelector('.pop .qbar i');
  const quota = await p.locator('.pop .quota').innerText();
  const segs = await p.$$eval('.pop .qbar i', (els) => els.map((e) => e.getBoundingClientRect().width));
  const barW = await p.$eval('.pop .qbar', (e) => e.getBoundingClientRect().width);
  ok(quota.includes('6.2GB / 15GB') && quota.includes('Gmail·포토') && quota.includes('4.1GB') && quota.includes('8.8GB'), 'storage: used / total, parts and what is left');
  ok(segs.length === 4 && Math.abs(segs[2] / barW - 4.1 / 15) < 0.03 && segs[0] >= 2.5, `storage: bar split in proportion (${segs.map((w) => Math.round(w)).join('/')} of ${Math.round(barW)})`);
  ok((await p.$eval('.pop .qbar', (e) => e.getAttribute('aria-label'))).includes('남음 8.8GB'), 'storage: bar has a spoken summary');
  await p.click('.pop .mi:has-text("로그아웃")');
  await p.waitForSelector('.overlay :text("로그아웃할까요?")');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  ok(await p.locator('.overlay').count() === 0 && (await notes()).length > 0, 'logout asks first (cancel keeps everything)');

  // ---- 옆 메뉴: 가져오기는 아래쪽, 사용법은 설정 옆 ----
  await p.evaluate(() => { location.hash = '#/'; });
  await p.click('.nav-toggle');
  await p.waitForSelector('.sb');
  const labels = await p.$$eval('.sb .sb-label', (els) => els.map((e) => e.textContent.trim()));
  const sbText = await p.locator('.sb').innerText();
  const y = async (sel) => (await p.locator(sel).first().boundingBox()).y;
  ok(!labels.includes('넣는 곳') && !labels.includes('가져오기') && !sbText.includes('인스타') && !sbText.includes('북마크'), `sidebar: no import group (the + menu has it) (${labels.join(', ')})`);
  ok(await y('.sb .sb-item:has-text("사용법")') > await y('.sb .sb-item:has-text("설정")'), 'sidebar: 설정 then 사용법 at the bottom');
  await p.click('.sb .sb-item:has-text("사용법")');
  await p.waitForSelector('.man-sec');
  const help = await p.locator('.help-page').innerText();
  ok(await p.locator('.man-toc button').count() === 13 && ['사용법.', '시작하기', '가져오기', '/ 명령어', '# 태그 · @ 서랍', '자동 분류', '찾기와 필터', '단축키', '자주 묻는 질문', '도움말', '개인정보처리방침'].every((t) => help.includes(t)) && help.includes('/할일') && help.includes('/주소'), 'how-to: 13 chapters incl. built-in commands, shortcuts and help');
  await p.click('.man-toc button:has-text("자동 분류")');
  await p.waitForTimeout(800);
  const at = (await p.locator('#m-classify').boundingBox()).y;
  ok(Math.abs(at - 124) < 60, `manual: table of contents jumps to the chapter (${Math.round(at)})`);
  // ---- 어디서나 따라다니는 서랍이 ----
  await p.evaluate(() => { location.hash = '#/'; window.scrollTo(0, 0); });
  await p.waitForSelector(box);
  await p.waitForTimeout(300);
  ok(await p.locator('.buddy').count() === 0, 'buddy: hides while the home box (with its own 서랍이) is in view');
  await p.evaluate(() => { location.hash = '#/f/' + encodeURIComponent('공부'); });
  await p.waitForSelector('.buddy .buddy-btn');
  await p.waitForSelector('.buddy-bubble');
  await p.waitForFunction(() => /서랍이에요/.test(document.querySelector('.buddy-bubble')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => {});
  const bud = await p.locator('.buddy-bubble').innerText().catch(() => '');
  ok(/공부 서랍이에요\. 노트 \d+개/.test(bud), `buddy: says something about each screen (${bud})`);
  await p.click('.buddy-btn');
  await p.waitForSelector('.pop .mi:has-text("한마디 듣기")');
  await p.click('.pop .mi:has-text("한마디 듣기")');
  await p.waitForTimeout(200);
  ok((await p.locator('.buddy-bubble').innerText()).length > 5, 'buddy: menu gives a tip');
  await p.evaluate(() => { location.hash = '#/drawers'; });
  await p.waitForSelector('.drawers-page');
  await p.click('.buddy-btn');
  await p.click('.pop .mi:has-text("잠깐 숨기기")');
  await p.waitForTimeout(200);
  ok(await p.locator('.buddy').count() === 0, 'buddy: can be hidden');
  await p.evaluate(() => { location.hash = '#/settings'; });
  await p.waitForSelector('#s-screen');
  await p.click('#s-screen input[aria-label="서랍이 동행"]');
  await p.waitForSelector('.buddy .buddy-btn');
  ok(true, 'buddy: comes back from settings');

  // ---- 한 글자 단축키: 옆 메뉴에 보이고, 누르면 간다 (한글 입력 상태에서도) ----
  await p.evaluate(() => { location.hash = '#/'; document.activeElement?.blur(); });
  await p.waitForSelector(box);
  await p.click('.nav-toggle');
  await p.waitForSelector('.sb');
  const kbd = async (label) => p.locator('.sb .sb-item', { hasText: label }).first().locator('kbd').innerText().catch(() => '');
  const keysShown = { 홈: await kbd('홈'), '모든 서랍': await kbd('모든 서랍'), '모든 노트': await kbd('모든 노트'), '할 일': await kbd('할 일'), '오늘 노트': await kbd('오늘 노트'), '생각 지도': await kbd('생각 지도'), 설정: await kbd('설정'), 사용법: await kbd('사용법') };
  ok(JSON.stringify(Object.values(keysShown)) === JSON.stringify(['H', 'D', 'A', 'C', 'T', 'G', ',', '?']), `shortcuts shown in the menu ${JSON.stringify(keysShown)}`);
  await p.keyboard.press('d');
  await p.waitForTimeout(200);
  ok((await p.evaluate(() => location.hash)) === '#/drawers' && await p.locator('.sb.floating').count() === 0, 'D with the menu open → 모든 서랍, menu closes');
  const hashAfter = async (fn) => { await fn(); await p.waitForTimeout(200); return p.evaluate(() => location.hash); };
  const seq = [];
  seq.push(await hashAfter(() => p.keyboard.press('a')));
  seq.push(await hashAfter(() => p.keyboard.press('c')));
  seq.push(await hashAfter(() => p.keyboard.press('g')));
  seq.push(await hashAfter(() => p.keyboard.press(',')));
  seq.push(await hashAfter(() => p.keyboard.press('Shift+Slash')));
  seq.push(await hashAfter(() => p.keyboard.press('h')));
  ok(JSON.stringify(seq) === JSON.stringify(['#/all', '#/tasks', '#/graph', '#/settings', '#/help', '#/']), `A C G , ? H go to their screens ${JSON.stringify(seq)}`);
  // 한글 입력 상태: 글자는 ㅇ 이지만 자판 위치는 D
  const ko = await hashAfter(() => p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅇ', code: 'KeyD', bubbles: true, cancelable: true }))));
  ok(ko === '#/drawers', 'shortcuts work with the Korean keyboard on (ㅇ = D)');
  await p.evaluate(() => { location.hash = '#/'; });
  await p.waitForSelector(box);
  await p.click(box);
  await p.keyboard.type('dach');
  ok((await p.inputValue(box)) === 'dach' && (await p.evaluate(() => location.hash)) === '#/', 'letters typed in a box stay text');
  await p.fill(box, '');
  ok(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 사용법 안내 ----
  p = await open(b, { tutorial: true });
  await p.waitForSelector('.tour-card', { timeout: 8000 });
  ok(await p.locator('.tour-count i').count() === 6, 'tutorial: 6 steps');
  const lit = [];
  for (const sel of ['.capbar-box', '.nav-toggle', '.gn-search', '.folder-grid']) {
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
  await p.waitForSelector('.fold');
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
  await p.locator('.fold').first().click();
  await p.waitForSelector('.grid .poster');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: drawer page fits');
  await p.locator('.grid .poster').first().click();
  await p.waitForSelector('.ws .note-title');
  ok(await p.locator('.ws-left').isHidden() && await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: note is one column');
  // 폰에서도 PC의 세 칸: 위쪽 단추로 왼쪽(같은 서랍 노트)·오른쪽(연결·목차·그래프)을 밀어 연다
  const crumbH = await p.locator('.ws-bar .crumbs').evaluate((e) => e.getBoundingClientRect().height);
  ok(crumbH <= 24, `phone: note path stays on one line (${Math.round(crumbH)}px)`);
  await p.click('[aria-label="같은 서랍 노트"]');
  await p.waitForTimeout(400);
  ok(await p.locator('.ws-left').isVisible() && await p.locator('.ws-left .ex-list a').count() > 0, 'phone: list button slides in the same-drawer notes');
  await p.click('.ws-left .pane-x');
  await p.waitForTimeout(400);
  await p.click('[aria-label="연결 · 목차 · 그래프"]');
  await p.waitForTimeout(400);
  ok(await p.locator('.ws-right').isVisible() && await p.locator('.ws-left').isHidden() && (await p.locator('.ws-right .rp-tabs').innerText()).includes('연결'), 'phone: panel button slides in links · outline · graph');
  await p.locator('.ws-scrim').click({ position: { x: 20, y: 300 } });
  await p.waitForTimeout(400);
  ok(await p.locator('.ws-right').isHidden() && await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: tapping outside closes it, no sideways scroll');
  ok(p.errors.length === 0, 'phone: no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 대분류 › 중분류 › 소분류: 무엇을 넣어도 기타 없이 ----
  p = await open(b, { seedData: { profile: { name: '나', email: 'me@example.com' }, files: [] } });
  await p.waitForSelector('.capbar textarea');
  await p.click('.capbar textarea');
  await p.keyboard.type('아이폰 16 케이스');
  await p.waitForTimeout(200);
  ok((await p.locator('.cap-guess').innerText()).replace(/\s+/g, '') === '쇼핑›가전›휴대폰', 'preview shows 대분류 › 중분류 › 소분류');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  for (const t of ['갤럭시 S25 사전예약', '양자역학 너무 어렵다', '와이파이 비번 abc123', '010-1234-5678 김민수']) {
    await p.fill('.capbar textarea', t);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(250);
  }
  const paths = await p.evaluate(async () => {
    const { categoryOf } = await import('./js/ui/categories.js');
    const lib = window.__TD_APP__.lib;
    return lib.all.map((n) => categoryOf(n, lib).path);
  });
  ok(paths.length === 5 && paths.every((x) => x.split('/').length === 3 && !x.startsWith('기타')), `every note gets three levels, never 기타 (${paths.join(', ')})`);
  await p.evaluate(() => { location.hash = '#/f/쇼핑/가전'; });
  await p.waitForSelector('.leaf-chips');
  ok((await p.locator('.leaf-chips .chip', { hasText: '휴대폰' }).innerText()).includes('2'), 'sub-drawer page lists 소분류 chips with counts');
  await p.locator('.leaf-chips .chip', { hasText: '휴대폰' }).click();
  await p.waitForTimeout(300);
  ok(decodeURIComponent(await p.evaluate(() => location.hash)) === '#/f/쇼핑/가전/휴대폰' && await p.locator('.grid .poster').count() === 2, '소분류 page shows just those notes');
  await p.locator('.grid .poster').first().click();
  await p.waitForSelector('.ws .props');
  ok((await p.locator('.props .mpill').innerText()).includes('쇼핑 › 가전 › 휴대폰'), 'note shows its three-level drawer');
  ok(p.errors.length === 0, 'levels: no page errors ' + p.errors.join(' | '));
  await p.context().close();

  // ---- 나만 쓰기: 주인이 아닌 계정은 로그인 화면에서 막는다 ----
  {
    const fp = (e) => require('crypto').createHash('sha256').update(e).digest('hex');
    const owners = [fp('me@example.com')];
    const q1 = await open(b, { seedData: { profile: { name: '남', email: 'stranger@example.com' }, files: [], owners } });
    await q1.waitForSelector('.login');
    ok((await q1.locator('.login').innerText()).includes('주인만 쓸 수 있어요') && await q1.locator('.capbar').count() === 0, 'owner lock: a stranger account stays on the login screen with a message');
    ok(q1.errors.length === 0, 'owner lock: no page errors ' + q1.errors.join(' | '));
    await q1.context().close();
    const q2 = await open(b, { seedData: { profile: { name: '나', email: 'me@example.com' }, files: [], owners } });
    await q2.waitForSelector('.capbar textarea');
    ok(await q2.locator('.login').count() === 0, 'owner lock: the owner account opens the app');
    await q2.context().close();
  }

  // ---- Claude 자동 정리가 켜진 뒤의 상태창 ----
  {
    const { serializeNote, fileNameFor } = await import('../../js/core/note.js');
    const iso = (ms) => new Date(Date.now() - ms).toISOString().slice(0, 19);
    const mk = (id, meta, body, dir) => ({ dir, name: fileNameFor({ id, ...meta }), text: serializeNote({ meta: { id, type: 'memo', created: iso(5e6), ...meta }, body }) });
    const files = (lastMs) => [
      mk('20261101090000', { title: '맥북 에어 비교', status: 'organized', category: '쇼핑/가전/노트북', organized: iso(3600e3) }, '13인치와 15인치', '쇼핑/가전/노트북'),
      mk('20261101100000', { title: '새로 넣은 메모', status: 'inbox' }, '아직 정리 전', '00_인박스'),
      { dir: '_시스템', name: 'index.json', text: JSON.stringify({ version: 1, generatedAt: iso(lastMs), notes: [] }) },
    ];
    for (const [label, lastMs] of [['fresh', 3600e3], ['stale', 3 * 86400e3]]) {
      const q = await open(b, { seedData: { profile: { name: '나', email: 'me@example.com' }, files: files(lastMs) }, hash: '#/settings?s=claude' });
      await q.waitForSelector('#s-claude .cl-state');
      await q.waitForTimeout(300);
      const c = q.locator('#s-claude');
      const labels = await c.locator('.sg-label b').allInnerTexts();
      const state = await c.locator('.cl-state').innerText();
      if (label === 'fresh') {
        ok(JSON.stringify(labels) === JSON.stringify(['상태', '마지막 정리', '정리한 노트', '정리 대기', '보내는 노트', '비용']) && state.includes('켜짐'), `claude on: status rows (${labels.join(', ')} · ${state.trim()})`);
        const vals = await c.locator('.cl-val').allInnerTexts();
        ok(vals[1] === '1개' && vals[2] === '1개' && vals[3] === '새 노트만' && vals[4].startsWith('0원'), `claude on: counts and cost (${vals.join(' / ')})`);
        ok((await c.locator('.cl-recent a').innerText()).includes('맥북 에어 비교') && (await c.locator('.cl-recent a').innerText()).includes('쇼핑 › 가전 › 노트북'), 'claude on: recently organized notes');
        ok(await c.locator('.cl-banner').count() === 0, 'claude on: no warning when it ran recently');
      } else {
        ok(state.includes('확인 필요') && await c.locator('.cl-banner').count() === 1, 'claude on: warns when notes wait and nothing ran for 2+ days');
      }
      ok(q.errors.length === 0, `claude ${label}: no page errors ` + q.errors.join(' | '));
      await q.context().close();
    }
  }

  // ---- 이미 정리된 노트는 다시 분류하지 않기 · 서랍 이름 바꿈 장부 ----
  {
    const { serializeNote, fileNameFor } = await import('../../js/core/note.js');
    const iso = (ms) => new Date(Date.now() - ms).toISOString().slice(0, 19);
    const mk = (id, meta, body, dir) => ({ dir, name: fileNameFor({ id, ...meta }), text: serializeNote({ meta: { id, type: 'memo', created: iso(5e6), updated: '2026-10-01T10:00:00', ...meta }, body }) });
    const q = await open(b, { seedData: { profile: { name: '나', email: 'me@example.com' }, files: [
      mk('20261101090000', { title: '맥북 에어 비교', status: 'organized', category: '쇼핑/가전/노트북', organized: iso(3600e3) }, '13인치와 15인치', '쇼핑/가전/노트북'),
      mk('20261101080000', { title: '김치찌개', status: 'organized', category: '요리/레시피' }, '김치찌개 끓이는 법', '요리/레시피'),
      mk('20261101070000', { title: '예전에 정리한 메모', status: 'inbox', organized: iso(7200e3) }, '자동 분류로 되돌린 노트', '00_인박스'),
      mk('20261101100000', { title: '새로 넣은 메모', status: 'inbox' }, '아직 정리 전', '00_인박스'),
      { dir: '_시스템', name: 'settings.json', text: JSON.stringify({ v: 2, rules: [], renames: [{ from: '쇼핑/가전', to: '쇼핑/전자기기', at: iso(86400e3) }] }) },
      { dir: '_시스템', name: 'index.json', text: JSON.stringify({ version: 1, generatedAt: iso(3600e3), notes: [] }) },
    ] }, hash: '#/settings?s=names' });
    const all = () => q.evaluate(() => window.__TD_APP__.lib.all.map((n) => ({ id: n.id, status: n.meta.status, category: n.meta.category ?? '', organized: n.meta.organized ?? '', updated: n.meta.updated ?? '', tags: n.meta.tags ?? [] })));
    const one = async (id) => (await all()).find((n) => n.id === id);
    await q.waitForSelector('#s-names .item-row');
    const groups = await q.$$eval('.sg-title', (els) => els.map((e) => e.firstChild.textContent.trim()));
    ok(groups.includes('바꾼 서랍 이름') && groups.indexOf('바꾼 서랍 이름') === groups.indexOf('분류 규칙') + 1, `names: ledger sits after 분류 규칙 (${groups.join(', ')})`);
    ok((await q.locator('#s-names .item-row').innerText()).replace(/\s+/g, ' ').includes('쇼핑 › 가전 쇼핑 › 전자기기'), 'names: ledger shows old → new');
    // 상태창: 한 번 정리한 노트(인박스로 돌아온 것 포함)는 정리 대기에 안 센다
    const c = q.locator('#s-claude');
    const labels = await c.locator('.sg-label b').allInnerTexts();
    const vals = await c.locator('.cl-val').allInnerTexts();
    ok(labels.includes('보내는 노트') && vals[labels.indexOf('정리 대기') - 1] === '1개' && vals.includes('새 노트만'), `claude: waits only for new notes (${labels.join(', ')} / ${vals.join(', ')})`);
    // 옛 이름에 남은 노트: 다시 분류하지 않고 옮기기만
    ok((await q.locator('#s-names').innerText()).includes('남은 노트 1개'), 'names: counts notes left under the old name');
    await q.click('#s-names .btn:has-text("옮기기")');
    await q.waitForSelector('.toast:has-text("새 이름으로 옮겼어요")');
    const mac = await one('20261101090000');
    ok(mac.category === '쇼핑/전자기기/노트북' && mac.updated === '2026-10-01T10:00:00' && mac.organized, `names: moved to the new name, edit time and Claude mark kept (${mac.category})`);
    ok(!(await q.locator('#s-names').innerText()).includes('남은 노트'), 'names: nothing left after moving');
    // 새 규칙: 이미 정리된 노트에도 원할 때만
    await q.click('#s-rules .sg-add');
    await q.fill('.sdlg input[aria-label="낱말 또는 사이트"]', '김치찌개');
    await q.selectOption('.sdlg select[aria-label="서랍"]', '__new');
    await q.fill('.sdlg input[aria-label="새 서랍 이름"]', '요리/찌개');
    await q.click('.sdlg .btn-primary');
    await q.waitForSelector('.toast:has-text("이미 정리된 노트 1개도 맞아요")');
    ok((await one('20261101080000')).category === '요리/레시피', 'rule: existing notes stay put until asked');
    await q.click('.toast button:has-text("그 노트도 옮기기")');
    await q.waitForSelector('.toast:has-text("규칙대로 맞췄어요")');
    ok((await one('20261101080000')).category === '요리/찌개', 'rule: one tap applies it to matching notes (no Claude)');
    // 서랍 이름 바꾸기: 서랍 화면 메뉴 → 이름만 바뀌고, 규칙의 서랍도 따라간다
    await q.goto(`http://localhost:8080/#/f/${encodeURIComponent('요리')}`);
    await q.waitForSelector('.page-hero h1');
    await q.click('.view-btn');
    await q.click('.pop >> text=서랍 이름 바꾸기');
    await q.waitForSelector('.sdlg');
    ok((await q.locator('.sdlg .sdlg-prev').innerText()).includes('정리된 노트 1개'), 'rename: dialog says how many notes move');
    await q.fill('.sdlg input[aria-label="새 이름"]', '부/엌');
    await q.click('.sdlg .btn-primary');
    ok((await q.locator('.sdlg-err').innerText()).includes('/'), 'rename: rejects a slash');
    await q.fill('.sdlg input[aria-label="새 이름"]', '부엌');
    await q.click('.sdlg .btn-primary');
    await q.waitForSelector('.toast:has-text("부엌")');
    await q.waitForTimeout(200);
    ok(decodeURIComponent(await q.evaluate(() => location.hash)) === '#/f/부엌' && (await q.locator('.page-hero h1').innerText()) === '부엌.', 'rename: lands on the renamed drawer');
    ok((await one('20261101080000')).category === '부엌/찌개', 'rename: notes moved to the new folder');
    const st = await q.evaluate(() => window.__TD_APP__.lib.settings);
    ok(st.rules[0].drawer === '부엌/찌개' && st.renames.some((r) => r.from === '요리' && r.to === '부엌'), 'rename: rules follow and the ledger records it');
    ok(!(await q.evaluate(() => window.__TD_APP__.lib.dirs)).some((d) => d === '요리' || d.startsWith('요리/')), 'rename: empty old folders removed');
    // Claude에게 다시 맡기기: 그 노트만
    await q.goto(`http://localhost:8080/#/n/20261101090000`);
    await q.waitForSelector('.ws-bar');
    await q.click('.ws-bar [aria-label="더 보기"]');
    await q.click('.pop >> text=Claude에게 다시 맡기기');
    await q.click('.modal .btn-primary:has-text("다시 맡기기")');
    await q.waitForSelector('.toast:has-text("Claude가 다시 봐요")');
    const back = await one('20261101090000');
    ok(back.status === 'inbox' && !back.organized && !back.category, 'requeue: only that note goes back to Claude');
    ok(q.errors.length === 0, 'names: no page errors ' + q.errors.join(' | '));
    await q.context().close();
  }

  // ---- 폰 「공유」로 받기 (안드로이드 설치 앱: 글·링크는 주소로, 사진은 서비스 워커가 잠시 저장) ----
  {
    const q = await open(b, { hash: '#/' });
    await q.waitForSelector('.hero');
    const list = () => q.evaluate(() => window.__TD_APP__.lib.all.map((n) => ({ id: n.id, type: n.meta.type, title: n.meta.title ?? '', source: n.meta.source ?? '', body: n.body ?? '' })));
    // 안드로이드는 주소를 글(text) 속에, 페이지 제목을 title 로 보낸다 → 제목을 살려 링크로, 분류도 제목으로
    await q.evaluate(() => { location.hash = '#/share?title=' + encodeURIComponent('성수동 파스타 맛집 솔직 후기 : 네이버 블로그') + '&text=' + encodeURIComponent('https://blog.naver.com/abc/223'); });
    await q.waitForSelector('.props');
    const blog = (await list()).find((n) => n.source === 'https://blog.naver.com/abc/223');
    ok(blog && blog.type === 'bookmark' && blog.title.includes('파스타 맛집'), `share: page title kept with the link (${blog?.title})`);
    ok((await q.locator('.props .mpill.auto').innerText()).includes('요리'), 'share: blog post about pasta lands in 요리·맛집, not 공부');
    // 제목 없이 주소만: 블로그는 「링크」 서랍에
    await q.evaluate(() => { location.hash = '#/share?text=' + encodeURIComponent('https://xxx.tistory.com/77'); });
    await q.waitForFunction(() => window.__TD_APP__.lib.all.some((n) => n.meta.source === 'https://xxx.tistory.com/77'));
    await q.waitForSelector('.props .mpill.auto');
    ok((await q.locator('.props .mpill.auto').innerText()).includes('링크'), 'share: a bare blog link waits in 링크 for Claude');
    // 사진 공유: 서비스 워커가 저장해 둔 것을 받기 화면이 꺼내 사진 노트로
    await q.evaluate(async () => {
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEKmBioDQDJPgP9pNMHlAAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      const cache = await caches.open('td-share');
      const base = new URL('__share/t1/', new URL('./', location.href)).href;
      await cache.put(base + '0', new Response(new Blob([png], { type: 'image/png' }), { headers: { 'content-type': 'image/png', 'x-name': 'shot.png' } }));
      await cache.put(base + 'info', new Response(JSON.stringify({ title: '', text: '오크우드 세일 캡처', url: '', files: 1 })));
      location.hash = '#/share?shared=t1';
    });
    await q.waitForFunction(() => window.__TD_APP__.lib.all.some((n) => n.meta.type === 'capture' && (n.body ?? '').includes('오크우드 세일 캡처')), null, { timeout: 15000 });
    ok(true, 'share: a shared screenshot becomes a photo note with its text');
    ok(await q.evaluate(async () => (await (await caches.open('td-share')).keys()).length === 0), 'share: the temporary copy is removed after taking it');
    await q.evaluate(() => { location.hash = '#/share?shared=nothing'; });
    await q.waitForSelector('.empty:has-text("받지 못했어요")');
    ok(true, 'share: says so when nothing is waiting');
    ok(q.errors.length === 0, 'share: no page errors ' + q.errors.join(' | '));
    await q.context().close();
  }
  // 아이폰 단축어: 「메모로 보내기」는 링크·글을 ?text=(URL 인코딩)로 열어 누를 것 없이 저장, 「사진 보내기」는 복사 후 ?paste=1
  {
    const q = await open(b, { hash: '' });
    await q.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
    await q.waitForSelector('.hero');
    const shared = 'https://www.instagram.com/reel/AbC123/?igsh=xYz&utm_source=ig';
    await q.goto(`http://localhost:8080/?text=${encodeURIComponent(shared)}`);
    await q.waitForFunction(() => window.__TD_APP__.lib.all.some((n) => (n.meta.source ?? '').startsWith('https://www.instagram.com/reel/AbC123')));
    await q.waitForSelector('.props');
    ok(decodeURIComponent(await q.evaluate(() => location.hash)).startsWith('#/n/'), 'iphone 메모로 보내기: a shared link is saved with no taps and its note opens');
    await q.goto(`http://localhost:8080/?text=${encodeURIComponent('[네이버지도]\n소금빵 베이커리\n서울 성동구 성수이로\nhttps://naver.me/abcd')}`);
    await q.waitForFunction(() => window.__TD_APP__.lib.all.some((n) => n.meta.source === 'https://naver.me/abcd'));
    await q.waitForSelector('.props .mpill.auto');
    ok((await q.locator('.props .mpill.auto').innerText()).includes('요리'), 'iphone 메모로 보내기: map share with a place name lands in 요리·맛집');
    // 사진 보내기: 붙여넣기 화면은 원래 모양 (서랍이, 제목, 버튼 하나)
    await q.goto('http://localhost:8080/?paste=1');
    await q.waitForSelector('.empty .btn-primary:has-text("붙여넣기")');
    ok(decodeURIComponent(await q.evaluate(() => location.hash)) === '#/paste' && await q.locator('.empty .mascot').count() === 1 && (await q.locator('.empty').innerText()).includes('바로 위'), 'iphone 사진 보내기: paste screen keeps the usual look and says where to tap');
    await q.evaluate(() => navigator.clipboard.writeText('https://www.musinsa.com/products/777'));
    await q.click('.empty .btn-primary');
    await q.waitForFunction(() => window.__TD_APP__.lib.all.some((n) => n.meta.source === 'https://www.musinsa.com/products/777'));
    ok(true, 'iphone 사진 보내기: a copied link is still saved if that is what was copied');
    await q.goto('http://localhost:8080/?paste=1');
    await q.waitForSelector('.empty .btn-primary');
    await q.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '내일 3시 치과 예약');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await q.waitForFunction(() => window.__TD_APP__.lib.all.some((n) => (n.body ?? '').includes('내일 3시 치과 예약')));
    ok(true, 'iphone 사진 보내기: a paste event also saves');
    await q.evaluate(() => navigator.clipboard.writeText(''));
    await q.goto('http://localhost:8080/?paste=1');
    await q.click('.empty .btn-primary');
    await q.waitForSelector('.toast:has-text("없어요")');
    ok(true, 'iphone 사진 보내기: says so when nothing was copied');
    ok(q.errors.length === 0, 'iphone shortcut: no page errors ' + q.errors.join(' | '));
    await q.context().close();
  }
  // 서비스 워커: 공유 POST 를 받아 사진은 저장하고 받기 화면으로, 글만 오면 주소에 실어 보낸다
  {
    const ctx = await b.newContext();
    const w = await ctx.newPage();
    await w.goto('http://localhost:8080/privacy.html');
    await w.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
    await w.reload();
    await w.waitForFunction(() => !!navigator.serviceWorker.controller);
    const r = await w.evaluate(async () => {
      const fd = new FormData();
      fd.append('title', '캡처');
      fd.append('files', new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' }));
      const res = await fetch('share-target', { method: 'POST', body: fd, redirect: 'manual' });
      const keys = (await (await caches.open('td-share')).keys()).map((k) => k.url.replace(location.origin, ''));
      return { type: res.type, keys };
    });
    ok(r.type === 'opaqueredirect' && r.keys.some((k) => /^\/__share\/[a-z0-9]+\/0$/.test(k)) && r.keys.some((k) => k.endsWith('/info')), `sw: shared photo kept for the app and sent on (${r.keys.join(', ')})`);
    // 안드로이드처럼 화면 이동으로 보내면: 글만 오면 앱 주소에 실어서
    await w.evaluate(() => {
      const f = Object.assign(document.createElement('form'), { method: 'POST', action: 'share-target', enctype: 'multipart/form-data' });
      for (const [k, v] of [['title', '제목'], ['text', 'https://example.com/x']]) f.appendChild(Object.assign(document.createElement('input'), { name: k, value: v }));
      document.body.appendChild(f);
      f.submit();
    });
    await w.waitForURL(/title=/);
    ok(decodeURIComponent(w.url()).includes('title=제목') && decodeURIComponent(w.url()).includes('text=https://example.com/x'), `sw: text-only share opens the app with it (${decodeURIComponent(w.url())})`);
    await ctx.close();
  }

  // ---- 낮 화면, 빈 서랍 ----
  p = await open(b, { seedData: { profile: { name: '나', email: 'me@example.com' }, files: [], quota: { limit: String(15 * 1024 ** 3), usage: String(14 * 1024 ** 3), usageInDrive: String(3 * 1024 ** 3) } } });
  await p.evaluate(() => { localStorage.setItem('td.theme', '"light"'); });
  await p.reload();
  await p.waitForSelector('.empty');
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light' && await p.locator('.empty').count() === 1, 'empty + light: headline and empty note');
  await p.click('.gnav .me');
  await p.waitForSelector('.pop .quota-warn');
  ok((await p.locator('.pop .quota-warn').innerText()).includes('거의 찼어요'), 'storage: warns when 90% full');
  await p.keyboard.press('Escape');
  ok(p.errors.length === 0, 'empty: no page errors ' + p.errors.join(' | '));
  await b.close();
})();
