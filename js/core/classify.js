// 자동 분류: 넣는 즉시 노트를 서랍(분류)에 나눈다. 기기 안에서 돌아서 돈도 설정도 필요 없다.
// 1) 사이트 주소(쿠팡이면 쇼핑, 유튜브면 영상), 2) 글 속 낱말, 3) 내가 직접 옮긴 노트에서 배운 것.
// 셋을 더해 가장 높은 서랍을 고르고, 어디에도 안 맞으면 「기타」. 왜 그렇게 골랐는지도 함께 돌려준다.
import { tokenize } from './search.js';

export const OTHER = '기타';

// 기본 서랍. aliases 는 이미 있는 폴더 이름과 맞출 때 쓴다 (예: Claude가 만든 「패션」 폴더가 있으면 그 이름을 쓴다)
export const CATEGORIES = [
  { name: '쇼핑', icon: 'bag', tone: 4, aliases: ['쇼핑', '위시', '위시리스트', '살 것', '구매'],
    hosts: ['coupang', '11st', 'gmarket', 'auction.co', 'ssg.com', 'lotteon', 'kurly', 'amazon', 'aliexpress', 'ebay', 'temu', 'smartstore.naver', 'shopping.naver', 'brand.naver', 'idus', 'danawa', 'enuri', 'tmon', 'wemakeprice', 'costco', 'emart', 'daiso'],
    words: ['쇼핑', '구매', '사고 싶', '살 것', '장바구니', '최저가', '할인', '세일', '쿠폰', '주문', '배송', '위시', '특가', '시즌오프', '리뷰 많은', '가성비', '품절'] },
  { name: '패션·뷰티', icon: 'shirt', tone: 3, aliases: ['패션', '뷰티', '옷', '코디', '스타일', '화장품'],
    hosts: ['musinsa', '29cm', 'wconcept', 'zigzag', 'a-bly', 'ably', 'oliveyoung', 'hwahae', 'kream', 'uniqlo', 'zara', 'cos.com', 'hm.com', 'nike', 'adidas'],
    words: ['옷', '코디', '패션', '셔츠', '바지', '청바지', '니트', '가디건', '코트', '자켓', '재킷', '스니커즈', '신발', '가방', '원피스', '룩', '화장품', '스킨케어', '뷰티', '향수', '헤어', '네일', '사이즈'] },
  { name: '요리·맛집', icon: 'cook', tone: 2, aliases: ['요리', '맛집', '레시피', '음식', '카페', '먹거리'],
    hosts: ['10000recipe', 'mangoplate', 'diningcode', 'catchtable', 'baemin', 'yogiyo', 'recipe'],
    words: ['레시피', '요리', '재료', '맛집', '식당', '카페', '메뉴', '브런치', '디저트', '베이킹', '국수', '볶음', '찌개', '파스타', '먹고', '먹을', '반찬', '밀키트', '오마카세', '빵집', '커피'] },
  { name: '여행', icon: 'plane', tone: 5, aliases: ['여행', '숙소', '캠핑', '나들이'],
    hosts: ['airbnb', 'agoda', 'booking.com', 'expedia', 'trip.com', 'yanolja', 'goodchoice', 'yeogi', 'myrealtrip', 'skyscanner', 'tripadvisor', 'klook', 'hotels.com', 'visitkorea', 'interpark', 'koreanair', 'flyasiana', 'jejuair'],
    words: ['여행', '숙소', '호텔', '항공', '비행기', '관광', '제주', '부산', '강릉', '도쿄', '오사카', '후쿠오카', '방콕', '다낭', '파리', '캠핑', '휴가', '투어', '렌터카', '게스트하우스', '리조트'] },
  { name: '공부·자료', icon: 'book', tone: 0, aliases: ['공부', '자료', '책', '독서', '메모법', '학습', '스터디'],
    hosts: ['wikipedia', 'namu.wiki', 'brunch.co.kr', 'medium.com', 'velog', 'arxiv', 'scholar.google', 'coursera', 'udemy', 'inflearn', 'class101', 'yes24', 'kyobobook', 'aladin', 'ridibooks', 'millie', 'ted.com', 'khanacademy'],
    words: ['공부', '강의', '독서', '논문', '자료', '개념', '배우', '영어', '시험', '메모법', '제텔카스텐', '튜토리얼', '가이드', '읽을거리', '아티클', '인사이트', '요약'] },
  { name: '일·업무', icon: 'briefcase', tone: 1, aliases: ['일', '업무', '회사', '커리어', '프로젝트'],
    hosts: ['notion.so', 'slack.com', 'docs.google', 'figma.com', 'github.com', 'atlassian', 'jira', 'linkedin', 'wanted.co.kr', 'saramin', 'jobkorea', 'remember.co.kr'],
    words: ['회의', '미팅', '업무', '프로젝트', '보고서', '마감', '기획안', '제안서', '회사', '고객', '계약', '채용', '이력서', '면접', '출장', '거래처', '발표'] },
  { name: '영상·음악', icon: 'play', tone: 4, aliases: ['영상', '음악', '영화', '드라마', '유튜브'],
    hosts: ['youtube.com', 'youtu.be', 'netflix', 'tving', 'wavve', 'coupangplay', 'disneyplus', 'watcha', 'spotify', 'melon', 'genie.co', 'vibe.naver', 'soundcloud', 'music.apple', 'chzzk', 'twitch', 'vimeo'],
    words: ['영상', '유튜브', '드라마', '영화', '예능', '음악', '노래', '플레이리스트', '앨범', '공연', '콘서트', '뮤직비디오', '다큐'] },
  { name: '건강·운동', icon: 'heart', tone: 1, aliases: ['건강', '운동', '헬스', '다이어트'],
    hosts: ['hidoc', 'goodoc'],
    words: ['운동', '헬스', '러닝', '요가', '필라테스', '다이어트', '식단', '병원', '약국', '건강', '수면', '스트레칭', '칼로리', '근력', '단백질', '검진'] },
  { name: '돈·재테크', icon: 'coin', tone: 2, aliases: ['돈', '재테크', '투자', '가계부', '경제'],
    hosts: ['toss.im', 'kakaobank', 'upbit', 'bithumb', 'finance.naver', 'investing.com', 'banksalad'],
    words: ['주식', '투자', '적금', '예금', '대출', '보험', '연금', '세금', '연말정산', '부동산', '청약', '가계부', '환율', '코인', '배당', '월급', '재테크', 'etf'] },
  { name: '집·생활', icon: 'home', tone: 5, aliases: ['집', '생활', '살림', '인테리어', '반려동물', '육아'],
    hosts: ['ohou.se', 'todayhouse'],
    words: ['인테리어', '가구', '청소', '살림', '이사', '수납', '세탁', '관리비', '반려', '강아지', '고양이', '육아', '분리수거', '가전'] },
];

