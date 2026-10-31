// 서랍(분류)과 태그: 정해 둔 폴더·태그가 있으면 그것, 없으면 자동 분류가 고른 서랍·세부 서랍·태그.
// 자동 분류는 파일을 옮기지 않고 화면에서만 나눈다. 노트를 열어 서랍을 바꾸면 그때 폴더로 옮기고, 그걸 보고 배운다.
import { classify, learn, topOf, categoryLook, CATEGORIES, OTHER, resolveName } from '../core/classify.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../core/settings.js';

let norm = { raw: undefined, value: normalizeSettings(DEFAULT_SETTINGS) };
// 함께 쓰는 설정 (드라이브 _시스템/settings.json, 없으면 기본값)
export function settingsOf(lib) {
  const raw = lib?.settings ?? null;
  if (raw !== norm.raw) norm = { raw, value: normalizeSettings(raw ?? DEFAULT_SETTINGS) };
  return norm.value;
}

let memo = { key: '', model: null, opts: {}, auto: new Map() };
function modelFor(lib) {
  const key = `${lib.version ?? ''}:${lib.all.length}`;
  if (key !== memo.key) {
    const s = settingsOf(lib);
    const filed = s.classify.learn ? lib.all.filter((n) => n.meta.status === 'organized' && n.meta.category) : [];
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
    hit = classify({ meta: note.meta, body: note.body ?? note.snippet ?? '' }, model, opts);
    auto.set(k, hit);
  }
  return hit;
}

// { name, path, sub, auto, why }
export function categoryOf(note, lib) {
  const m = note.meta;
  if (m.status === 'organized' && m.category) {
    const [name, sub = ''] = String(m.category).split('/').map((s) => s.trim());
    return { name, path: m.category, sub, auto: false, why: '' };
  }
  const r = autoOf(note, lib);
  return { name: r.category, path: r.path, sub: r.sub, auto: true, why: r.why };
}

// 노트의 태그: 달아 둔 게 있으면 그것, 없으면 자동 태그 (화면에서만)
export function tagsOf(note, lib) {
  const t = note.meta.tags ?? [];
  if (t.length) return t.map(String);
  return autoOf(note, lib).tags ?? [];
}
export const tagsAuto = (note) => !(note.meta.tags ?? []).length;

// 아직 저장하기 전의 글이 어느 서랍·세부 서랍·태그로 갈지 (입력창 아래 미리 보여 준다)
export function guessCategory(meta, body, lib) {
  const { model, opts } = modelFor(lib);
  return classify({ meta, body }, model, opts);
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

// 서랍 목록: [{ name, count, auto, latest, look, subs: [[이름, 수]] }] 많은 순, 기타는 맨 끝
export function drawerList(lib) {
  const map = new Map();
  for (const n of lib.all) {
    const c = categoryOf(n, lib);
    if (!map.has(c.name)) map.set(c.name, { name: c.name, count: 0, auto: 0, latest: n, subs: new Map() });
    const d = map.get(c.name);
    d.count++;
    if (c.auto) d.auto++;
    if (c.sub) d.subs.set(c.sub, (d.subs.get(c.sub) ?? 0) + 1);
  }
  return [...map.values()]
    .map((d) => ({ ...d, subs: [...d.subs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')), look: categoryLook(d.name) }))
    .sort((a, b) => (a.name === OTHER) - (b.name === OTHER) || b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

// 서랍을 고를 때 보여 줄 이름: 이미 있는 폴더 + 기본 서랍
export function drawerNames(lib) {
  const existing = lib.folderPaths();
  const tops = [...new Set(existing.map(topOf))];
  return [...existing, ...CATEGORIES.map((d) => resolveName(d, tops)).filter((n) => !existing.includes(n))];
}

// @ 로 보낼 수 있는 서랍: 이미 있는 폴더, 기본 서랍과 세부 서랍, 화면에 보이는 자동 서랍
export function drawerTargets(lib) {
  const existing = lib.folderPaths();
  const tops = [...new Set(existing.map(topOf))];
  const out = new Set(existing);
  for (const d of CATEGORIES) {
    const top = resolveName(d, tops);
    out.add(top);
    for (const s of d.subs) out.add(`${top}/${s.name}`);
  }
  for (const d of drawerList(lib)) { if (d.name !== OTHER) out.add(d.name); for (const [s] of d.subs) out.add(`${d.name}/${s}`); }
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

export { OTHER, categoryLook };
