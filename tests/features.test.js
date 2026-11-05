import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, learn, topOf } from '../js/core/classify.js';
import { readFilter, writeFilter, applyFilter, dateRange, facets, noteDate } from '../js/core/filter.js';
import { triggerAt, applyInsert, takeTokens, fillVars, matchSlash, BUILTINS, ALIASES, isLine, keyOk } from '../js/core/slash.js';
import { normalizeSettings, DEFAULT_SETTINGS, BASE_KEYWORDS } from '../js/core/settings.js';

const note = (meta, body = '') => ({ meta: { type: 'memo', ...meta }, body });
const two = (r) => [r.category, r.sub].filter(Boolean).join('/');

test('everything gets a drawer — no 기타 — and usually 대분류 › 중분류 › 소분류', () => {
  const inputs = ['내일 3시 치과', '와이파이 비번 abc12345', '010-1234-5678 김민수', '양자역학 너무 어렵다', '주말에 뭐하지',
    '롤 티어 올리기', '몬스테라 분갈이', '대통령 선거 토론', '여권 갱신 서류', '친구 결혼식 축의금', '- [ ] 은행 가기', '배고프다',
    '피곤하다 오늘 너무 힘들었다', '왜 하늘은 파랄까?', 'ㅋㅋㅋ', '음', '회사 가기 싫다', '넷플릭스 뭐 보지', '전기세 너무 많이 나왔다',
    'Buy milk and eggs', '버스 시간표', 'https://example.com/a', 'https://shop.example.co.kr/1', 'https://news.naver.com/article/1'];
  const rs = inputs.map((t) => (/^https?:/.test(t) ? classify(note({ type: 'bookmark', source: t })) : classify(note({}, t))));
  assert.deepEqual(rs.filter((r) => r.category === '기타' || !r.sub).map((r, i) => inputs[i]), []);
  assert.ok(rs.filter((r) => r.leaf).length >= inputs.length - 4, rs.map((r) => r.path).join(', '));
  const at = (t) => rs[inputs.indexOf(t)];
  assert.equal(at('내일 3시 치과').path, '건강·운동/병원/치과');
  assert.equal(at('010-1234-5678 김민수').path, '사람·연락/연락처/전화번호');
  assert.equal(at('양자역학 너무 어렵다').path, '지식·상식/과학/양자역학');
  const none = classify(note({}, '유리구슬 굴러간다'));
  assert.equal(none.path, '생각·기록/메모/유리구슬');
  assert.ok(none.weak);
  assert.equal(at('왜 하늘은 파랄까?').path, '생각·기록/질문/하늘');
  assert.equal(at('- [ ] 은행 가기').path, '할 일·일정/할 일/은행');
  assert.equal(at('https://shop.example.co.kr/1').path, '쇼핑/위시리스트/example');
  assert.equal(two(at('https://news.naver.com/article/1')), '뉴스·이슈/사회');
  // 시각·날짜는 내용이 없을 때만 일정으로 (내용이 있으면 내용대로)
  assert.equal(two(classify(note({}, '내일 오후 3시'))), '할 일·일정/일정');
  // 비슷한 말은 한 소분류로 묶는다
  assert.equal(classify(note({}, '아이폰 16 케이스')).leaf, '휴대폰');
  assert.equal(classify(note({}, '갤럭시 S25 사전예약')).leaf, '휴대폰');
});

test('sub-drawers: site and words pick 서랍 › 세부 서랍', () => {
  const a = classify(note({ type: 'bookmark', source: 'https://www.coupang.com/vp/products/1' }, '가습기 비교'));
  assert.deepEqual([a.category, a.sub, a.leaf, a.path], ['쇼핑', '가전', '생활가전', '쇼핑/가전/생활가전']);
  assert.equal(classify(note({}, '김치찌개 레시피: 재료는 김치')).path, '요리·맛집/레시피/찌개');
  assert.equal(classify(note({}, '다음 주 오사카 항공권 비교')).category, '여행');
  assert.equal(classify(note({}, '강아지 사료 바꾸기')).path, '반려동물/강아지/사료');
  assert.equal(classify(note({ type: 'bookmark', source: 'https://www.agoda.com/x' })).path, '여행/숙소/아고다');
});

test('sub-drawers can be turned off', () => {
  const r = classify(note({}, '김치찌개 레시피'), null, { subs: false });
  assert.deepEqual([r.path, r.sub, r.leaf], ['요리·맛집', '', '']);
});

test('one-syllable words do not hit inside other words', () => {
  assert.notEqual(classify(note({}, '이번 분기 책임 정리')).category, '공부·자료');
  assert.equal(two(classify(note({}, '읽은 책 정리'))), '공부·자료/책');
});

test('a link inside a memo still counts as its site', () => {
  const r = classify(note({}, '청소기 비교 https://www.coupang.com/vp/1'));
  assert.equal(r.path, '쇼핑/가전/청소기');
  assert.ok(r.tags.includes('쿠팡'));
});

