// 서랍(분류)과 태그: 정해 둔 폴더·태그가 있으면 그것, 없으면 자동 분류가 고른 서랍·세부 서랍·태그.
// 자동 분류는 파일을 옮기지 않고 화면에서만 나눈다. 노트를 열어 서랍을 바꾸면 그때 폴더로 옮기고, 그걸 보고 배운다.
import { classify, learn, topOf, categoryLook as baseLook, CATEGORIES, OTHER, resolveName, ruleHit } from '../core/classify.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../core/settings.js';
import { renamesOf, renamePath, addRename, cleanPath, stableTarget } from '../core/renames.js';
import { isoLocal, categoryParts } from '../core/note.js';

let norm = { raw: undefined, value: normalizeSettings(DEFAULT_SETTINGS), renames: renamesOf(null) };
// 함께 쓰는 설정 (드라이브 _시스템/settings.json, 없으면 기본값)
export function settingsOf(lib) {
  const raw = lib?.settings ?? null;
  if (raw !== norm.raw) { const value = normalizeSettings(raw ?? DEFAULT_SETTINGS); norm = { raw, value, renames: renamesOf(value) }; }
  return norm.value;
}
// 서랍 이름 바꿈 장부 (앱이 바꾼 기본 이름 + 내가 바꾼 이름)
export const renamesFor = (lib) => { settingsOf(lib); return norm.renames; };

// 서랍 모양(아이콘·색): 이름을 바꾼 기본 서랍은 원래 서랍의 모양을 그대로
export function categoryLook(name) {
  const from = norm.renames.find((r) => r.to === name && !r.from.includes('/'));
  return baseLook(from ? from.from : name);
}

// 자동 분류 결과를 장부의 새 이름으로
function renamed(r, rn) {
  if (!rn.length || !r?.path) return r;
  const path = renamePath(r.path, rn);
  if (path === r.path) return r;
  const [category, sub = '', leaf = ''] = path.split('/');
  return { ...r, category, sub, leaf, path };
}

let memo = { key: '', model: null, opts: {}, auto: new Map() };
function modelFor(lib) {
  const key = `${lib.version ?? ''}:${lib.all.length}`;
  if (key !== memo.key) {
    const s = settingsOf(lib);
    const rn = renamesFor(lib);
    // 옛 이름에 남은 노트도 새 이름 서랍의 것으로 배운다
    const filed = (s.classify.learn ? lib.all.filter((n) => n.meta.status === 'organized' && n.meta.category) : [])
      .map((n) => (rn.length ? { ...n, meta: { ...n.meta, category: renamePath(n.meta.category, rn) } } : n));
    const model = learn(filed, { paths: lib.folderPaths?.() ?? [] });
    // 이미 쓰는 태그는 정리 안 된 노트에서도 모은다 (글에 그 태그가 나오면 단다)
    model.tags = new Map();
    for (const n of lib.all) for (const t of n.meta.tags ?? []) model.tags.set(String(t), (model.tags.get(String(t)) ?? 0) + 1);
    memo = { key, model, opts: { subs: s.classify.subs, tags: s.classify.tags, rules: s.rules }, auto: new Map() };
  }
  return memo;
}

function autoOf(note, lib) {
  const { model, opts, auto } = modelFor(lib);
  const k = `${note.id}:${note.modifiedTime ?? ''}:${note.body === undefined ? 's' : 'b'}`;
  let hit = auto.get(k);
  if (!hit) {
    hit = renamed(classify({ meta: note.meta, body: note.body ?? note.snippet ?? '' }, model, opts), renamesFor(lib));
    auto.set(k, hit);
  }
  return hit;
}

// { name, sub, leaf, path, folder, auto, why, weak } — path 는 대분류/중분류/소분류, folder 는 실제로 옮겨 둔 폴더
// 옮겨 둔 폴더가 두 단계까지면, 자동 분류가 같은 서랍을 골랐을 때 그 소분류를 화면에서만 붙인다
export function categoryOf(note, lib) {
  const m = note.meta;
  if (m.status === 'organized' && m.category) {
    // 이름을 바꾼 서랍에 남은 노트는 새 이름으로 보인다 (파일은 「옛 이름 옮기기」 때 옮긴다)
    const [name, sub = '', leaf0 = ''] = (renamePath(m.category, renamesFor(lib)) || String(m.category)).split('/');
    let leaf = leaf0;
    if (!leaf && sub) { const r = autoOf(note, lib); if (r.category === name && r.sub === sub) leaf = r.leaf; }
    return { name, sub, leaf, path: [name, sub, leaf].filter(Boolean).join('/'), folder: m.category, auto: false, why: '' };
  }
  const r = autoOf(note, lib);
  return { name: r.category, sub: r.sub, leaf: r.leaf ?? '', path: r.path, folder: '', auto: true, why: r.why, weak: !!r.weak };
}
// 화면에 보이는 이름: 쇼핑 › 가전 › 노트북
export const pathLabel = (c) => [c.name, c.sub, c.leaf].filter(Boolean).join(' › ');