const lc = (s) => String(s ?? '').toLowerCase();
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const textOf = (meta, body) => [meta.title, meta.title, (meta.tags ?? []).join(' '), meta.summary, meta.thought, meta.author, body].filter(Boolean).join('\n');

// 이미 있는 분류(Claude·내가 정한 것)에서 낱말을 배운다: 서랍마다 어떤 낱말이 자주 나오는지
export function learn(notes) {
  const cats = new Map();
  const df = new Map();
  for (const n of notes) {
    const cat = topOf(n.meta.category);
    if (!cat || n.meta.status !== 'organized') continue;
    const words = new Set(tokenize(textOf(n.meta, n.body ?? n.snippet)));
    const host = hostOf(n.meta.source);
    if (host) words.add(`@${host}`);
    if (!cats.has(cat)) cats.set(cat, { n: 0, words: new Map() });
    const c = cats.get(cat);
    c.n++;
    for (const w of words) c.words.set(w, (c.words.get(w) ?? 0) + 1);
  }
  for (const c of cats.values()) for (const w of c.words.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  return { cats, df, names: [...cats.keys()] };
}

export const topOf = (category) => String(category ?? '').split('/').map((s) => s.trim()).filter(Boolean)[0] ?? '';

// 기본 서랍 이름을 이미 있는 폴더 이름에 맞춘다 (「패션·뷰티」 대신 원래 쓰던 「패션」)
export function resolveName(def, existing) {
  const hit = existing.find((name) => name === def.name || def.aliases.includes(name));
  return hit ?? def.name;
}

// { category, why, score }
export function classify({ meta = {}, body = '' }, model = null) {
  const text = lc(textOf(meta, body));
  const host = hostOf(meta.source);
  const existing = model?.names ?? [];
  const scores = new Map();
  const whys = new Map();
  const add = (name, s, why) => {
    scores.set(name, (scores.get(name) ?? 0) + s);
    if (why && !whys.has(name)) whys.set(name, why);
  };

  // 1) 사이트 2) 낱말
  for (const def of CATEGORIES) {
    const name = resolveName(def, existing);
    if (host && def.hosts.some((h) => host.includes(h))) add(name, 4, `${host} 링크`);
    let hits = 0;
    for (const w of def.words) {
      if (text.includes(w)) { hits++; if (hits === 1) add(name, 0, `“${w}”`); }
    }
    if (hits) add(name, Math.min(hits, 4) * 1.2);
  }
  // 3) 내가 정리해 둔 노트에서 배운 것
  if (model?.cats?.size) {
    const words = new Set(tokenize(textOf(meta, body)));
    if (host) words.add(`@${host}`);
    const C = model.cats.size;
    for (const [name, c] of model.cats) {
      let s = 0;
      for (const w of words) {
        const k = c.words.get(w);
        if (k) s += (k / c.n) * Math.log(1 + C / model.df.get(w));
      }
      // 노트가 몇 개 안 되는 서랍은 덜 믿는다 (흔한 낱말 하나로 끌려가지 않게)
      if (s > 0) add(name, Math.min(s * 2 * Math.min(1, c.n / 4), 5), '비슷한 노트가 있는 서랍');
    }
  }
  let best = null;
  for (const [name, s] of scores) if (!best || s > best.score) best = { category: name, score: s };
  if (!best || best.score < 1.2) return { category: OTHER, why: '', score: 0 };
  return { ...best, why: whys.get(best.category) ?? '' };
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