test('auto tags: site name, then words in order, no fragments or duplicates', () => {
  const r = classify(note({ type: 'bookmark', source: 'https://www.musinsa.com/x' }, '니트 가디건 코디'));
  assert.deepEqual(r.tags, ['무신사', '니트', '가디건', '코디']);
  const t = classify(note({}, '다음 주 오사카 항공권'), null, { tags: 6 }).tags;
  assert.ok(t.includes('항공권') && !t.includes('항공'), t.join());
  assert.ok(!classify(note({}, '사고 싶은 가방')).tags.some((x) => x.includes(' ')));
  assert.deepEqual(classify(note({}, '김치찌개 레시피'), null, { tags: 0 }).tags, []);
});

test('auto tags reuse tags I already use when they appear in the text', () => {
  const model = learn([note({ status: 'organized', category: '공부·자료', tags: ['제텔카스텐'] }, 'x')]);
  assert.ok(classify(note({}, '제텔카스텐 메모 정리'), model).tags.includes('제텔카스텐'));
});

test('my rules beat everything and bring their own tags', () => {
  const rules = [{ match: '다이슨, 발뮤다', drawer: '쇼핑/가전', tags: ['브랜드'] }, { match: 'musinsa.com', drawer: '쇼핑/위시리스트', tags: [] }];
  const r = classify(note({}, '발뮤다 토스터 레시피'), null, { rules });
  assert.deepEqual([two(r), r.tags[0]], ['쇼핑/가전', '브랜드']);
  assert.match(r.why, /내 규칙/);
  assert.equal(two(classify(note({ type: 'bookmark', source: 'https://www.musinsa.com/a' }), null, { rules })), '쇼핑/위시리스트');
  // 규칙은 소분류까지 정할 수 있다
  const three = classify(note({}, '발뮤다 토스터'), null, { rules: [{ match: '발뮤다', drawer: '쇼핑/가전/발뮤다' }] });
  assert.equal(three.path, '쇼핑/가전/발뮤다');
});

test('learned sub-folders: my own 세부 서랍 names win', () => {
  const filed = [
    note({ status: 'organized', category: '쇼핑/전자제품', title: '모니터' }, '27인치 모니터'),
    note({ status: 'organized', category: '쇼핑/전자제품', title: '키보드' }, '무선 키보드'),
  ];
  const r = classify(note({}, '노트북 할인'), learn(filed));
  assert.equal(r.path, '쇼핑/전자제품/노트북·태블릿');
});

test('filters: dates, types, drawers, tags, sites, conditions', () => {
  const now = new Date(2026, 9, 31, 15, 0); // 2026-10-31 (토)
  const mk = (id, meta, body = '') => ({ id, meta: { id, type: 'memo', ...meta }, body });
  const notes = [
    mk('20261031090000', { type: 'bookmark', source: 'https://www.coupang.com/1', tags: ['가전'] }, '- [ ] 사기'),
    mk('20261030090000', { tags: ['가전', '세일'] }, '- [x] 끝'),
    mk('20261026090000', { pinned: true }, ''),
    mk('20261001090000', { type: 'capture', attachments: ['a.jpg'] }, ''),
    mk('20250101090000', {}, ''),
  ];
  const cats = { '20261031090000': ['쇼핑', '가전'], '20261030090000': ['쇼핑', ''], '20261026090000': ['여행', '숙소'] };
  const ctx = { now, cat: (n) => { const [name = '기타', sub = ''] = cats[n.id] ?? []; return { name, sub, path: sub ? `${name}/${sub}` : name, auto: n.id !== '20261030090000' }; }, tags: (n) => n.meta.tags ?? [] };
  const ids = (f) => applyFilter(notes, { ...readFilter(''), ...f }, ctx).map((n) => n.id.slice(0, 8));
  assert.deepEqual(ids({ d: 'today' }), ['20261031']);
  assert.deepEqual(ids({ d: 'yesterday' }), ['20261030']);
  assert.deepEqual(ids({ d: 'week' }), ['20261031', '20261030', '20261026']); // 월요일(10/26)부터
  assert.deepEqual(ids({ d: 'month' }), ['20261031', '20261030', '20261026', '20261001']);
  assert.deepEqual(ids({ d: 'custom', from: '2026-10-01', to: '2026-10-26' }), ['20261026', '20261001']);
  assert.deepEqual(ids({ type: ['capture'] }), ['20261001']);
  assert.deepEqual(ids({ dr: '쇼핑' }), ['20261031', '20261030']);
  assert.deepEqual(ids({ dr: '쇼핑/가전' }), ['20261031']);
  assert.deepEqual(ids({ tag: ['가전', '세일'] }), ['20261030']);
  assert.deepEqual(ids({ site: 'coupang.com' }), ['20261031']);
  assert.deepEqual(ids({ has: ['open'] }), ['20261031']);
  assert.deepEqual(ids({ has: ['done'] }), ['20261030']);
  assert.deepEqual(ids({ has: ['pinned'] }), ['20261026']);
  assert.deepEqual(ids({ has: ['photo'] }), ['20261001']);
  assert.deepEqual(ids({ has: ['mine'] }), ['20261030']);
  assert.deepEqual(ids({ sort: 'old' })[0], '20250101');
  const fx = facets(notes, ctx);
  assert.equal(fx.tags[0][0], '가전');
  assert.equal(fx.drawers.get('쇼핑'), 2);
  assert.equal(fx.has.get('open'), 1);
  assert.equal(noteDate(notes[0]).getDate(), 31);
  assert.equal(dateRange('nope'), null);
});

