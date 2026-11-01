// 연관 노트 찾기: 서로 이어 볼 만한 노트를 기기 안에서 고른다 (생각 지도의 점선, 노트 옆 「비슷한 노트」).
// 점수 = 드문 낱말을 함께 쓰는 정도(TF-IDF 코사인) + 같은 태그 + 같은 사이트 + 같은 서랍(› 세부 서랍 › 소분류).
// 같은 서랍이라는 것만으로는 잇지 않는다. 낱말·태그·사이트 중 하나는 겹쳐야 한다.
// 단서가 없어 「메모」에 둔 노트(weak)끼리는 서랍이 같아도 점수를 더하지 않는다.
import { tokenize } from './search.js';

// 흔해서 뜻이 없는 사이트 (같아도 거의 점수를 주지 않는다)
const WIDE_HOSTS = ['instagram.com', 'youtube.com', 'youtu.be', 'naver.com', 'google.com', 'tistory.com', 'brunch.co.kr', 'medium.com'];
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// 글에서 주소·마크다운 표시를 걷어 내고 낱말만
function termsOf(n) {
  const m = n.meta ?? {};
  const body = String(n.body ?? n.snippet ?? '')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^## 사진 속 글자\s*([\s\S]*)$/m, (_, ocr) => ocr.slice(0, 400));
  const tf = new Map();
  const put = (text, w) => { for (const t of tokenize(text)) if (!/^\d+$/.test(t)) tf.set(t, (tf.get(t) ?? 0) + w); };
  put(m.title ?? '', 3);
  put(m.summary ?? '', 2);
  put(m.thought ?? '', 1.5);
  put(body, 1);
  return tf;
}

// ctx: { cat(n) → { name, sub, leaf, weak }, tags(n) → [태그] }
export function buildIndex(notes, ctx) {
  const docs = notes.map((n) => {
    const c = ctx.cat(n);
    return { id: n.id, note: n, top: c.name, path: c.sub ? `${c.name}/${c.sub}` : '', leaf: c.sub && c.leaf ? `${c.name}/${c.sub}/${c.leaf}` : '', weak: !!c.weak, host: hostOf(n.meta?.source), tags: new Set(ctx.tags(n)), tf: termsOf(n), links: new Set((n.meta?.links ?? []).map(String)) };
  });
  const N = docs.length || 1;
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t) => Math.log(1 + N / (df.get(t) ?? 1));
  for (const d of docs) {
    let s = 0;
    d.w = new Map();
    for (const [t, f] of d.tf) { const v = (1 + Math.log(f)) * idf(t); d.w.set(t, v); s += v * v; }
    d.norm = Math.sqrt(s) || 1;
  }
  // 함께 본 후보만 계산하려고 낱말·태그·사이트별 목록 (너무 흔한 낱말은 후보를 만들지 않는다)
  const post = new Map();
  const add = (k, i) => { if (!post.has(k)) post.set(k, []); post.get(k).push(i); };
  docs.forEach((d, i) => {
    for (const t of d.tf.keys()) if (N < 40 || (df.get(t) ?? 0) <= Math.max(6, N * 0.2)) add(`w:${t}`, i);
    for (const t of d.tags) add(`t:${t}`, i);
    if (d.host && !WIDE_HOSTS.some((h) => d.host.endsWith(h))) add(`h:${d.host}`, i);
  });
  return { docs, byId: new Map(docs.map((d, i) => [d.id, i])), post, idf };
}

function pair(index, a, b) {
  let dot = 0;
  const shared = [];
  const [small, big] = a.w.size < b.w.size ? [a, b] : [b, a];
  for (const [t, v] of small.w) { const u = big.w.get(t); if (u) { dot += v * u; shared.push([t, v * u]); } }
  const cos = dot / (a.norm * b.norm);
  const tags = [...a.tags].filter((t) => b.tags.has(t));
  const host = a.host && a.host === b.host ? a.host : '';
  const wide = host && WIDE_HOSTS.some((h) => host.endsWith(h));
  const content = cos >= 0.08 || tags.length > 0 || (host && !wide);
  if (!content) return null;
  const drawer = !a.weak && !b.weak;
  const sameLeaf = drawer && a.leaf && a.leaf === b.leaf;
  const samePath = drawer && a.path && a.path === b.path;
  const sameTop = drawer && a.top && a.top === b.top && a.top !== '기타';
  const score = cos * 0.75 + Math.min(2, tags.length) * 0.18 + (host ? (wide ? 0.03 : 0.15) : 0) + (sameLeaf ? 0.2 : samePath ? 0.14 : sameTop ? 0.07 : 0);
  const why = [];
  shared.sort((x, y) => y[1] - x[1]);
  if (shared.length && cos >= 0.08) why.push(shared.slice(0, 2).map(([t]) => `“${t}”`).join(' '));
  for (const t of tags.slice(0, 2)) why.push(`#${t}`);
  if (host && !wide) why.push(host);
  if (sameLeaf) why.push(`같은 서랍 ${a.leaf.replaceAll('/', ' › ')}`);
  else if (samePath) why.push(`같은 서랍 ${a.path.replaceAll('/', ' › ')}`);
  else if (sameTop) why.push(`같은 서랍 ${a.top}`);
  return { score, why };
}

// 이 노트와 이어 볼 만한 노트 → [{ note, score, why: [...] }]
export function relatedTo(index, id, { limit = 5, min = 0.2, skip = new Set() } = {}) {
  const i = index.byId.get(String(id));
  if (i == null) return [];
  const a = index.docs[i];
  const cand = new Set();
  for (const t of a.tf.keys()) for (const j of index.post.get(`w:${t}`) ?? []) cand.add(j);
  for (const t of a.tags) for (const j of index.post.get(`t:${t}`) ?? []) cand.add(j);
  if (a.host) for (const j of index.post.get(`h:${a.host}`) ?? []) cand.add(j);
  cand.delete(i);
  const out = [];
  for (const j of cand) {
    const b = index.docs[j];
    if (skip.has(b.id)) continue;
    const r = pair(index, a, b);
    if (r && r.score >= min) out.push({ note: b.note, id: b.id, score: r.score, why: r.why });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

// 생각 지도의 추천 연결: 노트마다 가장 가까운 k개 (이미 이은 것은 뺀다) → [{ a, b, score, why }]
export function relatedEdges(index, { k = 3, min = 0.2, linked = new Set() } = {}) {
  const seen = new Map();
  for (const d of index.docs) {
    for (const r of relatedTo(index, d.id, { limit: k, min })) {
      const key = [d.id, r.id].sort().join('|');
      if (linked.has(key)) continue;
      if (!seen.has(key) || seen.get(key).score < r.score) seen.set(key, { a: d.id, b: r.id, score: r.score, why: r.why });
    }
  }
  return [...seen.values()];
}
