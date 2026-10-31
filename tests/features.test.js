import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, learn } from '../js/core/classify.js';
import { readFilter, writeFilter, applyFilter, dateRange, facets, noteDate } from '../js/core/filter.js';
import { triggerAt, applyInsert, takeTokens, fillVars, matchSlash, BUILTINS, keyOk } from '../js/core/slash.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../js/core/settings.js';

const note = (meta, body = '') => ({ meta: { type: 'memo', ...meta }, body });

test('sub-drawers: site and words pick 서랍 › 세부 서랍', () => {
  const a = classify(note({ type: 'bookmark', source: 'https://www.coupang.com/vp/products/1' }, '가습기 비교'));
  assert.deepEqual([a.category, a.sub, a.path], ['쇼핑', '가전', '쇼핑/가전']);
  assert.equal(classify(note({}, '김치찌개 레시피: 재료는 김치')).path, '요리·맛집/레시피');
  assert.equal(classify(note({}, '다음 주 오사카 항공권 비교')).category, '여행');
  assert.equal(classify(note({}, '강아지 사료 바꾸기')).path, '집·생활/반려동물');
  assert.equal(classify(note({ type: 'bookmark', source: 'https://www.agoda.com/x' })).path, '여행/숙소');
});

test('sub-drawers can be turned off', () => {
  const r = classify(note({}, '김치찌개 레시피'), null, { subs: false });
  assert.deepEqual([r.path, r.sub], ['요리·맛집', '']);
});

test('one-syllable words do not hit inside other words', () => {
  assert.equal(classify(note({}, '이번 분기 책임 정리')).sub, '');
  assert.equal(classify(note({}, '읽은 책 정리')).path, '공부·자료/책');
});

test('a link inside a memo still counts as its site', () => {
  const r = classify(note({}, '청소기 비교 https://www.coupang.com/vp/1'));
  assert.equal(r.path, '쇼핑/가전');
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
  assert.deepEqual([r.path, r.tags[0]], ['쇼핑/가전', '브랜드']);
  assert.match(r.why, /내 규칙/);
  assert.equal(classify(note({ type: 'bookmark', source: 'https://www.musinsa.com/a' }), null, { rules }).path, '쇼핑/위시리스트');
});

test('learned sub-folders: my own 세부 서랍 names win', () => {
  const filed = [
    note({ status: 'organized', category: '쇼핑/전자제품', title: '모니터' }, '27인치 모니터'),
    note({ status: 'organized', category: '쇼핑/전자제품', title: '키보드' }, '무선 키보드'),
  ];
  const r = classify(note({}, '노트북 할인'), learn(filed));
  assert.equal(r.path, '쇼핑/전자제품');
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
  assert.equal(matchSlash('할', BUILTINS)[0].key, '할일');
  assert.equal(matchSlash('todo', BUILTINS)[0].key, '할일');
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
  const s = normalizeSettings({ classify: { subs: false, tags: '99' }, rules: [{ match: ' 가습기 ', drawer: '쇼핑 / 가전 / 더', tags: '#가전, 계절' }, { match: '', drawer: 'x' }], keywords: [{ key: '/회의', text: 'a' }, { key: '회의', text: 'b' }, { key: '띄 어', text: 'c' }] });
  assert.deepEqual(s.classify, { subs: false, tags: 8, learn: true });
  assert.deepEqual(s.rules, [{ match: '가습기', drawer: '쇼핑/가전', tags: ['가전', '계절'] }]);
  assert.deepEqual(s.keywords, [{ key: '회의', text: 'a' }]);
  assert.equal(normalizeSettings(null).keywords.length, DEFAULT_SETTINGS.keywords.length);
  assert.deepEqual(normalizeSettings({ keywords: [] }).keywords, []);
});