test('filters round-trip through the address', () => {
  const f = { ...readFilter(''), d: 'custom', from: '2026-10-01', to: '2026-10-31', type: ['memo', 'bookmark'], dr: '쇼핑/가전', tag: ['가전'], has: ['open'], sort: 'old' };
  const q = writeFilter(f, { q: '청소기' });
  const back = readFilter(q.slice(1));
  assert.deepEqual({ ...back }, { ...f });
  assert.equal(new URLSearchParams(q.slice(1)).get('q'), '청소기');
  assert.equal(writeFilter(readFilter('')), '');
});

test('slash: trigger, insert, keyword values', () => {
  assert.deepEqual(triggerAt('메모 /할', 5), { char: '/', query: '할', start: 3, end: 5 });
  assert.equal(triggerAt('https://a.com/x', 15), null); // 주소 안의 / 는 아님
  assert.equal(triggerAt('#태그', 3).char, '#');
  assert.equal(triggerAt('a@b', 3), null); // 이메일
  const now = new Date(2026, 9, 31, 9, 5);
  assert.equal(fillVars('{오늘} {지금} {요일} {내일}', now), '2026-10-31 09:05 토요일 2026-11-01');
  const t = applyInsert('우유 /할', triggerAt('우유 /할', 5), '- [ ] ', { line: true });
  assert.deepEqual([t.text, t.caret], ['우유\n- [ ] ', 9]);
  assert.equal(applyInsert('/할', triggerAt('/할', 2), '- [ ] ', { line: true }).text, '- [ ] ');
  assert.equal(applyInsert('회의록 /오늘', triggerAt('회의록 /오늘', 7), '{오늘}', { now }).text, '회의록 2026-10-31');
  const items = [...DEFAULT_SETTINGS.keywords.map((k) => ({ key: k.key, alias: ALIASES[k.key] ?? [] })), ...BUILTINS];
  assert.equal(matchSlash('할', items)[0].key, '할일');
  assert.equal(matchSlash('todo', items)[0].key, '할일');
  assert.equal(matchSlash('사', items)[0].key, '사진');
  assert.ok(isLine('- [ ] ') && isLine('\n- [ ] ') && !isLine('{오늘}') && !isLine('#읽을거리 '));
  assert.ok(keyOk('회의') && !keyOk('회 의') && !keyOk('') && !keyOk('a/b'));
});

