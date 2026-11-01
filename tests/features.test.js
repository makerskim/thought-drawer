import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, learn } from '../js/core/classify.js';
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
  assert.equal(at('양자역학 너무 어렵다').path, '생각·기록/메모/양자역학');
  assert.ok(at('양자역학 너무 어렵다').weak);
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
  assert.equal(classify(note({}, '강아지 사료 바꾸기')).path, '집·생활/반려동물/강아지');
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
    ['냉장고 정리 팁', '집·생활/살림'], ['전세 계약 확정일자', '돈·재테크/부동산'], ['자동차 엔진오일 교체 주기', '집·생활/자동차'],
    ['무신사 겨울 패딩 세일 알림', '패션·뷰티'], ['배민 쿠폰 오늘까지', '요리·맛집/배달'], ['디즈니플러스 신작', '영상·음악/영화·드라마'],
    ['영양제 비타민D 주문', '건강·운동'], ['고양이 모래 주문', '집·생활/반려동물'], ['KTX 예매 부산', '여행/교통'],
    ['아이유 콘서트 예매', '영상·음악/공연·전시'], ['블로그 글감 아이디어', '생각·기록/아이디어'], ['오늘 하루 회고: 일찍 일어남', '생각·기록/일기'],
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
