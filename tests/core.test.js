import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeId, parseNote, serializeNote, fileNameFor, wikiLinks, embeds, idFromLink, snippet, newNote, parseYaml,
} from '../js/core/note.js';
import { tokenize, parseQuery, search } from '../js/core/search.js';
import { parseSavedJson, fixMojibake, mergeSaved, parseSavedHtml, instagramToNote, postKey } from '../js/core/instagram.js';
import { answerLocally, buildClaudePrompt } from '../js/core/ask.js';
import { convertForExport, relPath } from '../js/core/export.js';

test('makeId bumps on collision', () => {
  const d = new Date(2026, 9, 27, 10, 52, 30);
  const taken = new Set();
  assert.equal(makeId(d, taken), '20261027105230');
  assert.equal(makeId(d, taken), '20261027105231');
});

test('note round-trips through frontmatter', () => {
  const note = {
    meta: { id: '20261027105230', title: '흰색 "옥스포드" 셔츠', type: 'capture', status: 'inbox', tags: ['셔츠', '위시리스트'], links: [] },
    body: '본문 첫 줄\n\n![[a.jpg]]',
  };
  const text = serializeNote(note);
  assert.match(text, /^---\nid: "20261027105230"\ntitle: /);
  assert.ok(!text.includes('links:'), 'empty arrays are omitted');
  const back = parseNote(text);
  assert.deepEqual(back.meta, { id: '20261027105230', title: '흰색 "옥스포드" 셔츠', type: 'capture', status: 'inbox', tags: ['셔츠', '위시리스트'] });
  assert.equal(back.body, note.body);
});

test('parses obsidian-style block lists and plain scalars', () => {
  const meta = parseYaml('title: 그냥 제목\ntags:\n  - 패션\n  - "상의"\ndone: true\nnote: |\n  첫 줄\n  둘째 줄');
  assert.deepEqual(meta, { title: '그냥 제목', tags: ['패션', '상의'], done: true, note: '첫 줄\n둘째 줄' });
});

test('note without frontmatter keeps body', () => {
  assert.deepEqual(parseNote('그냥 글'), { meta: {}, body: '그냥 글' });
});

test('file names are safe', () => {
  assert.equal(fileNameFor({ id: '1', title: 'a/b: c?' }), '1 a b c.md');
  assert.equal(fileNameFor({ id: '1', title: '' }), '1.md');
});

test('links and embeds', () => {
  const body = '[[20261020101010 셔츠]] 그리고 [[다른 글|별칭]] ![[x.png]]';
  assert.deepEqual(wikiLinks(body), ['20261020101010 셔츠', '다른 글']);
  assert.deepEqual(embeds(body), ['x.png']);
  assert.equal(idFromLink('20261020101010 셔츠'), '20261020101010');
  assert.equal(snippet('## 제목\n[[20261020101010 셔츠]]를 봤다'), '셔츠를 봤다');
});

test('tokenize strips particles and stop words', () => {
  assert.deepEqual(tokenize('저장한 셔츠를 보여줘'), ['셔츠']);
  assert.deepEqual(tokenize('흰색 셔츠는 어디에'), ['흰색', '셔츠']);
  assert.deepEqual(tokenize('제주도에서 먹은 국수'), ['제주도', '먹은', '국수']);
});

test('parseQuery handles tags and filters', () => {
  const q = parseQuery('#위시 서랍:패션 종류:인스타 셔츠');
  assert.deepEqual(q, { terms: ['셔츠'], tags: ['위시'], category: '패션', type: '인스타' });
});

const sample = [
  { meta: { id: '1', title: '흰색 옥스포드 셔츠', category: '패션/상의', tags: ['셔츠'], type: 'capture' }, body: '무신사에서 봄' },
  { meta: { id: '2', title: '제주 카페', category: '여행/제주', tags: ['카페'], type: 'bookmark' }, body: '흰색 건물' },
  { meta: { id: '3', title: '스트라이프 셔츠', category: '패션/상의', tags: ['셔츠', '위시'], type: 'instagram' }, body: '' },
];