test('tokens: #태그 and known @서랍 leave the text, others stay', () => {
  const r = takeTokens('가습기 비교 #가전 #세일 @쇼핑/가전 https://a.com/#top', { drawers: ['쇼핑', '쇼핑/가전'] });
  assert.deepEqual(r.tags, ['가전', '세일']);
  assert.equal(r.drawer, '쇼핑/가전');
  assert.equal(r.text, '가습기 비교 https://a.com/#top');
  const ig = takeTokens('@nike 신상 #1 #2위', { drawers: ['쇼핑'] });
  assert.equal(ig.drawer, '');
  assert.deepEqual(ig.tags, ['2위']);
  assert.match(ig.text, /^@nike 신상 #1$/);
  assert.equal(takeTokens('# 제목\n본문').text, '# 제목\n본문');
  assert.equal(takeTokens('메모 @새서랍', { allow: ['새서랍'] }).drawer, '새서랍');
});

test('shared settings are cleaned up', () => {
  const s = normalizeSettings({ v: 2, classify: { subs: false, tags: '99' }, rules: [{ match: ' 가습기 ', drawer: '쇼핑 / 가전 / 가습기 / 더', tags: '#가전, 계절' }, { match: '', drawer: 'x' }], keywords: [{ key: '/회의', text: 'a' }, { key: '회의', text: 'b' }, { key: '띄 어', text: 'c' }] });
  assert.deepEqual(s.classify, { subs: false, tags: 8, learn: true });
  assert.deepEqual(s.rules, [{ match: '가습기', drawer: '쇼핑/가전/가습기', tags: ['가전', '계절'] }]);
  assert.deepEqual(s.keywords, [{ key: '회의', text: 'a' }]);
  assert.equal(normalizeSettings(null).keywords.length, DEFAULT_SETTINGS.keywords.length);
  assert.deepEqual(normalizeSettings({ v: 2, keywords: [] }).keywords, []);
  // 예전(v1) 파일에는 고칠 수 있게 된 기본 명령어를 채워 준다 (이미 있는 이름은 그대로)
  const old = normalizeSettings({ v: 1, keywords: [{ key: '오늘', text: '{요일}' }, { key: '회의', text: 'a' }] }).keywords;
  assert.deepEqual(old.map((k) => k.key), [...BASE_KEYWORDS.filter((b) => b.key !== '오늘').map((b) => b.key), '오늘', '회의']);
  assert.equal(old.find((k) => k.key === '오늘').text, '{요일}');
});

test('realistic notes land in the right drawer (longest word wins, brands, weak shop words)', () => {
  const cases = [
    ['운동화 270 사이즈 나이키', '패션·뷰티/신발·가방'], ['러닝 30분 했다', '건강·운동/운동'], ['카페인 줄이기', '건강·운동/식단'],
    ['시계열 데이터 분석 공부', '공부·자료'], ['고기압 영향으로 맑음', '뉴스·이슈/날씨'], ['회의적인 생각이 든다', '생각·기록'],
    ['주식회사 계약서 검토', '일·업무'], ['삼성전자 주식 10주 매수', '돈·재테크/투자'], ['세탁기 고장 AS 접수', '집·생활/살림'],
    ['냉장고 정리 팁', '집·생활/살림'], ['전세 계약 확정일자', '돈·재테크/부동산'], ['자동차 엔진오일 교체 주기', '자동차·교통/자동차 관리'],
    ['무신사 겨울 패딩 세일 알림', '패션·뷰티'], ['배민 쿠폰 오늘까지', '요리·맛집/배달'], ['디즈니플러스 신작', '영상·음악/영화·드라마'],
    ['영양제 비타민D 주문', '건강·운동'], ['고양이 모래 주문', '반려동물/고양이'], ['KTX 예매 부산', '여행/교통'],
    ['아이유 콘서트 예매', '영상·음악/공연·전시'], ['블로그 글감 아이디어', '생각·기록/아이디어'], ['오늘 하루 회고: 일찍 일어남', '생각·기록/회고'],
    ['새해 다짐: 매일 30분 독서', '생각·기록/목표'], ['토스트 만들기', '요리·맛집/레시피'], ['테니스 코트 예약', '건강·운동/운동'],
  ];
  const wrong = cases.map(([t, want]) => [t, want, classify(note({}, t))]).filter(([, want, r]) => (want.includes('/') ? two(r) !== want : r.category !== want));
  assert.deepEqual(wrong.map(([t, want, r]) => `${t} → ${r.path} (기대 ${want})`), []);
});

test('sun times for 자동 brightness (Seoul)', async () => {
  const { sunTimes, themeByTime } = await import('../js/core/sun.js');
  const seoul = { lat: 37.57, lon: 126.98, tz: 540 };
  const near = (got, h, m) => Math.abs(got - (h * 60 + m)) <= 8;
  const nov = sunTimes(new Date(2026, 10, 1, 12), seoul);
  assert.ok(near(nov.rise, 6, 55) && near(nov.set, 17, 35), JSON.stringify(nov));
  const jun = sunTimes(new Date(2026, 5, 21, 12), seoul);
  assert.ok(near(jun.rise, 5, 11) && near(jun.set, 19, 57), JSON.stringify(jun));
  assert.equal(themeByTime(new Date(2026, 10, 1, 13, 0), seoul), 'light');
  assert.equal(themeByTime(new Date(2026, 10, 1, 18, 30), seoul), 'dark');
  assert.equal(themeByTime(new Date(2026, 10, 1, 6, 0), seoul), 'dark');
});

test('related notes: shared words, tags, sites and drawers — but a drawer alone is not enough', async () => {
  const { buildIndex, relatedTo, relatedEdges } = await import('../js/core/related.js');
  const N = (id, title, body, extra = {}) => ({ id, meta: { id, title, ...extra }, body });
  const notes = [
    N('1', '흰색 옥스포드 셔츠', '오크우드 스튜디오 옥스포드 셔츠 35,000원', { tags: ['셔츠'] }),
    N('2', '가을 레이어드 코디', '흰 셔츠에 차콜 가디건', { tags: ['셔츠', '출근룩'] }),
    N('3', '들기름 막국수', '메밀면 삶아 들기름 간장'),
    N('4', '토마토 달걀볶음', '토마토 볶고 달걀 반숙'),
    N('5', '가습기 비교', '', { source: 'https://www.coupang.com/vp/1' }),
    N('6', '전기 포트 최저가', '', { source: 'https://www.coupang.com/vp/2' }),
    N('7', '오크우드 시즌오프', '옥스포드 셔츠 최대 40%'),
  ];
  const cats = { 1: ['패션', '옷'], 2: ['패션', '옷'], 3: ['요리', '레시피'], 4: ['요리', '레시피'], 5: ['쇼핑', '가전'], 6: ['쇼핑', '가전'], 7: ['쇼핑', ''] };
  const idx = buildIndex(notes, { cat: (n) => ({ name: cats[n.id][0], sub: cats[n.id][1] }), tags: (n) => n.meta.tags ?? [] });
  const near = relatedTo(idx, '1', { limit: 5 });
  assert.deepEqual(near.map((r) => r.id).sort(), ['2', '7']);
  assert.ok(near.find((r) => r.id === '2').why.includes('#셔츠'));
  assert.ok(near.find((r) => r.id === '7').why.some((w) => w.includes('옥스포드')));
  assert.deepEqual(relatedTo(idx, '3').map((r) => r.id), [], 'two recipes with nothing in common are not linked just for sharing a drawer');
  assert.deepEqual(relatedTo(idx, '5').map((r) => r.id), ['6'], 'same shopping site + same drawer');
  const edges = relatedEdges(idx, { linked: new Set(['1|2']) });
  assert.ok(!edges.some((e) => [e.a, e.b].sort().join('|') === '1|2'), 'already linked pairs are not suggested again');
  assert.ok(edges.some((e) => [e.a, e.b].sort().join('|') === '5|6'));
});

test('search also finds notes by their auto drawer, 소분류 and auto tags', async () => {
  const { search } = await import('../js/core/search.js');
  const N = (id, body) => ({ id, meta: { id, type: 'memo' }, body });
  const notes = [N('1', '아이폰 16 케이스 살까'), N('2', '제주 애월 숙소'), N('3', '양자역학 너무 어렵다')];
  const auto = (n) => { const r = classify({ meta: n.meta, body: n.body }); return { path: r.path, tags: r.tags }; };
  assert.deepEqual(search(notes, '휴대폰').map((r) => r.note.id), []);
  assert.deepEqual(search(notes, '휴대폰', { auto }).map((r) => r.note.id), ['1']);
  assert.deepEqual(search(notes, '서랍:여행', { auto }).map((r) => r.note.id), ['2']);
  assert.deepEqual(search(notes, '과학', { auto }).map((r) => r.note.id), ['3']);
});

test('링크: 주소로 알 수 있으면 그 서랍, 모르면 「링크 › 사이트」(Claude 정리 때 내용을 읽어 나눈다)', async () => {
  const { linkNote } = await import('../js/core/compose.js');
  const { urlWords } = await import('../js/core/classify.js');
  const at = (url, title = '') => classify(linkNote({ url, title })).path;
  // 주소만으로는 모르는 곳 → 링크 › 사이트 이름 (공부·자료로 보내지 않는다)
  assert.equal(at('https://blog.naver.com/foodie123/223456789012'), '링크/네이버 블로그');
  assert.equal(at('https://xxx.tistory.com/123'), '링크/티스토리');
  assert.equal(at('https://www.instagram.com/reel/C1abcDEF/'), '링크/인스타그램', '앱이 적은 「릴스를 저장했어요」로 분류하지 않는다');
  assert.equal(at('https://naver.me/5abcdEF'), '링크/네이버 공유');
  assert.equal(at('https://cafe.naver.com/joonggonara/123'), '링크/네이버 카페');
  assert.equal(at('https://example.com/a'), '링크/example');
  // 사이트로 아는 곳
  assert.equal(topOf(at('https://www.musinsa.com/products/1234567')), '패션·뷰티');
  assert.equal(topOf(at('https://www.stylenanda.com/product/detail.html?product_no=12345')), '패션·뷰티');
  assert.equal(topOf(at('https://www.bluer.co.kr/restaurants/123')), '요리·맛집');
  assert.equal(topOf(at('https://www.coupang.com/vp/products/123')), '쇼핑');
  assert.equal(at('https://unknown-mall.co.kr/product/detail.html?product_no=9'), '쇼핑/위시리스트/unknown-mall', '상품 페이지 꼴은 쇼핑');
  // 주소 속 낱말: 한글 상품명, 영어 낱말
  assert.equal(urlWords('https://a.co.kr/product/%EB%A6%B0%EB%84%A8-%EC%85%94%EC%B8%A0/1'), '린넨 셔츠');
  assert.equal(urlWords('https://shop.example.com/collections/women-dresses/products/linen-midi-dress?utm=x'), '원피스 원피스');
  assert.equal(topOf(at('https://www.somebrand.co.kr/product/%EB%A6%B0%EB%84%A8-%EC%98%A4%EB%B2%84%ED%95%8F-%EC%85%94%EC%B8%A0/123/')), '패션·뷰티');
  assert.equal(topOf(at('https://www.allbirds.co.kr/products/mens-tree-runners')), '패션·뷰티');
  // 공유로 온 제목이 있으면 내용이 먼저 (블로그 맛집 글 → 맛집, 유튜브 레시피 → 레시피)
  assert.equal(at('https://blog.naver.com/abc/1', '성수동 파스타 맛집 솔직 후기 : 네이버 블로그').split('/').slice(0, 2).join('/'), '요리·맛집/맛집');
  assert.equal(topOf(at('https://blog.naver.com/abc/2', '가을 출근룩 코디 추천, 니트 가디건')), '패션·뷰티');
  assert.equal(at('https://www.youtube.com/watch?v=1', '10분 김치찌개 레시피').split('/').slice(0, 2).join('/'), '요리·맛집/레시피');
  assert.equal(at('https://www.youtube.com/watch?v=2'), '영상·음악/영상/유튜브', '글이 없으면 영상');
  // 인스타: 컬렉션 이름과 계정 이름의 낱말
  const ig = linkNote({ url: 'https://www.instagram.com/p/BBB/' });
  assert.equal(topOf(classify({ meta: { ...ig.meta, author: 'seoul_foodie' }, body: ig.body }).path), '요리·맛집');
});

test('아이폰 단축어 주소: 인코딩했든 안 했든 ?text= 뒤를 통째로, 잘못 만들었으면 이유를', async () => {
  const { shareTarget } = await import('../js/core/shortcut.js');
  const text = (t) => new URLSearchParams(t.split('?')[1]).get('text');
  // URL 인코딩 없이 보낸 주소: 공유한 주소 속 & 와 # 까지 살린다
  assert.equal(text(shareTarget('?text=https://m.blog.naver.com/PostView.naver?blogId=abc&logNo=223', '')), 'https://m.blog.naver.com/PostView.naver?blogId=abc&logNo=223');
  assert.equal(text(shareTarget('?text=https://example.com/a', '#part2')), 'https://example.com/a#part2');
  assert.equal(text(shareTarget('?text=https://www.instagram.com/reel/AbC/?igsh=x', '')), 'https://www.instagram.com/reel/AbC/?igsh=x');
  // URL 인코딩해서 보낸 주소
  assert.equal(text(shareTarget(`?text=${encodeURIComponent('https://a.com/x?b=1&c=2')}`, '')), 'https://a.com/x?b=1&c=2');
  assert.equal(text(shareTarget(`?text=${encodeURIComponent('[네이버지도]\n소금빵\nhttps://naver.me/x')}`, '')), '[네이버지도]\n소금빵\nhttps://naver.me/x');
  // 브라우저가 한글·띄어쓰기를 바꿔 둔 주소, 깨진 %
  assert.equal(text(shareTarget('?text=%EB%A9%94%EB%AA%A8%20%ED%95%98%EB%82%98', '')), '메모 하나');
  assert.equal(text(shareTarget('?text=100%25 맞음 50%', '')), '100%25 맞음 50%');
  // 잘못 만든 단축어
  assert.equal(shareTarget('?text=', ''), '#/share?oops=empty');
  assert.equal(shareTarget(`?text=${encodeURIComponent('단축어 입력')}`, ''), '#/share?oops=var');
  assert.equal(shareTarget(`?text=${encodeURIComponent('URL 인코딩된 텍스트')}`, ''), '#/share?oops=var');
  assert.equal(shareTarget('?text=IMG_1234.PNG', ''), '#/share?oops=photo');
  // 그 밖: 사진 붙여넣기, 안드로이드 공유, 정리기 토큰, 아무것도 아님
  assert.equal(shareTarget('?paste=1', ''), '#/paste');
  assert.equal(shareTarget('?title=%EC%A0%9C%EB%AA%A9&text=https%3A%2F%2Fa.com', ''), '#/share?title=%EC%A0%9C%EB%AA%A9&text=https%3A%2F%2Fa.com');
  assert.equal(shareTarget('?state=td-code&code=1', ''), '');
  assert.equal(shareTarget('', '#/settings'), '');
});

test('아이폰 「사진 보내기」: 주소에 실려 온 Base64 사진을 읽는다 (줄 바꿈·%인코딩·URL용 글자도)', async () => {
  const { imageFromBase64 } = await import('../js/core/shortcut.js');
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP4z8DwnwEKmBioDQDJPgP9pNMHlAAAAABJRU5ErkJggg==';
  const ok = (raw) => imageFromBase64(raw)?.type;
  assert.equal(ok(PNG), 'image/png');
  assert.equal(ok(PNG.replace(/(.{20})/g, '$1\n')), 'image/png', '76자마다 줄 바꿈이 있어도');
  assert.equal(ok(encodeURIComponent(PNG)), 'image/png', '%인코딩돼도');
  assert.equal(ok(PNG.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')), 'image/png', 'URL용 Base64');
  assert.equal(ok(PNG.replace(/\+/g, ' ')), 'image/png', '+ 가 띄어쓰기로 바뀌어도');
  assert.equal(ok(`data:image/png;base64,${PNG}`), 'image/png');
  assert.equal(ok(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]).toString('base64')), 'image/jpeg');
  assert.equal(imageFromBase64('Base64 인코딩된 텍스트'), null);
  assert.equal(imageFromBase64(Buffer.from('hello world, not an image').toString('base64')), null);
  assert.equal(imageFromBase64(''), null);
});

test('아이폰 「메모로 보내기」(Base64): #t= 로 온 글을 읽는다 (주소 속 https:// 가 둘로 읽히지 않게)', async () => {
  const { shareTarget, textFromBase64 } = await import('../js/core/shortcut.js');
  const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
  const text = (h) => new URLSearchParams(shareTarget('', h).split('?')[1]).get('text');
  const ig = 'https://www.instagram.com/reel/DAbc123/?igsh=MTc4bW9xZGxyZGx6Nw==';
  assert.equal(text(`#t=${encodeURIComponent(b64(ig))}`), ig, 'Base64 → URL 인코딩');
  assert.equal(text(`#t=${b64(ig)}`), ig, 'URL 인코딩 없이');
  assert.equal(text(`#t=${encodeURIComponent(b64(ig).replace(/(.{8})/g, '$1\r\n'))}`), ig, '76자마다 줄 바꿈이 있어도');
  const memo = '[네이버지도]\n소금빵 베이커리\nhttps://naver.me/abcd';
  assert.equal(text(`#t=${encodeURIComponent(b64(memo))}`), memo, '한글과 줄 바꿈');
  assert.equal(textFromBase64(encodeURIComponent('그냥 글자')), '그냥 글자', 'Base64 가 아니면 그대로');
  assert.equal(shareTarget('', '#t='), '#/share?oops=empty');
  assert.equal(shareTarget('', `#t=${b64('IMG_0001.PNG')}`), '#/share?oops=photo');
});

test('사진을 받지 못했을 때 받은 것으로 고칠 곳을 짚는다', async () => {
  const { photoTrouble } = await import('../js/core/shortcut.js');
  assert.match(photoTrouble('', 0), /0자.*줄 바꿈.*변환된 이미지/);
  assert.match(photoTrouble(null, 250000), /250,000자.*너무 커서/);
  assert.match(photoTrouble('IMG_1234.PNG', 12), /사진 대신 「IMG_1234\.PNG」.*Base64로 인코딩됨/);
  assert.match(photoTrouble(encodeURIComponent('스크린샷 2026-11-05 오전 10.00.00'), 60), /사진 대신 「스크린샷/);
  assert.match(photoTrouble('A'.repeat(5000), 5000), /5,000자.*사진으로 읽지 못했어요/);
});

test('링크의 사이트 이름과 보이는 이름: 「무신사 상품」「네이버 블로그 글」', async () => {
  const { siteOf } = await import('../js/core/classify.js');
  const { displayTitle } = await import('../js/core/note.js');
  assert.equal(siteOf('https://www.musinsa.com/products/1'), '무신사');
  assert.equal(siteOf('https://blog.naver.com/a/1'), '네이버 블로그');
  assert.equal(siteOf('https://shop.unknown-brand.co.kr/x'), 'unknown-brand');
  const t = (source, site = '') => displayTitle({ type: 'bookmark', source, site }, '');
  assert.equal(t('https://www.musinsa.com/products/1', '무신사'), '무신사 상품');
  assert.equal(t('https://blog.naver.com/a/1', '네이버 블로그'), '네이버 블로그 글');
  assert.equal(t('https://www.youtube.com/watch?v=1', '유튜브'), '유튜브 영상');
  assert.equal(t('https://a.co.kr/product/%EB%A6%B0%EB%84%A8-%EC%85%94%EC%B8%A0/1', 'a'), 'a 상품 · 린넨 셔츠');
  assert.equal(t('https://example.com/a'), 'example.com 링크');
  assert.equal(displayTitle({ type: 'bookmark', source: 'https://a.com', title: '직접 단 제목' }, ''), '직접 단 제목');
  // 사이트 이름은 분류에 쓰지 않는다 (블로그는 그대로 「링크」에서 기다린다)
  assert.equal(classify({ meta: { type: 'bookmark', source: 'https://blog.naver.com/a/1', site: '네이버 블로그' }, body: '' }).category, '링크');
});

test('드라이브: 동기화보다 저장이 먼저 시작돼도(공유로 막 열었을 때) 「메모」 폴더를 찾은 뒤 그 안에 쓴다', async () => {
  const { createDriveAdapter } = await import('../js/store/drive.js');
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    calls.push(`${opts.method ?? 'GET'} ${u}`);
    const json = (x) => ({ ok: true, status: 200, json: async () => x });
    if (u.includes("tdRole")) return json({ files: [{ id: 'ROOT' }] });
    if (u.includes("'ROOT' in parents")) return json({ files: [] }); // 00_인박스 아직 없음
    if (u.includes('/upload/')) return json({ id: 'NOTE', name: 'n.md', parents: ['DIR'], modifiedTime: 't' });
    if ((opts.method ?? 'GET') === 'POST' && u.includes('/drive/v3/files?')) { const b = JSON.parse(opts.body); return json({ id: 'DIR', name: b.name, parents: b.parents }); }
    return json({ files: [] });
  };
  try {
    const adapter = createDriveAdapter({ token: () => 'x', ready: async () => {}, profile: { email: 'me@example.com' } });
    // init() 없이 바로 쓴다
    const f = await adapter.writeNote({ dir: '00_인박스', name: 'n.md', text: 'hi' });
    assert.equal(f.dir, '00_인박스');
    assert.ok(calls[0].includes('tdRole'), `먼저 메모 폴더를 찾는다: ${calls[0]}`);
    const made = calls.find((c) => c.startsWith('POST') && c.includes('/drive/v3/files?') && !c.includes('/upload/'));
    assert.ok(made, '인박스 폴더를 만든다');
    assert.ok(!calls.some((c) => c.includes("'null' in parents")), '부모 없는(null) 폴더 찾기를 하지 않는다');
  } finally { globalThis.fetch = realFetch; }
});

