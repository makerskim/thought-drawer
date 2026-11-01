// 앱의 기본 서랍·세부 서랍 이름을 organizer/taxonomy.json 으로 내보낸다.
// Claude 자동 정리(organizer/organize.py)가 이 이름을 batch.md 에 적어, 앱 자동 분류와 같은 이름으로 정리하게 한다.
// 사전(js/core/taxonomy.js)을 바꾸면 `node tools/export-taxonomy.mjs` 를 다시 실행한다 (npm test 가 확인한다).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultTree } from '../js/core/classify.js';

export const treeJson = () => `${JSON.stringify({ note: 'tools/export-taxonomy.mjs 가 만든 파일. 직접 고치지 않는다.', drawers: defaultTree().map((d) => ({ name: d.name, subs: d.subs })) }, null, 1)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../organizer/taxonomy.json', import.meta.url), treeJson());
  console.log('organizer/taxonomy.json 을 새로 만들었어요.');
}
