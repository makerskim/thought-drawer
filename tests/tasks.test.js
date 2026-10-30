import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTasks, openTasks, setTask } from '../js/core/tasks.js';

const body = '오늘\n- [ ] 우유 사기\n- [x] 메일 답장\n  * [ ] 들여 쓴 일\n- [ ] \n- 그냥 목록\n\n## 연결\n- [ ] 여긴 안 봄';

test('finds tasks, skips empty ones and the links section', () => {
  assert.deepEqual(findTasks(body), [
    { line: 1, done: false, text: '우유 사기' },
    { line: 2, done: true, text: '메일 답장' },
    { line: 3, done: false, text: '들여 쓴 일' },
  ]);
  assert.deepEqual(openTasks(body).map((t) => t.text), ['우유 사기', '들여 쓴 일']);
});

test('checks and unchecks one line only', () => {
  const done = setTask(body, 1, true, '우유 사기');
  assert.equal(done.split('\n')[1], '- [x] 우유 사기');
  assert.equal(setTask(done, 1, false).split('\n')[1], '- [ ] 우유 사기');
  assert.equal(setTask(body, 3, true).split('\n')[3], '  * [x] 들여 쓴 일');
});

test('refuses when the line changed meanwhile', () => {
  assert.equal(setTask(body, 1, true, '다른 일'), null);
  assert.equal(setTask(body, 5, true), null);
});

test('empty checkbox lines survive the editor round trip', async () => {
  const { toEditorMarkdown, fromEditorMarkdown } = await import('../js/core/wiki.js');
  const md = '## 오늘 할 일\n- [ ] \n- [x] 끝낸 일\n';
  const ed = toEditorMarkdown(md);
  assert.match(ed, /^- \[ \] \u200b$/m);
  assert.equal(fromEditorMarkdown(ed), md);
  assert.equal(fromEditorMarkdown('- [ ] \u200b우유'), '- [ ] 우유');
});