test('Claude 정리기가 쓰는 서랍 목록(organizer/taxonomy.json)이 앱 사전과 같다', async () => {
  const { readFileSync } = await import('node:fs');
  const { treeJson } = await import('../tools/export-taxonomy.mjs');
  assert.equal(readFileSync(new URL('../organizer/taxonomy.json', import.meta.url), 'utf8'), treeJson(), 'node tools/export-taxonomy.mjs 를 실행하세요');
});

test('서랍 이름 바꿈 장부: 경로 앞부분만, 긴 것 먼저, 이어진 바꿈, 되돌리기', async () => {
  const { readFileSync } = await import('node:fs');
  const { renamePath, addRename, normalizeRenames, renamesOf, nameProblem } = await import('../js/core/renames.js');
  const fx = JSON.parse(readFileSync(new URL('./fixtures/renames.json', import.meta.url), 'utf8'));
  for (const c of fx.cases) assert.equal(renamePath(c.path, c.renames), c.want, JSON.stringify(c));
  const { foldRenames, stableTarget } = await import('../js/core/renames.js');
  for (const c of fx.folds) assert.deepEqual(foldRenames(c.list).map(({ from, to }) => ({ from, to })), c.want, JSON.stringify(c));
  // 꼬인 장부(A→B, B→A)여도 파일은 왔다 갔다 하지 않는다
  assert.equal(stableTarget('A', [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]), '');
  assert.equal(stableTarget('A/x', [{ from: 'A', to: 'B' }]), 'B/x');
  // A→B 다음 B→C 면 A→C 로 줄이고, A→B 다음 B→A 면 장부가 비어 원래대로
  assert.deepEqual(addRename([{ from: 'A', to: 'B' }], 'B', 'C').map((r) => `${r.from}>${r.to}`), ['A>C', 'B>C']);
  assert.deepEqual(addRename([{ from: 'A', to: 'B' }], 'B', 'A').map((r) => `${r.from}>${r.to}`), ['B>A']);
  assert.deepEqual(addRename([{ from: '쇼핑/가전', to: '쇼핑/전자' }], '쇼핑', '구매').map((r) => `${r.from}>${r.to}`), ['쇼핑/가전>구매/전자', '쇼핑>구매']);
  assert.deepEqual(normalizeRenames([{ from: 'a', to: 'a' }, { from: '', to: 'b' }, { from: 'x', to: 'y' }, { from: 'x', to: 'z' }]), [{ from: 'x', to: 'z' }]);
  assert.equal(renamesOf({ renames: [{ from: '쇼핑', to: '구매' }] }).length, 1);
  assert.equal(nameProblem('구매'), '');
  for (const bad of ['', 'a/b', '_시스템', '00_인박스', '가'.repeat(21), 'a#b']) assert.ok(nameProblem(bad), bad);
  // 설정 파일에도 장부가 남는다 (잘못된 줄은 버린다)
  assert.deepEqual(normalizeSettings({ renames: [{ from: '쇼핑', to: '구매', at: 't' }, { from: 'x' }] }).renames, [{ from: '쇼핑', to: '구매', at: 't' }]);
  assert.deepEqual(normalizeSettings(null).renames, []);
});

