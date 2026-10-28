import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { SHARED, EXT, ZIP, buildZip } from '../tools/sync-extension.mjs';
import { EXTENSION_ID } from '../js/config.js';
import { memoNote, linkNote, captureBody } from '../js/core/compose.js';

const ROOT = join(EXT, '..');

test('extension carries the same note and Drive code as the web app', () => {
  for (const [from, to] of SHARED) {
    assert.equal(readFileSync(join(EXT, to), 'utf8'), readFileSync(join(ROOT, from), 'utf8'), `${to} is stale: run node tools/sync-extension.mjs`);
  }
});

test('downloadable zip matches the extension folder', () => {
  assert.ok(buildZip().equals(readFileSync(ZIP)), 'zip is stale: run node tools/sync-extension.mjs');
});

test('manifest key gives the extension id the app and Google redirect use', () => {
  const { key } = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.equal(id, EXTENSION_ID);
});

test('link note keeps the picked quote, link and thought in order', () => {
  const { meta, body } = linkNote({ url: 'https://example.com/a', title: '예시 [글]', memo: '다시 읽기', quote: '첫 줄\n둘째 줄', taken: new Set(), via: 'chrome' });
  assert.equal(meta.type, 'bookmark');
  assert.equal(meta.source, 'https://example.com/a');
  assert.equal(meta.via, 'chrome');
  assert.equal(body, '> 첫 줄\n> 둘째 줄\n\n[예시 \\[글\\]](https://example.com/a)\n\n다시 읽기');
});

test('instagram link becomes an instagram note with the thought kept', () => {
  const { meta } = linkNote({ url: 'https://www.instagram.com/reel/ABC/', memo: '레시피', taken: new Set() });
  assert.equal(meta.type, 'instagram');
  assert.equal(meta.thought, '레시피');
});

test('capture and memo bodies', () => {
  assert.equal(captureBody({ attName: '1.jpg', memo: '메모', ocr: '글자', source: 'https://a.com', title: 'A' }),
    '![[1.jpg]]\n\n[A](https://a.com)\n\n메모\n\n## 사진 속 글자\n\n글자');
  assert.equal(captureBody({ attName: '1.jpg' }), '![[1.jpg]]');
  const m = memoNote({ text: '  생각  \n', taken: new Set() });
  assert.equal(m.meta.type, 'memo');
  assert.equal(m.body, '생각');
});