// 찾기에 넘길 자동 분류: 서랍 경로(소분류까지)와 태그
export const searchAuto = (lib) => (note) => ({ path: categoryOf(note, lib).path, tags: tagsOf(note, lib) });

// 노트의 태그: 달아 둔 게 있으면 그것, 없으면 자동 태그 (화면에서만)
export function tagsOf(note, lib) {
  const t = note.meta.tags ?? [];
  if (t.length) return t.map(String);
  return autoOf(note, lib).tags ?? [];
}
export const tagsAuto = (note) => !(note.meta.tags ?? []).length;

// 연관 노트를 찾을 때 쓰는 열쇠말: 달아 둔 태그 + 자동 태그(글 속 핵심 낱말)를 함께
export function keyTags(note, lib) {
  return [...new Set([...(note.meta.tags ?? []).map(String), ...(autoOf(note, lib).tags ?? [])])];
}

// 아직 저장하기 전의 글이 어느 서랍·세부 서랍·태그로 갈지 (입력창 아래 미리 보여 준다)
export function guessCategory(meta, body, lib) {
  const { model, opts } = modelFor(lib);
  return renamed(classify({ meta, body }, model, opts), renamesFor(lib));
}

// 새 노트를 넣기 직전: 직접 단 태그 뒤에 자동 태그를 붙여 저장한다 (옵시디언에서도 보이게)
export function enrichNew({ meta, body }, lib) {
  const s = settingsOf(lib);
  if (!s.classify.tags || meta.type === 'map') return { meta, body };
  const r = guessCategory(meta, body, lib);
  const mine = (meta.tags ?? []).map(String);
  const tags = [...new Set([...mine, ...r.tags])].slice(0, Math.max(mine.length, s.classify.tags));
  return { meta: tags.length ? { ...meta, tags } : meta, body };
}

