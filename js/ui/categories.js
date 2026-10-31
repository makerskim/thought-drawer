// 서랍(분류): 정해 둔 폴더가 있으면 그것, 없으면 자동 분류가 고른 서랍.
// 자동 분류는 파일을 옮기지 않고 화면에서만 나눈다. 노트를 열어 서랍을 바꾸면 그때 폴더로 옮기고, 그걸 보고 배운다.
import { classify, learn, topOf, categoryLook, CATEGORIES, OTHER, resolveName } from '../core/classify.js';

let memo = { key: '', model: null, names: [], auto: new Map() };

function modelFor(lib) {
  const filed = lib.all.filter((n) => n.meta.status === 'organized' && n.meta.category);
  const key = filed.map((n) => `${n.id}:${n.meta.category}:${n.modifiedTime ?? ''}`).join('|');
  if (key !== memo.key) {
    const model = learn(filed);
    memo = { key, model, names: model.names, auto: new Map() };
  }
  return memo;
}

// { name, path, auto, why }
export function categoryOf(note, lib) {
  const m = note.meta;
  if (m.status === 'organized' && m.category) return { name: topOf(m.category), path: m.category, auto: false, why: '' };
  const { model, auto } = modelFor(lib);
  const k = `${note.id}:${note.modifiedTime ?? ''}:${note.body === undefined ? 's' : 'b'}`;
  let hit = auto.get(k);
  if (!hit) {
    const r = classify({ meta: m, body: note.body ?? note.snippet ?? '' }, model);
    hit = { name: r.category, path: r.category, auto: true, why: r.why };
    auto.set(k, hit);
  }
  return hit;
}

// 아직 저장하기 전의 글이 어느 서랍으로 갈지 (입력창 아래 미리 보여 준다)
export function guessCategory(meta, body, lib) {
  return classify({ meta, body }, modelFor(lib).model);
}

// 서랍 목록: [{ name, count, auto, latest, look }] 많은 순, 기타는 맨 끝
export function drawerList(lib) {
  const map = new Map();
  for (const n of lib.all) {
    const c = categoryOf(n, lib);
    if (!map.has(c.name)) map.set(c.name, { name: c.name, count: 0, auto: 0, latest: n });
    const d = map.get(c.name);
    d.count++;
    if (c.auto) d.auto++;
  }
  return [...map.values()]
    .map((d) => ({ ...d, look: categoryLook(d.name) }))
    .sort((a, b) => (a.name === OTHER) - (b.name === OTHER) || b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

// 서랍을 고를 때 보여 줄 이름: 이미 있는 폴더 + 기본 서랍
export function drawerNames(lib) {
  const existing = lib.folderPaths();
  const tops = [...new Set(existing.map(topOf))];
  return [...existing, ...CATEGORIES.map((d) => resolveName(d, tops)).filter((n) => !existing.includes(n))];
}

export const inDrawer = (note, lib, path) => {
  const c = categoryOf(note, lib);
  return c.path === path || c.name === path || String(c.path).startsWith(`${path}/`);
};

export { OTHER, categoryLook };
