// 자동 분류: 넣는 즉시 노트를 대분류(서랍) › 중분류(세부 서랍) › 소분류로 나누고, 태그를 단다. 기기 안에서 돌아서 돈도 설정도 필요 없다.
// 1) 내가 만든 분류 규칙, 2) 사이트 주소(쿠팡이면 쇼핑), 3) 글 속 낱말, 4) 글의 모양(전화번호, 시각, 체크 목록, 금액, 물음표),
// 5) 내가 직접 옮긴 노트에서 배운 것. 다섯을 더해 가장 높은 서랍을 고르고, 그 안에서 같은 방법으로 세부 서랍을 고른 뒤,
// 글에서 가장 구체적인 낱말을 소분류로 삼는다. 「기타」는 없다: 아무 단서가 없으면 모르는 사이트는 주소로 짐작하고,
// 그것도 없으면 「생각·기록 › 메모」에 글의 첫 낱말을 소분류로 둔다. 왜 그렇게 골랐는지와 자동 태그도 함께 돌려준다.
import { tokenize } from './search.js';
import { CATEGORIES, BLOCKERS, PLATFORMS, SITES, BRAND_SKIP, HOST_HINTS } from './taxonomy.js';

export { CATEGORIES, SITES };
// 예전 버전이 쓰던 「기타」 (이제 자동 분류는 쓰지 않지만, 그 이름의 폴더를 만든 사람이 있을 수 있다)
export const OTHER = '기타';
// 아무 단서가 없을 때
export const FALLBACK = { top: '생각·기록', sub: '메모' };

