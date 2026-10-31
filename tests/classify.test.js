import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, learn, OTHER, resolveName, CATEGORIES } from '../js/core/classify.js';
import { parseBookmarks, isBookmarksFile } from '../js/core/bookmarks.js';

const note = (meta, body = '') => ({ meta: { type: 'memo', ...meta }, body });

test('sites decide first', () => {
  assert.equal(classify(note({ type: 'bookmark', source: 'https://www.coupang.com/vp/products/1' })).category, '쇼핑');
  assert.equal(classify(note({ type: 'bookmark', source: 'https://youtu.be/abc' })).category, '영상·음악');
  const r = classify(note({ type: 'bookmark', source: 'https://www.airbnb.co.kr/rooms/1' }));
  assert.equal(r.category, '여행');
  assert.match(r.why, /airbnb/);
});

test('words decide when there is no site', () => {
  assert.equal(classify(note({}, '김치찌개 레시피: 재료는 김치, 돼지고기')).category, '요리·맛집');
  assert.equal(classify(note({ title: '다음 주 회의 준비' }, '보고서 마감 금요일')).category, '일·업무');
  assert.equal(classify(note({}, '적금 만기, 배당 ETF 알아보기')).category, '돈·재테크');
});

test('nothing fits → 기타', () => {
  const r = classify(note({}, '음'));
  assert.equal(r.category, OTHER);
});

test('uses existing folder names instead of built-in ones', () => {
  const fashion = CATEGORIES.find((c) => c.name === '패션·뷰티');
  assert.equal(resolveName(fashion, ['패션', '요리']), '패션');
  const model = learn([note({ status: 'organized', category: '패션/상의', title: '셔츠' })]);
  assert.equal(classify(note({}, '네이비 니트 코디'), model).category, '패션');
});

test('learns from notes I already filed', () => {
  const filed = [
    note({ status: 'organized', category: '고양이', title: '츄르 추천' }, '나비가 좋아하는 츄르와 모래'),
    note({ status: 'organized', category: '고양이', title: '나비 병원' }, '나비 예방접종 일정'),
    note({ status: 'organized', category: '여행', title: '제주 숙소' }, '애월 숙소'),
  ];
  const r = classify(note({}, '나비 모래 다시 사기'), learn(filed));
  assert.equal(r.category, '고양이');
});

test('reads browser bookmark files', () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">북마크바</H3>
<DL><p>
  <DT><A HREF="https://www.10000recipe.com/recipe/1" ADD_DATE="1700000000">김치찌개 &amp; 계란말이</A>
  <DT><H3>여행</H3>
  <DL><p><DT><A HREF="https://www.agoda.com/a">아고다</A></DL><p>
  <DT><A HREF="javascript:void(0)">북마클릿</A>
  <DT><A HREF="https://www.10000recipe.com/recipe/1">중복</A>
</DL><p>
</DL>`;
  assert.ok(isBookmarksFile(html));
  const list = parseBookmarks(html);
  assert.equal(list.length, 2);
  assert.deepEqual([list[0].title, list[0].folder], ['김치찌개 & 계란말이', '']);
  assert.equal(list[0].added.getFullYear(), 2023);
  assert.deepEqual([list[1].url, list[1].folder], ['https://www.agoda.com/a', '여행']);
});

test('one shared common word does not pull a note into a small learned drawer', () => {
  const model = learn([note({ status: 'organized', category: '여행/제주', title: '카페' }, '바다가 보이는 카페 정리 글')]);
  assert.equal(classify(note({ title: '분기 회의 준비' }, '- [ ] 지난 분기 숫자 정리\n- [ ] 발표 자료 초안'), model).category, '일·업무');
});

test('card snippets drop checkbox markers (same as the organizer)', async () => {
  const { snippet } = await import('../js/core/note.js');
  assert.equal(snippet('- [ ] 우유\n- [x] 달걀'), '우유 달걀');
});