test('search ranks title/tag matches and filters', () => {
  const r = search(sample, '흰색 셔츠');
  assert.equal(r[0].note.meta.id, '1');
  assert.deepEqual(search(sample, '종류:인스타').map((x) => x.note.meta.id), ['3']);
  assert.deepEqual(search(sample, '#위시').map((x) => x.note.meta.id), ['3']);
  assert.deepEqual(search(sample, '서랍:여행').map((x) => x.note.meta.id), ['2']);
});

test('answerLocally groups by drawer and builds a prompt', () => {
  const a = answerLocally(sample, '내가 저장한 셔츠 뭐 있었지?');
  assert.equal(a.groups[0].category, '패션/상의');
  assert.equal(a.groups[0].items.length, 2);
  const p = buildClaudePrompt('셔츠 뭐 있었지?', a.results);
  assert.match(p, /\[1\] /);
  assert.match(p, /질문: 셔츠 뭐 있었지\?/);
});

test('instagram saved_posts.json (english keys)', () => {
  const json = {
    saved_saved_media: [
      { title: 'shop_a', string_map_data: { 'Saved on': { href: 'https://www.instagram.com/p/AbC123/', timestamp: 1761530000 } } },
      { title: 'chef_b', string_map_data: { 'Saved on': { href: 'https://www.instagram.com/reel/XyZ9/', timestamp: 1761520000 } } },
    ],
  };
  const items = parseSavedJson(json);
  assert.equal(items.length, 2);
  assert.equal(items[0].author, 'shop_a');
  assert.equal(items[0].kind, 'post');
  assert.equal(items[1].kind, 'reel');
  assert.equal(items[1].url, 'https://www.instagram.com/reel/XyZ9/');
  assert.equal(items[0].savedAt.getTime(), 1761530000 * 1000);
});

test('instagram collections with localized keys and mojibake', () => {
  const broken = Array.from(new TextEncoder().encode('패션'), (b) => String.fromCharCode(b)).join('');
  const json = {
    saved_saved_collections: [
      { title: 'Collection', string_map_data: { 이름: { value: broken }, '만든 시간': { timestamp: 1761000000 } } },
      { string_map_data: { 이름: { href: 'https://www.instagram.com/p/AbC123/', value: 'shop_a' }, '추가된 시간': { timestamp: 1761530000 } } },
    ],
  };
  const items = parseSavedJson(json);
  assert.equal(items.length, 1);
  assert.equal(items[0].collection, '패션');
  assert.equal(items[0].author, 'shop_a');
  assert.equal(fixMojibake('plain'), 'plain');
  assert.equal(fixMojibake('한글'), '한글');
});

test('merge keeps collection and dedupes', () => {
  const a = [{ code: 'A', url: 'u', kind: 'post', author: 'x', savedAt: new Date(2), collection: null }];
  const b = [{ code: 'A', url: 'u', kind: 'post', author: '', savedAt: null, collection: '패션' }];
  const m = mergeSaved([a, b]);
  assert.equal(m.length, 1);
  assert.equal(m[0].collection, '패션');
});

test('html export and note creation', () => {
  const items = parseSavedHtml('<a href="https://www.instagram.com/p/Q1w2/">x</a><a href="https://example.com">y</a>');
  assert.equal(items.length, 1);
  const n = instagramToNote({ ...items[0], author: 'shop', savedAt: new Date(2026, 0, 1), collection: '패션' }, new Set());
  assert.equal(n.meta.type, 'instagram');
  assert.equal(n.meta.source, 'https://www.instagram.com/p/Q1w2/');
  assert.equal(n.meta.id, '20260101000000');
  assert.match(n.body, /@shop/);
  assert.equal(postKey('https://www.instagram.com/someone/reel/ZZ/?igsh=1').url, 'https://www.instagram.com/reel/ZZ/');
});