const lc = (s) => String(s ?? '').toLowerCase();
export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const textOf = (meta, body) => [meta.title, meta.title, (meta.tags ?? []).join(' '), meta.summary, meta.thought, meta.author, body].filter(Boolean).join('\n');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ASCII = /^[a-z0-9 .+#&/-]+$/;
const ONE = (w) => `(^|[^가-힣])(${w})(?=$|[^가-힣]|[은는이가을를에도과와만으랑])`;

// 낱말 하나: 영어는 낱말 단위로(「ai」가 mail에 걸리지 않게), 한글은 들어 있기만 하면.
// 한 글자 낱말(책, 쌀, 롤)은 다른 낱말 속(책임, 롤케이크)에 걸리지 않게 앞뒤를 본다.
const matchers = new Map();
function has(text, word) {
  let m = matchers.get(word);
  if (!m) {
    const w = lc(word.replace(/^[~+\-!]/, ''));
    const re = ASCII.test(w) ? new RegExp(`(^|[^a-z0-9])${esc(w)}([^a-z0-9]|$)`)
      : /^[가-힣]$/.test(w) ? new RegExp(ONE(w))
        : /^[가-힣] /.test(w) ? new RegExp(`(^|[^가-힣])${esc(w)}`) : null;
    m = re ? ((t) => re.test(t)) : ((t) => t.includes(w));
    matchers.set(word, m);
  }
  return m(text);
}
const tagWord = (w) => !/^[~-]/.test(w) && !/\s/.test(w);
const NORM = new Map(); // 낱말 → 찾을 때 쓰는 꼴 (자주 불려서 한 번만 만든다)
const norm = (w) => { let n = NORM.get(w); if (n === undefined) { n = lc(w.replace(/^[~+\-!]/, '')); NORM.set(w, n); } return n; };
const weight = (w) => (w[0] === '!' ? 4 : w[0] === '+' ? 3 : w[0] === '-' ? 0.8 : 1.2);
const plain = (w) => w.replace(/^[~+\-!]/, '');

// 사이트의 한국어 이름을 그 서랍·세부 서랍의 센 낱말로 (뜻이 여럿인 이름은 뺀다)
const brandsOf = (hosts = []) => [...new Set(hosts.flatMap((h) => Object.keys(SITES).filter((k) => h.includes(k) || k.includes(h)).map((k) => SITES[k])))]
  .filter((n) => !BRAND_SKIP.has(n)).map((n) => `!${n}`);
// 세부 서랍의 낱말: 묶음(groups)의 낱말도 넣고, 낱말 → 소분류 이름을 기억해 둔다 (아이폰 → 휴대폰)
// 같은 낱말이 두 번 들어 있으면(앞 표시만 다르게) 처음 것만 센다
const uniq = (ws) => { const seen = new Set(); return ws.filter((w) => !seen.has(norm(w)) && seen.add(norm(w))); };
const LEAF = new Map(); // `${세부 서랍}|${낱말}` → 소분류 이름
const GROUP = new Map(); // 낱말 → 소분류 이름 (다른 서랍에서 빌려 올 때)
for (const d of CATEGORIES) {
  d.words = [...d.words, ...brandsOf(d.hosts)];
  for (const x of d.subs) {
    const grouped = Object.entries(x.groups ?? {});
    for (const [label, ws] of grouped) for (const w of ws) { LEAF.set(`${x.name}|${norm(w)}`, label); if (!GROUP.has(norm(w))) GROUP.set(norm(w), label); }
    x.words = uniq([...x.words, ...grouped.flatMap(([, ws]) => ws), ...brandsOf(x.hosts)]);
  }
}

// 글을 한 번 훑어 사전 낱말을 찾는다. 긴 낱말이 먼저 자리를 차지해서 「운동화」 속 「운동」, 「카페인」 속 「카페」는 세지 않는다.
let VOCAB = null;
// 서랍·세부 서랍 이름과 별칭 (소분류로 빌려 쓰지 않는다)
const NAMES = new Set(CATEGORIES.flatMap((d) => [d.name, ...(d.aliases ?? []), ...d.subs.flatMap((x) => [x.name, ...(x.aliases ?? [])])]).map(lc));
const finders = new Map();
function finder(w) {
  let f = finders.get(w);
  if (!f) {
    // 한 글자로 시작하는 말(「방 정리」「물 마시기」)은 앞이 낱말 속(가방 정리)이 아닐 때만
    const re = ASCII.test(w) ? new RegExp(`(^|[^a-z0-9])(${esc(w)})(?=[^a-z0-9]|$)`, 'g')
      : /^[가-힣]$/.test(w) ? new RegExp(ONE(w), 'g')
        : /^[가-힣] /.test(w) ? new RegExp(`(^|[^가-힣])(${esc(w)})`, 'g')
          : new RegExp(`()(${esc(w)})`, 'g');
    f = (t) => [...t.matchAll(re)].map((m) => m.index + m[1].length);
    finders.set(w, f);
  }
  return f;
}
// 빨리 찾으려고 낱말을 앞 두 글자로 묶어 둔다: 글에 그 두 글자가 있을 때만 그 낱말을 찾아본다
let BYKEY = null;
const keyOf = (w) => w.slice(0, 2);
export function scan(text) {
  if (!VOCAB) {
    VOCAB = [...new Set([...CATEGORIES.flatMap((d) => [...d.words, ...d.subs.flatMap((x) => x.words)]), ...BLOCKERS].map(norm))]
      .sort((a, b) => b.length - a.length);
    BYKEY = new Map();
    VOCAB.forEach((w, i) => { const k = keyOf(w); if (!BYKEY.has(k)) BYKEY.set(k, []); BYKEY.get(k).push(i); });
  }
  const cand = new Set();
  for (let i = 0; i < text.length; i++) {
    for (const k of [text[i], text.slice(i, i + 2)]) for (const j of BYKEY.get(k) ?? []) cand.add(j);
  }
  const used = new Uint8Array(text.length);
  const found = new Map(); // 낱말 → 처음 나온 자리
  for (const j of [...cand].sort((a, b) => a - b)) {
    const w = VOCAB[j];
    for (const at of finder(w)(text)) {
      let free = true;
      for (let i = at; i < at + w.length; i++) if (used[i]) { free = false; break; }
      if (!free) continue;
      used.fill(1, at, at + w.length);
      if (!found.has(w)) found.set(w, at);
    }
  }
  return found;
}
// 사이트 목록에서 맞는 것 → [맞은 것, 약한지] (블로그·글 플랫폼은 무엇이든 올라오니 약하게)
const siteHit = (host, list = []) => {
  const m = list.find((h) => host.includes(h));
  return m ? [m, PLATFORMS.includes(m)] : null;
};

export function siteName(host) {
  if (!host) return '';
  const k = Object.keys(SITES).find((s) => host.includes(s));
  return k ? SITES[k] : '';
}
// 이름을 모르는 사이트는 주소의 이름 부분(example.co.kr → example)
const siteLabel = (host) => siteName(host) || (host.replace(/^(m|mobile|www\d?)\./, '').split('.').filter((p) => !/^(com|net|org|co|or|go|ac|kr|io|me|app|dev|so|ai|jp|us|uk|info|biz)$/.test(p)).pop() ?? '');

// 서랍마다 세부 서랍의 사이트까지 합친 것
const ALL = new Map(CATEGORIES.map((d) => [d, { hosts: [...new Set([...d.hosts, ...d.subs.flatMap((s) => s.hosts ?? [])])] }]));
// 거꾸로 찾기: 낱말(찾는 꼴) → 그 낱말이 든 곳 [{ d: 서랍, s: 세부 서랍(서랍 낱말이면 null), w: 적힌 그대로 }].
// 글에서 찾은 낱말 몇 개만 보면 되니 사전이 커도 빠르다. 한 서랍 안에서는 처음 적힌 곳(서랍 낱말 먼저)만 센다.
const WHERE = new Map();
for (const d of CATEGORIES) {
  const seen = new Set();
  const put = (w, x) => { const n = norm(w); if (!WHERE.has(n)) WHERE.set(n, []); WHERE.get(n).push({ d, s: x, w, first: !seen.has(n) }); seen.add(n); };
  for (const w of d.words) put(w, null);
  for (const x of d.subs) for (const w of x.words) put(w, x);
}
const placesOf = (found) => [...found.keys()].flatMap((n) => WHERE.get(n) ?? []);

// 글의 모양으로 아는 것: 전화번호·메일 → 연락처, 체크 목록 → 할 일, 시각·날짜 → 일정, 금액 → 가계부, 물음표 → 질문.
// soft: 내용으로 서랍이 정해지면 보태지 않는다 (「치과 예약 내일 3시」는 병원, 「내일 3시」만 있으면 일정)
const SIGNALS = [
  { re: /(?:^|[^\d])(?:01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|0\d{1,2}-\d{3,4}-\d{4})(?!\d)/, top: '사람·연락', sub: '연락처', s: 1, why: '전화번호', leaf: '전화번호' },
  { re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, top: '사람·연락', sub: '연락처', s: 1, why: '메일 주소', leaf: '이메일' },
  { re: /^\s*[-*+] \[[ xX]\]/m, top: '할 일·일정', sub: '할 일', s: 1.2, why: '체크 목록' },
  { soft: true, re: /\d{1,2}\s?시(?:\s?\d{1,2}\s?분|\s?반)?(?![가-힣])|\d{1,2}\s?시(?=[에까쯤부전])|(?:^|[^\d])\d{1,2}:\d{2}(?!\d)|(?:오전|오후)\s?\d/, top: '할 일·일정', sub: '일정', s: 0.8, why: '시각' },
  { soft: true, re: /\d{1,2}\s?월\s?\d{1,2}\s?일|[월화수목금토일]요일|내일|모레|다음\s?주|이번\s?주|다음\s?달/, top: '할 일·일정', sub: '일정', s: 0.5, why: '날짜' },
  { soft: true, re: /\d[\d,]*\s?(?:만\s?|천\s?)?(?:원|달러)(?![가-힣])|₩\s?\d|\$\s?\d/, top: '돈·재테크', sub: '가계부', s: 0.5, why: '금액' },
  { soft: true, re: /[?？]\s*$|(?:까|나|지|죠)\s?[?？]/, top: '생각·기록', sub: '질문', s: 0.6, why: '물음' },
  { soft: true, re: /(?:하기|해야지|해야 함|해야겠|챙기기)(?=$|[\s.,!])/m, top: '할 일·일정', sub: '할 일', s: 0.5, why: '할 일' },
];

// 이미 있는 분류(Claude·내가 정한 것)에서 낱말을 배운다: 서랍·세부 서랍마다 어떤 낱말이 자주 나오는지
export function learn(notes, { paths = [] } = {}) {
  const cats = new Map();
  const subs = new Map();
  const df = new Map();
  const tags = new Map();
  const bump = (map, key, words) => {
    if (!map.has(key)) map.set(key, { n: 0, words: new Map() });
    const c = map.get(key);
    c.n++;
    for (const w of words) c.words.set(w, (c.words.get(w) ?? 0) + 1);
  };
  for (const n of notes) {
    for (const t of n.meta.tags ?? []) tags.set(String(t), (tags.get(String(t)) ?? 0) + 1);
    const [cat, sub] = parts(n.meta.category);
    if (!cat || n.meta.status !== 'organized') continue;
    const words = new Set(tokenize(textOf(n.meta, n.body ?? n.snippet)));
    const host = hostOf(n.meta.source);
    if (host) words.add(`@${host}`);
    bump(cats, cat, words);
    if (sub) bump(subs, `${cat}/${sub}`, words);
  }
  for (const c of cats.values()) for (const w of c.words.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const known = new Set([...cats.keys(), ...paths.map((p) => parts(p)[0]).filter(Boolean)]);
  const subPaths = new Set([...subs.keys(), ...paths.filter((p) => parts(p).length > 1).map((p) => parts(p).slice(0, 2).join('/'))]);
  return { cats, subs, df, tags, names: [...known], subPaths: [...subPaths] };
}

const parts = (category) => String(category ?? '').split('/').map((s) => s.trim()).filter(Boolean);
export const topOf = (category) => parts(category)[0] ?? '';

// 기본 서랍 이름을 이미 있는 폴더 이름에 맞춘다 (「패션·뷰티」 대신 원래 쓰던 「패션」)
export function resolveName(def, existing) {
  const hit = existing.find((name) => name === def.name || (def.aliases ?? []).includes(name));
  return hit ?? def.name;
}
const defOf = (top, existing = []) => CATEGORIES.find((d) => d.name === top || resolveName(d, existing) === top) ?? null;

// 규칙 한 줄: { match: '가습기, 제습기', drawer: '쇼핑/가전/가습기', tags: ['가전'] }
export function ruleWords(rule) {
  return String(rule?.match ?? '').split(/[,\n]/).map((s) => lc(s.trim())).filter(Boolean);
}

// opts: { subs: 세부 서랍·소분류까지(기본 켬), tags: 자동 태그 수(0이면 안 닮), rules: 내 분류 규칙 }
// → { category, sub, leaf, path, why, score, tags, weak } — weak: 단서가 없어 「메모」로 둔 것
export function classify({ meta = {}, body = '' }, model = null, opts = {}) {
  const { subs: wantSubs = true, tags: maxTags = 4, rules = [] } = opts;
  const raw = textOf(meta, body);
  const text = lc(raw);
  // 출처가 없어도 글 속 첫 주소의 사이트를 본다 (「청소기 비교 https://coupang.com/…」)
  const host = hostOf(meta.source) || hostOf(/https?:\/\/[^\s)\]>"']+/.exec(String(body ?? ''))?.[0]);
  // 주소는 낱말을 찾을 때 빼고 본다 (주소 속 영어가 낱말로 걸리지 않게)
  const words0 = text.replace(/https?:\/\/[^\s)\]>"']+/g, ' ');
  const existing = model?.names ?? [];
  const scores = new Map();
  const whys = new Map();
  const forced = new Map(); // 규칙이 정한 세부 서랍·소분류
  const ruleTags = [];
  const sigs = []; // 글의 모양 신호
  const add = (name, s, why) => {
    scores.set(name, (scores.get(name) ?? 0) + s);
    if (why && !whys.has(name)) whys.set(name, why);
  };

  const found = scan(words0);
  const places = placesOf(found);
  // 1) 내 분류 규칙이 가장 세다
  for (const r of rules) {
    const got = ruleWords(r).find((w) => has(text, w) || (host && host.includes(w)));
    if (!got) continue;
    const [top, sub, leaf] = parts(r.drawer);
    if (top) { add(top, 10, `내 규칙 “${got}”`); if (sub && !forced.has(top)) forced.set(top, [sub, leaf ?? '']); }
    for (const t of r.tags ?? []) ruleTags.push(String(t));
  }
  // 2) 사이트 3) 낱말
  const perCat = new Map(); // 서랍 → { sum, best }
  for (const e of places) {
    if (!e.first) continue;
    const c = perCat.get(e.d) ?? { sum: 0, best: null };
    c.sum += weight(e.w);
    // 왜 골랐는지 보여 줄 낱말: 가장 센 것, 같으면 글에 먼저 나온 것
    if (!c.best || weight(e.w) > weight(c.best) || (weight(e.w) === weight(c.best) && found.get(norm(e.w)) < found.get(norm(c.best)))) c.best = e.w;
    perCat.set(e.d, c);
  }
  for (const def of CATEGORIES) {
    const name = resolveName(def, existing);
    const site = host ? siteHit(host, ALL.get(def).hosts) : null;
    if (site) add(name, site[1] ? 1 : 4, `${host} 링크`);
    const c = perCat.get(def);
    if (c) add(name, Math.min(c.sum, 6), `“${plain(c.best)}”`);
  }
  // 4) 글의 모양 (soft 는 아래에서 내용이 모자랄 때만)
  for (const g of SIGNALS) {
    if (!g.re.test(raw)) continue;
    const name = resolveName(defOf(g.top), existing);
    sigs.push({ ...g, top: name });
    if (!g.soft) add(name, g.s, g.why);
  }
  // 5) 내가 정리해 둔 노트에서 배운 것
  const words = model?.cats?.size || model?.subs?.size ? new Set(tokenize(textOf(meta, body))) : null;
  if (words && host) words.add(`@${host}`);
  const learned = (c, C, df) => {
    let s = 0;
    for (const w of words) {
      const k = c.words.get(w);
      if (k) s += (k / c.n) * Math.log(1 + C / (df.get(w) ?? 1));
    }
    // 노트가 몇 개 안 되는 서랍은 덜 믿는다 (흔한 낱말 하나로 끌려가지 않게)
    return Math.min(s * 2 * Math.min(1, c.n / 4), 5);
  };
  if (model?.cats?.size) {
    for (const [name, c] of model.cats) {
      const s = learned(c, model.cats.size, model.df);
      if (s > 0) add(name, s, '비슷한 노트가 있는 서랍');
    }
  }
  const top = () => { let b = null; for (const [name, s] of scores) if (!b || s > b.score) b = { category: name, score: s }; return b; };
  let best = top();
  if (!best || best.score < 1.2) {
    for (const g of sigs) if (g.soft) add(g.top, g.s, g.why);
    best = top();
  }
  const ctx = { text: words0, found, places, host, model, words, forced, existing, sigs, meta, body, ruleTags, maxTags, wantSubs };
  if (best && best.score >= 0.5) return finish(best.category, best.score, whys.get(best.category) ?? '', ctx);

  // 단서가 없을 때: 모르는 사이트는 주소로 짐작하고(쇼핑몰·신문·블로그…), 아니면 메모
  if (host) {
    const hint = HOST_HINTS.find(([re]) => re.test(host));
    const [top, sub] = hint ? [hint[1], hint[2]] : ['공부·자료', '아티클'];
    return finish(resolveName(defOf(top), existing), 0.4, `${host} 링크`, { ...ctx, prefer: sub, siteLeaf: true });
  }
  if (meta.type === 'capture' && !String(body ?? '').replace(/!\[\[[^\]]*\]\]|^#+.*$/gm, '').trim()) {
    return finish(resolveName(defOf('생각·기록'), existing), 0.3, '사진', { ...ctx, prefer: '캡처', weak: true });
  }
  return finish(resolveName(defOf(FALLBACK.top), existing), 0.2, '', { ...ctx, prefer: FALLBACK.sub, weak: true });
}

// 서랍이 정해지면 세부 서랍과 소분류, 태그를 고른다
function finish(top, score, why, ctx) {
  const def = defOf(top, ctx.existing);
  let sub = '';
  let leaf = '';
  if (ctx.wantSubs) {
    [sub, leaf] = pickSub(top, def, ctx);
    if (sub && !leaf) leaf = pickLeaf(top, sub, def, ctx);
  }
  const path = [top, sub, leaf].filter(Boolean).join('/');
  return { category: top, sub, leaf, path, why, score, weak: !!ctx.weak, tags: pickTags({ ...ctx, top, sub }) };
}

// 서랍 안에서 세부 서랍 고르기: 규칙 → 사이트 → 낱말 → 글의 모양 → 배운 것. 모자라면 그 서랍의 기본 세부 서랍.
function pickSub(top, def, { found, places, host, model, words, forced, sigs, prefer }) {
  if (forced.has(top)) return forced.get(top);
  const known = (model?.subPaths ?? []).filter((p) => topOf(p) === top).map((p) => parts(p)[1]);
  const scores = new Map();
  const first = new Map(); // 세부 서랍 낱말이 글에 처음 나온 자리 (점수가 같으면 먼저 나온 쪽)
  const add = (name, s, at = Infinity) => { scores.set(name, (scores.get(name) ?? 0) + s); first.set(name, Math.min(first.get(name) ?? Infinity, at)); };
  const nameOf = (s) => known.find((k) => k === s.name || (s.aliases ?? []).includes(k)) ?? s.name;
  for (const s of def?.subs ?? []) {
    // 이미 쓰는 세부 폴더 이름이 있으면 그 이름으로 (「가전」 대신 원래 쓰던 「전자제품」)
    const name = nameOf(s);
    const site = host ? siteHit(host, s.hosts) : null;
    if (site) add(name, site[1] ? 1 : 4);
    const got = places.filter((e) => e.s === s);
    const sum = got.reduce((t, e) => t + weight(e.w), 0);
    if (sum) add(name, Math.min(sum, 6), Math.min(...got.map((e) => found.get(norm(e.w)))));
  }
  for (const g of sigs) if (g.top === top && def && (!g.soft || !scores.size)) { const s = def.subs.find((x) => x.name === g.sub); if (s) add(nameOf(s), g.s); }
  if (words && model?.subs?.size) {
    const mine = [...model.subs].filter(([p]) => topOf(p) === top);
    for (const [p, c] of mine) {
      let s = 0;
      for (const w of words) { const k = c.words.get(w); if (k) s += k / c.n; }
      if (s > 0) add(parts(p)[1], Math.min(s * 2 * Math.min(1, c.n / 3), 5));
    }
  }
  let best = null;
  for (const [name, s] of scores) if (!best || s > best.s || (s === best.s && (first.get(name) ?? Infinity) < (first.get(best.name) ?? Infinity))) best = { name, s };
  if (best && best.s >= 0.5) return [best.name, ''];
  const base = prefer ?? def?.base;
  const s = def?.subs.find((x) => x.name === base);
  return [s ? nameOf(s) : '', ''];
}

// 소분류: 세부 서랍 안에서 글에 먼저 나온 구체적인 낱말(묶음이 있으면 묶음 이름) → 다른 서랍의 낱말 → 신호 → 사이트 이름 → 글의 첫 낱말
const BAD_END = /(법|만한|든다|보니|두기|싶|곳|것|점|하기|까|지)$/;
const VERB_END = /(하기|챙기기|가기|오기|보기|주기|두기|먹기|사기|까|해야지|하자)$/;
function pickLeaf(top, sub, def, { found, places, host, sigs, siteLeaf, meta, body }) {
  const sdef = def?.subs.find((x) => x.name === sub || (x.aliases ?? []).includes(sub));
  // 서랍·세부 서랍 이름과 같은 말은 소분류로 쓰지 않는다 (쇼핑 › 위시리스트 › 위시리스트)
  const skip = new Set([top, sub, def?.name, sdef?.name, ...String(sub).split(/\s+/), ...String(top).split(/[\s·]+/)].filter(Boolean).map(lc));
  const labelOf = (w, own) => (own ? LEAF.get(`${sdef?.name}|${norm(w)}`) : null) ?? GROUP.get(norm(w)) ?? '';
  // ~ 낱말(「힘들」)은 묶음 이름(기분)이 있을 때만, 「~하는 법」「챙기기」 같은 꼴은 묶음 이름이 있을 때만
  const usable = (w, label) => (w[0] !== '~' || label) && (label || !(/\s/.test(w) ? BAD_END : VERB_END).test(plain(w)));
  const pick = (ws, own) => {
    const list = [];
    for (const w of ws) {
      if (!found.has(norm(w))) continue;
      let group = labelOf(w, own);
      // 묶음 이름이 세부 서랍 이름과 같으면(「상의」 폴더 안의 셔츠) 낱말 그대로
      if (group && skip.has(lc(group))) group = '';
      if (!usable(w, group)) continue;
      const label = group || plain(w);
      if (skip.has(lc(label)) || skip.has(norm(w))) continue;
      // 다른 서랍에서 빌려 올 때 서랍 이름 자체(위시리스트, 레시피)는 쓰지 않는다
      if (!own && NAMES.has(lc(label))) continue;
      // 보통 낱말 → 흔한 낱말 → 사이트 이름, 같으면 글에 먼저 나온 것
      list.push([label, w[0] === '!' ? 2 : w[0] === '-' ? 1 : 0, found.get(norm(w))]);
    }
    list.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    return list[0]?.[0] ?? '';
  };
  if (siteLeaf && host) { const s = siteLabel(host); if (s && !skip.has(lc(s))) return s; }
  const own = pick(places.filter((e) => sdef && e.s === sdef).map((e) => e.w), true);
  if (own) return own;
  // 다른 서랍의 낱말은 흔한 말(-)과 한 글자 말은 빼고 빌려 온다 (「집 근처 맛집」의 「집」)
  const other = pick(uniq(places.map((e) => e.w).filter((w) => w[0] !== '-' && plain(w).length > 1)), false);
  if (other) return other;
  const sig = sigs.find((g) => g.leaf);
  if (sig) return sig.leaf;
  if (host) { const s = siteLabel(host); if (s) return s; }
  return nounOf(meta, body, skip);
}

// 사전에 없는 글: 제목·첫 줄에서 이름 같은 낱말 하나 (「양자역학 너무 어렵다」 → 양자역학)
const NOUN_STOP = new Set(['추천', '후기', '리뷰', '방법', '시작', '준비', '고민', '근처', '정보', '확인', '찾기', '오늘', '내일', '어제', '모레', '지금', '이번', '다음', '지난', '정말', '진짜', '너무', '그냥', '하나', '이거', '저거', '그거', '여기', '거기', '저기', '우리', '나중', '다시', '같이', '먼저', '생각', '메모', '기록', '정리', '내용', '부분', '관련', '많이', '조금', '아주', '매우', '계속', '항상', '가끔', '혹시', '아마', '이제', '벌써', '아직', '자주', '모두', '전부', '다들', '이건', '그건', '저건', '이런', '그런', '저런', '어떤', '모든', '제일', '가장', '완전', '엄청', '되게', '갑자기', '드디어', '일단', '이따', '요즘', '오랜만', '때문', '정도', '사실', '그리고', '근데', '그래서', '하지만', '또는', '그럼', '아니', '없음', '있음', '목록', '리스트', '사진', '링크', '노트']);
const VERBISH = /(을|를|의|에|로|와|과|도|만|다|요|죠|네|까|군|구나|니|냐|게|고|며|면|서|자|라|래|야|어|아|여|해|했|할|한|된|될|던|는|은|기|지|음|임|함|됨|듯|려|러|도록|면서|지만|는데|니까|으로|에서|처럼|까지|부터|이랑|하고)$/;
function nounOf(meta, body, skip) {
  const lines = [meta.title ?? '', ...String(body ?? '').replace(/https?:\/\/\S+/g, ' ').replace(/!\[\[[^\]]*\]\]/g, ' ').split('\n')]
    .map((l) => l.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+|\d+[.)]\s+)/, '')).filter((l) => l.trim());
  for (const line of lines.slice(0, 4)) {
    for (const t of tokenize(line)) {
      if (t.length < 2 || t.length > 12 || /\d/.test(t) || /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(t) || NOUN_STOP.has(t) || skip.has(t)) continue;
      if (/^[a-z]+$/.test(t) ? t.length < 3 : VERBISH.test(t)) continue;
      return t;
    }
  }
  return '';
}

