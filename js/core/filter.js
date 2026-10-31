// 노트 걸러 보기: 날짜, 종류, 서랍(› 세부 서랍), 태그, 사이트, 조건, 정렬.
// 고른 값은 주소(#/all?d=week&tag=가전)에 그대로 담겨서, 뒤로 가기·새로 고침·즐겨찾기에도 남는다.

export const DATES = [
  ['today', '오늘'], ['yesterday', '어제'], ['week', '이번 주'], ['7d', '최근 7일'],
  ['month', '이번 달'], ['30d', '최근 30일'], ['year', '올해'], ['custom', '기간 지정'],
];
export const HAS = [
  ['todo', '할 일 있음'], ['open', '남은 할 일'], ['done', '할 일 다 함'], ['photo', '사진 있음'],
  ['summary', '요약 있음'], ['pinned', '즐겨찾기'], ['mine', '직접 정한 서랍'], ['auto', '자동 분류만'], ['untagged', '태그 없음'],
];
export const SORTS = [['new', '최근 넣은 순'], ['old', '오래된 순'], ['updated', '최근 고친 순'], ['title', '이름 순']];
export const BASIS = [['created', '넣은 날'], ['updated', '고친 날']];

const DAY = 86_400_000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };

// 노트의 날짜: 머리말 값, 없으면 번호(만든 시각 yyyymmddHHMMSS)
export function noteDate(n, basis = 'created') {
  const s = basis === 'updated' ? (n.meta?.updated || n.meta?.created) : n.meta?.created;
  const d = s ? new Date(s) : null;
  if (d && !Number.isNaN(d.getTime())) return d;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(String(n.meta?.id ?? n.id ?? ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

// [시작, 끝) — 끝은 포함하지 않는다
export function dateRange(key, { from, to } = {}, now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY);
  switch (key) {
    case 'today': return [today, tomorrow];
    case 'yesterday': return [new Date(today.getTime() - DAY), today];
    case 'week': { const back = (today.getDay() + 6) % 7; return [new Date(today.getFullYear(), today.getMonth(), today.getDate() - back), tomorrow]; } // 월요일부터
    case '7d': return [new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), tomorrow];
    case 'month': return [new Date(today.getFullYear(), today.getMonth(), 1), tomorrow];
    case '30d': return [new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), tomorrow];
    case 'year': return [new Date(today.getFullYear(), 0, 1), tomorrow];
    case 'custom': {
      const a = day(from);
      const b = day(to);
      if (!a && !b) return null;
      return [a ?? new Date(0), b ? new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1) : new Date(8.64e15)];
    }
    default: return null;
  }
}

