// 서버 없이 기기 안에서 도는 검색. 한국어 조사를 떼고, 제목·태그·서랍·요약·본문에
// 가중치를 달리 줘서 점수를 매긴다.

const PARTICLES = [
  '에서는', '으로는', '이라는', '에게서', '한테서', '까지는', '부터는',
  '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다', '이랑', '하고', '이나', '라는', '이란',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과', '만', '랑', '나', '요',
];

const STOP = new Set([
  '뭐', '뭐가', '무엇', '어떤', '어디', '언제', '있어', '있었지', '있었어', '있나', '있는', '했던', '저장한',
  '저장했던', '저장했지', '찾아줘', '보여줘', '알려줘', '좀', '그', '저', '내가', '나의', '내', '것', '거', '중에', '중',
  '요즘', '무슨', '어떻게', '싶은', '싶어', '있을까', '만에', '할', '수', '때', '볼', '갈', '하는', '되는',
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in',
]);

// 기기 안 검색이 문장 질문도 알아듣도록 쓰는 작은 낱말 사전 (단어 → 함께 찾을 말)
const EXPAND = {
  옷: ['패션', '상의', '하의', '셔츠', '니트', '가디건', '코디', '신발'],
  사고: ['위시리스트', '사고싶은'], 살: ['위시리스트'], 구매: ['위시리스트'], 쇼핑: ['위시리스트', '패션'],
  신발: ['스니커즈', '운동화', '구두'], 운동화: ['스니커즈'],
  요리: ['레시피', '요리'], 레시피: ['요리'], 음식: ['요리', '레시피', '맛집'], 먹을: ['요리', '맛집'],
  맛집: ['식당', '카페', '맛집'], 카페: ['카페', '커피'],
  여행: ['여행', '제주', '숙소', '일정'], 놀러: ['여행'],
  공부: ['공부', '메모법', '강의'], 아이디어: ['아이디어', '생각'], 생각: ['생각', '내생각'],
};

export function expand(term) {
  return [term, ...(EXPAND[term] ?? [])];
}

export function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFC');
}

function stripParticle(t) {
  if (!/[가-힣]$/.test(t)) return t;
  for (const p of PARTICLES) {
    if (t.length > p.length + 1 && t.endsWith(p)) return t.slice(0, -p.length);
  }
  return t;
}

export function tokenize(s) {
  return normalize(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stripParticle)
    .filter((t) => t && !STOP.has(t) && (t.length > 1 || EXPAND[t] || /\d/.test(t)));
}

// 질의 문법: #태그, 서랍:패션, 종류:인스타, 그 외는 일반 단어
export function parseQuery(q) {
  const terms = [];
  const tags = [];
  let category = null;
  let type = null;
  for (const raw of String(q ?? '').trim().split(/\s+/).filter(Boolean)) {
    if (raw.startsWith('#') && raw.length > 1) { tags.push(normalize(raw.slice(1))); continue; }
    const m = /^(서랍|폴더|종류):(.+)$/.exec(raw);
    if (m) {
      if (m[1] === '종류') type = m[2];
      else category = normalize(m[2]);
      continue;
    }
    terms.push(...tokenize(raw));
  }
  return { terms: [...new Set(terms)], tags, category, type };
}

const TYPE_ALIASES = { 메모: 'memo', 캡처: 'capture', 사진: 'capture', 북마크: 'bookmark', 링크: 'bookmark', 인스타: 'instagram', 릴스: 'instagram' };

const FIELDS = [
  ['title', 6],
  ['tags', 5],
  ['category', 4],
  ['summary', 3],
  ['thought', 3],
  ['author', 2],
  ['body', 1],
];

export function docFor(note) {
  const m = note.meta ?? {};
  return {
    note,
    title: normalize(m.title),
    tags: normalize((m.tags ?? []).join(' ')),
    category: normalize(m.category),
    summary: normalize(m.summary),
    thought: normalize(m.thought),
    author: normalize(m.author),
    body: normalize(note.body ?? note.snippet ?? ''),
    tagList: (m.tags ?? []).map(normalize),
    type: m.type,
  };
}

export function search(notes, query, { limit = 60 } = {}) {
  const q = typeof query === 'string' ? parseQuery(query) : query;
  const type = q.type ? (TYPE_ALIASES[q.type] ?? q.type) : null;
  const results = [];
  for (const note of notes) {
    const d = note._doc ?? docFor(note);
    if (type && d.type !== type) continue;
    if (q.category && !d.category.includes(q.category)) continue;
    if (q.tags.length && !q.tags.every((t) => d.tagList.some((x) => x.includes(t)))) continue;
    let score = 0;
    let matched = 0;
    const hits = new Set();
    for (const term of q.terms) {
      let termScore = 0;
      expand(term).forEach((alt, ai) => {
        const weight = ai === 0 ? 1 : 0.6; // 사전으로 넓힌 말은 조금 낮게
        let s = 0;
        for (const [f, w] of FIELDS) {
          const text = d[f];
          if (!text) continue;
          const idx = text.indexOf(alt);
          if (idx !== -1) {
            s += w * (idx === 0 ? 1.5 : 1);
            hits.add(f);
          } else if (ai === 0 && alt.length >= 3 && /[가-힣]/.test(alt) && text.includes(alt.slice(0, 2))) {
            s += w * 0.25;
          }
        }
        termScore = Math.max(termScore, s * weight);
      });
      if (termScore > 0) matched++;
      score += termScore;
    }
    if (q.terms.length) {
      if (matched === 0) continue;
      // 모든 단어가 맞으면 우대, 일부만 맞으면 감점
      score *= matched === q.terms.length ? 1.6 : matched / q.terms.length;
    } else {
      score = 1;
    }
    results.push({ note, score, hits: [...hits] });
  }
  results.sort((a, b) => b.score - a.score || String(b.note.meta.id).localeCompare(String(a.note.meta.id)));
  return results.slice(0, limit);
}

export function highlight(text, terms, esc) {
  let html = esc(text);
  const list = [...terms].filter(Boolean).sort((a, b) => b.length - a.length).map(esc);
  if (!list.length) return html;
  const re = new RegExp(`(${list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return html.replace(re, '<mark>$1</mark>');
}
