// 앱의 기본 서랍·세부 서랍 이름을 organizer/taxonomy.json 으로 내보낸다.
// Claude 자동 정리(organizer/organize.py)가 이 이름을 batch.md 에 적어, 앱 자동 분류와 같은 이름으로 정리하게 한다.
// 사전(js/core/taxonomy.js)을 바꾸면 `node tools/export-taxonomy.mjs` 를 다시 실행한다 (npm test 가 확인한다).
//
// 이름 지킴이: 한 번이라도 내보낸 이름은 known 에 남는다. 이름을 바꾸거나 없애서 known 의 이름이 사라지면,
// taxonomy.js 의 RENAMED 에 「옛 이름 → 새 이름」을 적기 전까지 내보내기가 멈춘다.
// (그 이름으로 이미 정리된 노트가 길을 잃지 않고, Claude에게 다시 보내지 않고 이름만 옮겨지게)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultTree } from '../js/core/classify.js';
import { BUILTIN_RENAMES, renamePath } from '../js/core/renames.js';

const FILE = new URL('../organizer/taxonomy.json', import.meta.url);

export const readTaxonomy = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null);

// 지금 이름 (대분류, 대분류/세부 서랍)
export const currentNames = () => defaultTree().flatMap((d) => [d.name, ...d.subs.map((s) => `${d.name}/${s}`)]);

// known 의 이름 중 지금 이름으로 이어지지 않는 것
export function lostNames(known, names = currentNames(), renames = BUILTIN_RENAMES) {
  const now = new Set(names);
  return known.filter((n) => !now.has(renamePath(n, renames)));
}

export function treeJson(prev = readTaxonomy()) {
  const names = currentNames();
  const known = [...new Set([...(prev?.known ?? []), ...names])];
  const lost = lostNames(known, names);
  if (lost.length) {
    throw new Error(`기본 서랍 이름이 사라졌어요: ${lost.join(', ')}\n`
      + 'js/core/taxonomy.js 의 RENAMED 에 { \'옛 이름\': \'새 이름\' } 을 적어 주세요. 그래야 이미 정리된 노트가 새 이름으로 옮겨져요.');
  }
  return `${JSON.stringify({
    note: 'tools/export-taxonomy.mjs 가 만든 파일. 직접 고치지 않는다.',
    drawers: defaultTree().map((d) => ({ name: d.name, subs: d.subs })),
    renamed: BUILTIN_RENAMES.map(({ from, to }) => ({ from, to })),
    known,
  }, null, 1)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    writeFileSync(FILE, treeJson());
    console.log('organizer/taxonomy.json 을 새로 만들었어요.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