// 자동 태그: 규칙의 태그 → 이미 쓰는 태그 중 글에 나온 것 → 사이트 이름 → 세부 서랍 낱말 → 서랍 낱말 → 다른 서랍 낱말
function pickTags({ text, found, places, host, top, sub, ruleTags, model, maxTags }) {
  if (!maxTags) return [];
  const out = [];
  const seen = new Set([lc(top), lc(sub), lc(OTHER)]);
  const push = (t) => {
    const tag = String(t).replace(/^#/, '').replace(/\s+/g, '');
    if (!tag || tag.length > 20 || seen.has(lc(tag)) || out.length >= maxTags) return;
    seen.add(lc(tag));
    out.push(tag);
  };
  ruleTags.forEach(push);
  if (model?.tags?.size) {
    const mine = [...model.tags].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => t.length >= 2 && has(text, t));
    mine.slice(0, 2).forEach(push);
  }
  push(siteName(host));
  const def = CATEGORIES.find((d) => d.name === top || (d.aliases ?? []).includes(top));
  const s = def?.subs.find((x) => x.name === sub || (x.aliases ?? []).includes(sub));
  const groups = [places.filter((e) => s && e.s === s), places.filter((e) => def && e.d === def), places.filter((e) => e.s && e.d !== def)].map((g) => g.map((e) => e.w));
  // 고른 서랍의 낱말 먼저, 같은 무리 안에서는 글에 먼저 나온 것부터
  const taken = new Set();
  const list = [];
  groups.forEach((ws, g) => ws.forEach((w) => {
    if (taken.has(w) || !tagWord(w) || !found.has(norm(w))) return;
    taken.add(w);
    list.push([w, g, found.get(norm(w))]);
  }));
  list.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  // 「항공권」이 있으면 「항공」은 빼고, 「동물병원」이 있으면 「병원」은 뺀다
  const words = list.map(([w]) => plain(w));
  for (const w of words) if (!words.some((o) => o !== w && o.includes(w))) push(w);
  return out;
}

// 서랍 이름 → 아이콘과 색
export function categoryLook(name) {
  const def = CATEGORIES.find((d) => d.name === name || d.aliases.includes(name));
  if (def) return { icon: def.icon, tone: def.tone };
  if (name === OTHER) return { icon: 'drawer', tone: 6 };
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return { icon: 'folder', tone: h % 6 };
}

// 기본 서랍과 세부 서랍 이름 (설정, 사용법, 서랍 고르기에 보여 준다). leaves: 세부 서랍마다 소분류 예시 몇 개
export const defaultTree = () => CATEGORIES.map((d) => ({
  name: d.name,
  subs: d.subs.map((s) => s.name),
  leaves: Object.fromEntries(d.subs.map((s) => [s.name, [...Object.keys(s.groups ?? {}), ...s.words.filter((w) => tagWord(w) && w[0] !== '!' && !GROUP.has(norm(w)) && w !== s.name)].slice(0, 4).map(plain)])),
}));