test('newNote drops undefined fields', () => {
  const n = newNote({ type: 'memo', author: undefined });
  assert.ok(!('author' in n.meta));
  assert.equal(n.meta.status, 'inbox');
});

test('export converts links to relative paths', () => {
  assert.equal(relPath('패션/상의', '_첨부/a.jpg'), '../../_첨부/a.jpg');
  assert.equal(relPath('', '패션/b.md'), '패션/b.md');
  const out = convertForExport([
    { path: '패션/상의/20261020101010 셔츠.md', text: '![[a b.jpg]] [[20261021101010 바지]]', meta: { id: '20261020101010', title: '셔츠' } },
    { path: '패션/하의/20261021101010 바지.md', text: '없는 [[링크]]', meta: { id: '20261021101010', title: '바지' } },
  ]);
  assert.equal(out[0].text, '![a b.jpg](../../_%EC%B2%A8%EB%B6%80/a%20b.jpg) [바지](../%ED%95%98%EC%9D%98/20261021101010%20%EB%B0%94%EC%A7%80.md)');
  assert.equal(out[1].text, '없는 링크');
});

test('sentence questions use the small thesaurus', () => {
  const r = search(sample, '사고 싶은 옷 뭐 있었지?');
  assert.ok(r.length >= 2);
  assert.equal(r[0].note.meta.id, '3', 'wishlist + clothes ranks first');
  assert.deepEqual(tokenize('10분 만에 할 수 있는 요리'), ['10분', '요리']);
});

test('mergeLinksSection matches python behaviour', async () => {
  const { mergeLinksSection } = await import('../js/core/note.js');
  const body = '본문\n\n## 연결\n\n- [[20260101000000 가]] (이유)\n';
  const out = mergeLinksSection(body, [['20260101000000', '가', '중복'], ['20260102000000', '나', '']]);
  assert.equal(out, '본문\n\n## 연결\n\n- [[20260101000000 가]] (이유)\n- [[20260102000000 나]]\n');
  assert.equal(mergeLinksSection('글', [['20260103000000', '다/라', '같은 주제']]), '글\n\n## 연결\n\n- [[20260103000000 다 라]] (같은 주제)\n');
});

test('wiki syntax converts to editor markdown and back', async () => {
  const { toEditorMarkdown, fromEditorMarkdown, splitLinks, joinLinks } = await import('../js/core/wiki.js');
  const src = '![[20261020093000.jpg]]\n\n셔츠 [[20261022120000 가을 코디]] 와 [[메모법|별칭 글]] 참고';
  const ed = toEditorMarkdown(src);
  assert.ok(ed.includes('![20261020093000.jpg](td-att:20261020093000.jpg)'));
  assert.ok(ed.includes('[가을 코디](td-wiki:20261022120000%20%EA%B0%80%EC%9D%84%20%EC%BD%94%EB%94%94)'));
  assert.equal(fromEditorMarkdown(ed), src);
  // 편집기에서 링크 글자를 바꾸면 별칭으로 남는다
  assert.equal(fromEditorMarkdown('[다른 이름](td-wiki:20261022120000%20%EA%B0%80%EC%9D%84%20%EC%BD%94%EB%94%94)'), '[[20261022120000 가을 코디|다른 이름]]');
  const { main, links } = splitLinks('본문\n\n## 사진 속 글자\n\n글자\n\n## 연결\n\n- [[20260101000000 가]] (이유)\n');
  assert.equal(main, '본문\n\n## 사진 속 글자\n\n글자');
  assert.equal(links, '## 연결\n\n- [[20260101000000 가]] (이유)');
  assert.equal(joinLinks(main, links), '본문\n\n## 사진 속 글자\n\n글자\n\n## 연결\n\n- [[20260101000000 가]] (이유)\n');
  assert.equal(joinLinks('글', ''), '글\n');
});