test('기본 서랍 이름 지킴이: 이름이 사라지면 RENAMED 에 적어야 한다', async () => {
  const { lostNames } = await import('../tools/export-taxonomy.mjs');
  const known = ['쇼핑', '쇼핑/가전', '여행'];
  const now = ['쇼핑', '쇼핑/전자기기', '여행'];
  assert.deepEqual(lostNames(known, now, []), ['쇼핑/가전']);
  assert.deepEqual(lostNames(known, now, [{ from: '쇼핑/가전', to: '쇼핑/전자기기' }]), []);
  assert.deepEqual(lostNames(known, ['구매', '구매/가전', '여행'], [{ from: '쇼핑', to: '구매' }]), []);
});

test('나만 쓰기: 주인 계정만 통과 (메일 주소는 지문으로만 비교)', async () => {
  const { isOwner } = await import('../js/store/auth.js');
  const { createHash } = await import('node:crypto');
  const fp = (e) => createHash('sha256').update(e).digest('hex');
  const owners = [fp('me@example.com')];
  assert.equal(await isOwner('me@example.com', owners), true);
  assert.equal(await isOwner('  Me@Example.com ', owners), true, '대소문자·앞뒤 빈칸 무시');
  assert.equal(await isOwner('stranger@example.com', owners), false);
  assert.equal(await isOwner('', owners), false);
  assert.equal(await isOwner('anyone@example.com', []), true, '비우면 누구나');
  const { readFileSync } = await import('node:fs');
  const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  assert.ok(!/@gmail\.com/.test(config), '공개 코드에 메일 주소를 두지 않는다');
});