const list = (p, k) => (p.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function readFilter(params) {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(params ?? '');
  return {
    d: p.get('d') ?? '', from: p.get('from') ?? '', to: p.get('to') ?? '', on: p.get('on') === 'updated' ? 'updated' : 'created',
    type: list(p, 'type'), dr: p.get('dr') ?? '', tag: list(p, 'tag'), site: p.get('site') ?? '', has: list(p, 'has'),
    sort: p.get('sort') ?? '',
  };
}

// 기본값은 빼고 주소에 쓴다 (keep: q 같은 다른 값)
export function writeFilter(f, keep = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
  if (f.d) p.set('d', f.d);
  if (f.d === 'custom' && f.from) p.set('from', f.from);
  if (f.d === 'custom' && f.to) p.set('to', f.to);
  if (f.d && f.on === 'updated') p.set('on', 'updated');
  if (f.type?.length) p.set('type', f.type.join(','));
  if (f.dr) p.set('dr', f.dr);
  if (f.tag?.length) p.set('tag', f.tag.join(','));
  if (f.site) p.set('site', f.site);
  if (f.has?.length) p.set('has', f.has.join(','));
  if (f.sort) p.set('sort', f.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const activeCount = (f) => (f.d ? 1 : 0) + (f.type?.length ?? 0) + (f.dr ? 1 : 0) + (f.tag?.length ?? 0) + (f.site ? 1 : 0) + (f.has?.length ?? 0);

// 서랍 경로에 드는지: 「쇼핑」은 「쇼핑/가전」도 포함
export const inPath = (c, path) => c.path === path || c.name === path || String(c.path).startsWith(`${path}/`);

const OPEN = /^\s*[-*+] \[ \]/m;
const DONE = /^\s*[-*+] \[[xX]\]/m;
export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// ctx: { cat(n) → { name, path, sub, auto }, tags(n) → [태그], now }
export function test(n, key, ctx) {
  const body = n.body ?? '';
  switch (key) {
    case 'todo': return OPEN.test(body) || DONE.test(body);
    case 'open': return OPEN.test(body);
    case 'done': return DONE.test(body) && !OPEN.test(body);
    case 'photo': return n.meta.type === 'capture' || (n.meta.attachments ?? []).length > 0;
    case 'summary': return !!n.meta.summary;
    case 'pinned': return !!n.meta.pinned;
    case 'mine': return !ctx.cat(n).auto;
    case 'auto': return !!ctx.cat(n).auto;
    case 'untagged': return !ctx.tags(n).length;
    default: return true;
  }
}

export function applyFilter(notes, f, ctx) {
  const range = f.d ? dateRange(f.d, f, ctx.now) : null;
  const out = notes.filter((n) => {
    if (range) {
      const d = noteDate(n, f.on);
      if (!d || d < range[0] || d >= range[1]) return false;
    }
    if (f.type?.length && !f.type.includes(n.meta.type ?? 'memo')) return false;
    if (f.dr && !inPath(ctx.cat(n), f.dr)) return false;
    if (f.tag?.length) { const t = ctx.tags(n); if (!f.tag.every((x) => t.includes(x))) return false; }
    if (f.site && hostOf(n.meta.source) !== f.site) return false;
    for (const k of f.has ?? []) if (!test(n, k, ctx)) return false;
    return true;
  });
  return sortNotes(out, f.sort, ctx);
}

export function sortNotes(notes, sort, ctx = {}) {
  const title = ctx.title ?? ((n) => n.meta.title ?? '');
  const t = (n, basis) => noteDate(n, basis)?.getTime() ?? 0;
  if (sort === 'old') return [...notes].sort((a, b) => t(a) - t(b));
  if (sort === 'new') return [...notes].sort((a, b) => t(b) - t(a));
  if (sort === 'updated') return [...notes].sort((a, b) => t(b, 'updated') - t(a, 'updated'));
  if (sort === 'title') return [...notes].sort((a, b) => title(a).localeCompare(title(b), 'ko'));
  return notes; // 그대로 (찾기는 맞는 순, 나머지는 넣은 순)
}

// 고를 수 있는 값과 개수 (지금 보는 노트들 기준)
export function facets(notes, ctx) {
  const inc = (m, k) => k && m.set(k, (m.get(k) ?? 0) + 1);
  const types = new Map(); const drawers = new Map(); const tags = new Map(); const sites = new Map(); const has = new Map();
  for (const n of notes) {
    inc(types, n.meta.type ?? 'memo');
    const c = ctx.cat(n);
    inc(drawers, c.name);
    if (c.sub) inc(drawers, `${c.name}/${c.sub}`);
    for (const t of ctx.tags(n)) inc(tags, t);
    inc(sites, hostOf(n.meta.source));
    for (const [k] of HAS) if (test(n, k, ctx)) inc(has, k);
  }
  const sorted = (m) => [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'ko'));
  return { types, drawers, tags: sorted(tags), sites: sorted(sites), has };
}

export const dateLabel = (f) => {
  if (!f.d) return '';
  if (f.d !== 'custom') return DATES.find(([k]) => k === f.d)?.[1] ?? '';
  return `${f.from || '처음'} ~ ${f.to || '오늘'}`;
};
export { ymd };