// 서랍 목록: [{ name, count, auto, latest, look, subs: [[이름, 수]], leaves: { 세부 서랍: [[소분류, 수]] } }] 많은 순
const byCount = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
export function drawerList(lib) {
  const map = new Map();
  for (const n of lib.all) {
    const c = categoryOf(n, lib);
    if (!map.has(c.name)) map.set(c.name, { name: c.name, count: 0, auto: 0, latest: n, subs: new Map(), leaves: new Map() });
    const d = map.get(c.name);
    d.count++;
    if (c.auto) d.auto++;
    if (c.sub) d.subs.set(c.sub, (d.subs.get(c.sub) ?? 0) + 1);
    if (c.sub && c.leaf) {
      if (!d.leaves.has(c.sub)) d.leaves.set(c.sub, new Map());
      const l = d.leaves.get(c.sub);
      l.set(c.leaf, (l.get(c.leaf) ?? 0) + 1);
    }
  }
  return [...map.values()]
    .map((d) => ({ ...d, subs: byCount(d.subs), leaves: Object.fromEntries([...d.leaves].map(([k, v]) => [k, byCount(v)])), look: categoryLook(d.name) }))
    .sort((a, b) => (a.name === OTHER) - (b.name === OTHER) || b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

// 서랍을 고를 때 보여 줄 이름: 이미 있는 폴더 + 기본 서랍
export function drawerNames(lib) {
  const existing = lib.folderPaths();
  const tops = [...new Set(existing.map(topOf))];
  const rn = renamesFor(lib);
  return [...new Set([...existing, ...CATEGORIES.map((d) => renamePath(resolveName(d, tops), rn))])];
}

// @ 로 보낼 수 있는 서랍: 이미 있는 폴더, 기본 서랍과 세부 서랍, 화면에 보이는 자동 서랍
export function drawerTargets(lib) {
  const existing = lib.folderPaths();
  const tops = [...new Set(existing.map(topOf))];
  const out = new Set(existing);
  const rn = renamesFor(lib);
  for (const d of CATEGORIES) {
    const top = resolveName(d, tops);
    out.add(renamePath(top, rn));
    for (const s of d.subs) out.add(renamePath(`${top}/${s.name}`, rn));
  }
  for (const d of drawerList(lib)) {
    if (d.name !== OTHER) out.add(d.name);
    for (const [s] of d.subs) out.add(`${d.name}/${s}`);
    for (const [s, ls] of Object.entries(d.leaves)) for (const [l] of ls) out.add(`${d.name}/${s}/${l}`);
  }
  return [...out];
}

// 모든 태그와 개수 (자동 태그 포함)
export function tagCounts(lib) {
  const m = new Map();
  for (const n of lib.all) for (const t of tagsOf(n, lib)) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

export const inDrawer = (note, lib, path) => {
  const c = categoryOf(note, lib);
  return c.path === path || c.name === path || String(c.path).startsWith(`${path}/`);
};

// ---------- 서랍 이름 바꾸기 (다시 분류하지 않고 이름만: Claude 사용량을 쓰지 않는다) ----------
// 옛 이름 서랍에 남은 노트 → [{ note, to }]
export function leftovers(lib) {
  const rn = renamesFor(lib);
  if (!rn.length) return [];
  return lib.all
    .filter((n) => n.meta.status === 'organized' && n.meta.category)
    .map((note) => ({ note, to: stableTarget(note.meta.category, rn) }))
    .filter((x) => x.to);
}

// 남은 노트를 새 이름 폴더로 옮긴다. 글과 「고친 시각」은 그대로, Claude 정리 표시도 그대로. 빈 옛 폴더는 휴지통으로.
export async function moveLeftovers(lib, onStep) {
  const rn = renamesFor(lib);
  const list = leftovers(lib);
  const old = new Set();
  const oldOf = (dir) => {
    const ps = categoryParts(dir);
    for (let k = 1; k <= ps.length; k++) { const p = ps.slice(0, k).join('/'); if (renamePath(p, rn) !== p) old.add(p); }
  };
  let i = 0;
  for (const { note, to } of list) {
    oldOf(note.dir);
    await lib.update(lib.get(note.id) ?? note, { meta: { category: to } }, { touch: false });
    onStep?.(++i, list.length);
  }
  for (const d of lib.dirs ?? []) oldOf(d);
  await lib.removeEmptyDirs([...old]);
  return list.length;
}

// 서랍 이름 바꾸기: 장부에 적고(규칙의 서랍도 새 이름으로), 그 서랍의 정리된 노트를 옮긴다 → 옮긴 수
export async function renameDrawer(lib, from, to, onStep) {
  const s = settingsOf(lib);
  const step = [{ from: cleanPath(from), to: cleanPath(to) }];
  const rules = s.rules.map((r) => (r.drawer ? { ...r, drawer: renamePath(r.drawer, step) } : r));
  await lib.saveSettings(normalizeSettings({ ...s, rules, renames: addRename(s.renames, from, to, isoLocal()) }));
  return moveLeftovers(lib, onStep);
}

// 장부에서 지우기: 옮긴 노트는 그대로 두고, 앞으로 자동 분류가 원래 이름을 다시 쓴다
export async function forgetRename(lib, from) {
  const s = settingsOf(lib);
  await lib.saveSettings(normalizeSettings({ ...s, renames: s.renames.filter((r) => r.from !== from) }));
}

// 규칙을 이미 정리된 노트에도: 규칙에 맞는데 다른 서랍에 있는 노트 (태그만 있는 규칙은 태그가 빠진 노트)
export function ruleTargets(lib, rule) {
  const to = renamePath(rule.drawer, renamesFor(lib));
  return lib.all.filter((n) => {
    if (n.meta.status !== 'organized' || !ruleHit(rule, { meta: n.meta, body: n.body ?? n.snippet ?? '' })) return false;
    const cat = cleanPath(n.meta.category);
    const away = to && cat !== to && !cat.startsWith(`${to}/`);
    const tags = (rule.tags ?? []).some((t) => !(n.meta.tags ?? []).map(String).includes(t));
    return away || tags;
  });
}
export async function applyRule(lib, rule, list, onStep) {
  const to = renamePath(rule.drawer, renamesFor(lib));
  let i = 0;
  for (const n of list) {
    const cur = lib.get(n.id) ?? n;
    const cat = cleanPath(cur.meta.category);
    const meta = { tags: [...new Set([...(cur.meta.tags ?? []).map(String), ...(rule.tags ?? [])])] };
    if (to && cat !== to && !cat.startsWith(`${to}/`)) meta.category = to;
    await lib.update(cur, { meta }, { touch: false });
    onStep?.(++i, list.length);
  }
  return i;
}

export { OTHER };
