// 자동 분류: 넣는 즉시 노트를 서랍(분류)과 세부 서랍에 나누고, 태그를 단다. 기기 안에서 돌아서 돈도 설정도 필요 없다.
// 1) 내가 만든 분류 규칙, 2) 사이트 주소(쿠팡이면 쇼핑), 3) 글 속 낱말, 4) 내가 직접 옮긴 노트에서 배운 것.
// 넷을 더해 가장 높은 서랍을 고르고, 그 안에서 같은 방법으로 세부 서랍을 고른다. 어디에도 안 맞으면 「기타」.
// 왜 그렇게 골랐는지와 자동 태그도 함께 돌려준다.
import { tokenize } from './search.js';

export const OTHER = '기타';

// 기본 서랍과 세부 서랍. aliases 는 이미 있는 폴더 이름과 맞출 때 쓴다 (예: 「패션」 폴더가 있으면 그 이름을 쓴다).
// words 앞 표시: ~ 분류에만 쓰고 태그로는 안 다는 말(「사고 싶」), - 흔한 말이라 약하게(「주문」「쿠폰」), + 그 글의 성격을 정하는 말이라 세게(「아이디어」「일기」).
// 사이트의 한국어 이름(무신사, 배민…)은 글에 나와도 그 사이트 링크처럼 센 신호로 친다 (아래 BRANDS).
export const CATEGORIES = [
  { name: '쇼핑', icon: 'bag', tone: 4, aliases: ['쇼핑', '위시', '위시리스트', '살 것', '구매'],
    hosts: ['coupang', '11st', 'gmarket', 'auction.co', 'ssg.com', 'lotteon', 'amazon', 'aliexpress', 'ebay', 'temu', 'smartstore.naver', 'shopping.naver', 'brand.naver', 'idus', 'enuri', 'tmon', 'wemakeprice', 'costco', 'emart'],
    words: ['쇼핑', '-구매', '~사고 싶', '살 것', '장바구니', '최저가', '-할인', '-세일', '-쿠폰', '-주문', '-배송', '택배', '반품', '환불', '교환 신청', '-특가', '시즌오프', '-가성비', '-품절', '직구', '언박싱'],
    subs: [
      { name: '가전', aliases: ['전자제품', '디지털', '가전제품'], hosts: ['danawa', 'apple.com', 'samsung.com', 'lge.co.kr', 'himart'],
        words: ['가전', '노트북', '휴대폰', '아이폰', '갤럭시', '이어폰', '헤드폰', '에어팟', '모니터', '키보드', '마우스', '태블릿', '아이패드', '청소기', '가습기', '제습기', '공기청정기', '냉장고', '세탁기', '건조기', '에어컨', '선풍기', '카메라', '충전기', '스마트워치', '전기포트', '전기 포트', '밥솥', '전자레인지', '식기세척기', '드라이기', '정수기', '로봇청소기', '빔프로젝터', '커피머신', 'iphone', 'ipad', 'macbook', '맥북', 'galaxy', 'airpods', '에어팟 맥스', 'tv'] },
      { name: '생활용품', aliases: ['생필품', '생활'], hosts: ['daiso'], words: ['세제', '휴지', '물티슈', '생필품', '주방용품', '수건', '칫솔', '샴푸', '다이소'] },
      { name: '식품', aliases: ['먹거리', '장보기'], hosts: ['kurly'], words: ['식품', '간식', '과일', '고기', '쌀', '생수', '견과', '장보기', '마켓컬리', '컬리'] },
      { name: '선물', words: ['선물', '생일 선물', '기념일', '답례', '집들이 선물', '어버이날'] },
      { name: '위시리스트', aliases: ['위시', '사고 싶은 것'], words: ['위시', '~사고 싶', '~갖고 싶', '찜'] },
    ] },
  { name: '패션·뷰티', icon: 'shirt', tone: 3, aliases: ['패션', '뷰티', '옷', '코디', '스타일', '화장품'],
    hosts: ['musinsa', '29cm', 'wconcept', 'zigzag', 'a-bly', 'ably', 'kream', 'uniqlo', 'zara', 'cos.com', 'hm.com', 'nike', 'adidas'],
    words: ['패션', '코디', '스타일', '룩북', '사이즈'],
    subs: [
      { name: '옷', aliases: ['의류', '상의', '하의'], words: ['셔츠', '바지', '청바지', '슬랙스', '니트', '가디건', '코트', '자켓', '재킷', '패딩', '원피스', '티셔츠', '맨투맨', '후드', '스커트', '코디', '출근룩', '데일리룩'] },
      { name: '신발·가방', aliases: ['신발', '가방'], words: ['스니커즈', '신발', '운동화', '구두', '부츠', '샌들', '로퍼', '가방', '백팩', '토트백', '지갑'] },
      { name: '뷰티', aliases: ['화장품', '스킨케어'], hosts: ['oliveyoung', 'hwahae'], words: ['화장품', '스킨케어', '선크림', '립스틱', '쿠션', '파운데이션', '향수', '네일', '피부', '올리브영', '뷰티', '헤어스타일', '미용실'] },
      { name: '액세서리', aliases: ['잡화'], words: ['시계', '반지', '목걸이', '귀걸이', '팔찌', '안경', '선글라스', '볼캡', '비니'] },
    ] },
  { name: '요리·맛집', icon: 'cook', tone: 2, aliases: ['요리', '맛집', '레시피', '음식', '카페', '먹거리'],
    hosts: ['recipe'],
    words: ['요리', '음식', '메뉴', '~먹고', '~먹을', '밀키트'],
    subs: [
      { name: '레시피', aliases: ['요리'], hosts: ['10000recipe'], words: ['레시피', '재료', '만드는 법', '볶음', '찌개', '파스타', '반찬', '양념', '에어프라이어', '베이킹', '국수', '전골', '샐러드 만들기'] },
      { name: '맛집', aliases: ['식당'], hosts: ['mangoplate', 'diningcode', 'catchtable'], words: ['맛집', '식당', '오마카세', '웨이팅', '예약 필수', '노포', '술집', '이자카야'] },
      { name: '카페', aliases: ['카페·디저트', '디저트'], words: ['카페', '커피', '디저트', '빵집', '베이커리', '케이크', '브런치', '라떼'] },
      { name: '배달', hosts: ['baemin', 'yogiyo', 'coupangeats'], words: ['배달', '포장 주문', '배민'] },
    ] },
  { name: '여행', icon: 'plane', tone: 5, aliases: ['여행', '숙소', '캠핑', '나들이'],
    hosts: ['expedia', 'trip.com', 'myrealtrip', 'tripadvisor', 'klook', 'visitkorea'],
    words: ['여행', '관광', '휴가', '투어', '여행 코스', '가볼 만한'],
    subs: [
      { name: '국내', aliases: ['국내여행'], words: ['제주', '부산', '강릉', '경주', '여수', '속초', '전주', '통영', '남해', '양양', '가평', '국내'] },
      { name: '해외', aliases: ['해외여행'], words: ['도쿄', '오사카', '교토', '후쿠오카', '삿포로', '방콕', '다낭', '나트랑', '타이베이', '대만', '싱가포르', '발리', '하와이', '괌', '파리', '런던', '뉴욕', '유럽', '해외', '환전'] },
      { name: '숙소', aliases: ['호텔'], hosts: ['airbnb', 'agoda', 'booking.com', 'yanolja', 'goodchoice', 'yeogi', 'hotels.com'], words: ['숙소', '호텔', '리조트', '펜션', '게스트하우스', '에어비앤비', '료칸'] },
      { name: '교통', aliases: ['항공', '항공·교통'], hosts: ['skyscanner', 'koreanair', 'flyasiana', 'jejuair', 'letskorail', 'srt'], words: ['항공', '항공권', '비행기', '기차', '기차표', '+ktx', '+srt', '렌터카', '공항', '고속버스', '기차 예매'] },
      { name: '캠핑', words: ['캠핑', '글램핑', '차박', '텐트'] },
    ] },
  { name: '공부·자료', icon: 'book', tone: 0, aliases: ['공부', '자료', '책', '독서', '메모법', '학습', '스터디'],
    hosts: ['wikipedia', 'namu.wiki', 'scholar.google', 'arxiv'],
    words: ['공부', '자료', '개념', '~배우', '시험', '메모법', '제텔카스텐', '튜토리얼', '가이드', '정리본', '논문', '요약'],
    subs: [
      { name: '책', aliases: ['독서'], hosts: ['yes24', 'kyobobook', 'aladin', 'ridibooks', 'millie'], words: ['책', '독서', '도서', '저자', '출판', '밑줄', '서평', '전자책', '신간'] },
      { name: '강의', aliases: ['수업', '인강'], hosts: ['coursera', 'udemy', 'inflearn', 'class101', 'khanacademy', 'ted.com'], words: ['강의', '수업', '인강', '클래스', '강좌', '세미나', '웨비나'] },
      { name: '외국어', aliases: ['영어', '어학'], words: ['영어', '일본어', '중국어', '스페인어', '단어장', '회화', '토익', '토플', '오픽', '발음'] },
      { name: 'IT', aliases: ['개발', '코딩', 'IT·개발'], hosts: ['velog', 'stackoverflow', 'developer.mozilla'], words: ['코딩', '개발', '프로그래밍', '파이썬', '자바스크립트', 'ai', '인공지능', '클로드', 'chatgpt', '프롬프트', '노코드'] },
      { name: '아티클', aliases: ['읽을거리', '칼럼'], hosts: ['brunch.co.kr', 'medium.com', 'substack', 'publy', 'careerly'], words: ['아티클', '칼럼', '인사이트', '뉴스레터', '기사', '읽을거리', '에세이'] },
    ] },
  { name: '일·업무', icon: 'briefcase', tone: 1, aliases: ['일', '업무', '회사', '커리어', '프로젝트'],
    hosts: ['atlassian', 'jira'],
    words: ['업무', '회사', '고객', '-계약', '출장', '거래처', '발표', '팀장', '동료', '야근', '수당', '연차', '출근', '퇴근', '보고', '계약서', '검토', '결재', '품의', '인수인계'],
    subs: [
      { name: '회의', aliases: ['미팅'], words: ['회의', '미팅', '회의록', '안건', '논의', '결정 사항', '액션 아이템'] },
      { name: '프로젝트', aliases: ['기획'], words: ['프로젝트', '기획안', '제안서', '보고서', '마감', '일정표', '로드맵', '킥오프', '런칭'] },
      { name: '커리어', aliases: ['이직', '취업'], hosts: ['linkedin', 'wanted.co.kr', 'saramin', 'jobkorea', 'remember.co.kr'], words: ['채용', '이력서', '면접', '포트폴리오', '이직', '연봉', '자기소개서', '경력'] },
      { name: '도구', aliases: ['툴', '템플릿'], hosts: ['notion.so', 'slack.com', 'docs.google', 'figma.com', 'github.com', 'miro.com'], words: ['노션', '슬랙', '피그마', '엑셀', '스프레드시트', '템플릿', '단축키', '자동화'] },
    ] },
  { name: '영상·음악', icon: 'play', tone: 4, aliases: ['영상', '음악', '영화', '드라마', '유튜브'],
    hosts: [],
    words: ['볼 것', '들을 것', '추천작'],
    subs: [
      { name: '영상', aliases: ['유튜브'], hosts: ['youtube.com', 'youtu.be', 'vimeo', 'chzzk', 'twitch', 'tiktok'], words: ['영상', '유튜브', '브이로그', '쇼츠', '릴스', '라이브'] },
      { name: '영화·드라마', aliases: ['영화', '드라마'], hosts: ['netflix', 'tving', 'wavve', 'coupangplay', 'disneyplus', 'watcha'], words: ['영화', '드라마', '예능', '다큐', '시즌', '넷플릭스', '애니'] },
      { name: '음악', aliases: ['노래'], hosts: ['spotify', 'melon', 'genie.co', 'vibe.naver', 'soundcloud', 'music.apple'], words: ['음악', '노래', '플레이리스트', '앨범', '뮤직비디오', '가사', '피아노', '음원', 'top100', '멜론 차트'] },
      { name: '공연·전시', aliases: ['공연', '전시'], hosts: ['ticket.interpark', 'ticketlink', 'yes24.com/ticket'], words: ['공연', '콘서트', '뮤지컬', '연극', '전시', '페스티벌', '티켓팅'] },
    ] },
  { name: '건강·운동', icon: 'heart', tone: 1, aliases: ['건강', '운동', '헬스', '다이어트'],
    hosts: [],
    words: ['건강', '컨디션'],
    subs: [
      { name: '운동', aliases: ['헬스'], words: ['운동', '헬스', '러닝', '마라톤', '요가', '필라테스', '스트레칭', '근력', '홈트', '등산', '수영', '자전거', '스쿼트', '테니스', '테니스 코트', '골프', '배드민턴', '클라이밍', '볼링', '축구', '농구', '크로스핏', 'pt'] },
      { name: '식단', aliases: ['다이어트'], words: ['식단', '다이어트', '칼로리', '단백질', '닭가슴살', '간헐적 단식', '영양제', '카페인', '금주', '야식'] },
      { name: '병원', aliases: ['병원·약', '의료'], hosts: ['hidoc', 'goodoc'], words: ['병원', '약국', '처방', '검진', '진료', '치과', '피부과', '예방접종'] },
      { name: '마음', aliases: ['멘탈', '수면'], words: ['수면', '명상', '스트레스', '불면', '상담', '마음 챙김', '감사 일기'] },
    ] },
  { name: '돈·재테크', icon: 'coin', tone: 2, aliases: ['돈', '재테크', '투자', '가계부', '경제'],
    hosts: [],
    words: ['재테크', '경제', '환율', '금리', '송금', '이체', '입출금', '잔액'],
    subs: [
      { name: '투자', aliases: ['주식'], hosts: ['upbit', 'bithumb', 'finance.naver', 'investing.com', 'tradingview'], words: ['주식', '투자', 'etf', '배당', '코인', '펀드', '채권', '나스닥', '코스피'] },
      { name: '저축·대출', aliases: ['저축', '대출', '은행'], hosts: ['kakaobank', 'toss.im'], words: ['적금', '예금', '대출', '통장', '파킹통장', '청년도약'] },
      { name: '세금·보험', aliases: ['세금', '보험'], words: ['세금', '연말정산', '보험', '연금', '공제', '종합소득세', '실손'] },
      { name: '부동산', aliases: ['집'], words: ['부동산', '청약', '전세', '월세', '아파트', '매매', '임장', '확정일자', '등기', '잔금', '중개수수료', '전세 계약', '월세 계약'] },
      { name: '가계부', aliases: ['지출'], hosts: ['banksalad'], words: ['가계부', '지출', '월급', '고정비', '카드값', '용돈', '정산'] },
    ] },
  { name: '집·생활', icon: 'home', tone: 5, aliases: ['집', '생활', '살림', '인테리어', '반려동물', '육아'],
    hosts: [],
    words: ['동네', '자취'],
    subs: [
      { name: '인테리어', aliases: ['가구'], hosts: ['ohou.se', 'todayhouse', 'ikea'], words: ['인테리어', '가구', '조명', '수납', '커튼', '러그', '오늘의집', '이케아'] },
      { name: '살림', aliases: ['청소'], words: ['청소', '세탁', '살림', '분리수거', '관리비', '수리', '곰팡이', '정리정돈', '냉장고 정리', '옷장 정리', '대청소', '빨래'] },
      { name: '반려동물', aliases: ['반려', '강아지', '고양이'], words: ['반려', '강아지', '고양이', '사료', '산책', '동물병원', '츄르'] },
      { name: '육아', aliases: ['아이'], words: ['육아', '아기', '어린이집', '유치원', '이유식', '기저귀'] },
      { name: '이사', words: ['이사 준비', '포장이사', '집들이', '전입신고', '이삿짐'] },
      { name: '자동차', aliases: ['차', '차량'], words: ['자동차', '차량', '엔진오일', '타이어', '세차', '주유', '정비소', '블랙박스', '하이패스', '자동차보험', '주차', '중고차'] },
    ] },
  { name: '생각·기록', icon: 'thought', tone: 3, aliases: ['생각', '기록', '아이디어', '일기', '메모'],
    hosts: [],
    words: ['-생각', '-기록', '메모해 두기', '느낀 점', '생각이 든다', '생각해 보니', '깨달은'],
    subs: [
      { name: '아이디어', aliases: ['영감'], words: ['+아이디어', '글감', '영감', '떠오른'] },
      { name: '일기', aliases: ['회고', '하루'], words: ['+일기', '+회고', '오늘 하루', '하루 정리', '감정', '기분'] },
      { name: '목표', aliases: ['계획', '다짐'], words: ['목표', '다짐', '버킷리스트', '올해 계획', '습관 만들기', '새해'] },
      { name: '글귀', aliases: ['명언', '인용'], words: ['+명언', '글귀', '좋아하는 문장', '인용', '구절', '문장'] },
    ] },
];

// 다른 낱말 속에 들어 있어 잘못 걸리는 말: 먼저 차지해서 짧은 말(카페, 시계, 고기, 회의, 주식)이 걸리지 않게 한다
const BLOCKERS = ['토스트', '시계열', '고기압', '저기압', '회의적', '회의감', '주식회사', '네이버 카페', '다음 카페', '여행사 직원', '책임', '책상'];

// 사이트 → 태그로 다는 이름
export const SITES = {
  coupang: '쿠팡', '11st': '11번가', gmarket: 'G마켓', 'ssg.com': 'SSG', kurly: '컬리', amazon: '아마존', aliexpress: '알리', temu: '테무',
  'smartstore.naver': '스마트스토어', 'shopping.naver': '네이버쇼핑', danawa: '다나와', daiso: '다이소', musinsa: '무신사', '29cm': '29CM',
  wconcept: 'W컨셉', zigzag: '지그재그', ably: '에이블리', kream: '크림', oliveyoung: '올리브영', uniqlo: '유니클로', ikea: '이케아',
  '10000recipe': '만개의레시피', mangoplate: '망고플레이트', catchtable: '캐치테이블', baemin: '배민',
  airbnb: '에어비앤비', agoda: '아고다', 'booking.com': '부킹닷컴', yanolja: '야놀자', yeogi: '여기어때', goodchoice: '여기어때', skyscanner: '스카이스캐너', myrealtrip: '마이리얼트립', klook: '클룩',
  'youtube.com': '유튜브', 'youtu.be': '유튜브', netflix: '넷플릭스', tving: '티빙', wavve: '웨이브', disneyplus: '디즈니플러스', watcha: '왓챠', spotify: '스포티파이', melon: '멜론', tiktok: '틱톡', chzzk: '치지직',
  'instagram.com': '인스타그램', 'brunch.co.kr': '브런치', 'medium.com': '미디엄', velog: '벨로그', 'github.com': '깃허브', 'notion.so': '노션', 'figma.com': '피그마', linkedin: '링크드인',
  yes24: '예스24', kyobobook: '교보문고', aladin: '알라딘', ridibooks: '리디', millie: '밀리의서재', inflearn: '인프런', class101: '클래스101', udemy: '유데미',
  'ohou.se': '오늘의집', upbit: '업비트', toss: '토스', kakaobank: '카카오뱅크', 'namu.wiki': '나무위키', wikipedia: '위키백과',
};

const lc = (s) => String(s ?? '').toLowerCase();
export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const textOf = (meta, body) => [meta.title, meta.title, (meta.tags ?? []).join(' '), meta.summary, meta.thought, meta.author, body].filter(Boolean).join('\n');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ASCII = /^[a-z0-9 .+#-]+$/;

// 낱말 하나: 영어는 낱말 단위로(「ai」가 mail에 걸리지 않게), 한글은 들어 있기만 하면
const matchers = new Map();
function has(text, word) {
  let m = matchers.get(word);
  if (!m) {
    const w = lc(word.replace(/^~/, ''));
    // 한 글자 낱말(책, 쌀, 찜)은 다른 낱말 속(책임, 책상)에 걸리지 않게 앞뒤를 본다
    const re = ASCII.test(w) ? new RegExp(`(^|[^a-z0-9])${esc(w)}([^a-z0-9]|$)`)
      : /^[가-힣]$/.test(w) ? new RegExp(`(^|[^가-힣])${w}(?=$|[^가-힣]|[은는이가을를에도과와만으])`) : null;
    m = re ? ((t) => re.test(t)) : ((t) => t.includes(w));
    matchers.set(word, m);
  }
  return m(text);
}
const tagWord = (w) => !/^[~-]/.test(w) && !/\s/.test(w);
const norm = (w) => lc(w.replace(/^[~+\-!]/, ''));
const weight = (w) => (w[0] === '!' ? 4 : w[0] === '+' ? 3 : w[0] === '-' ? 0.8 : 1.2);
const plain = (w) => w.replace(/^[~+\-!]/, '');

// 글을 한 번 훑어 사전 낱말을 찾는다. 긴 낱말이 먼저 자리를 차지해서 「운동화」 속 「운동」, 「카페인」 속 「카페」는 세지 않는다.
let VOCAB = null;
const finders = new Map();
function finder(w) {
  let f = finders.get(w);
  if (!f) {
    const re = ASCII.test(w) ? new RegExp(`(^|[^a-z0-9])(${esc(w)})(?=[^a-z0-9]|$)`, 'g')
      : /^[가-힣]$/.test(w) ? new RegExp(`(^|[^가-힣])(${w})(?=$|[^가-힣]|[은는이가을를에도과와만으])`, 'g')
        : new RegExp(`()(${esc(w)})`, 'g');
    f = (t) => [...t.matchAll(re)].map((m) => m.index + m[1].length);
    finders.set(w, f);
  }
  return f;
}
export function scan(text) {
  VOCAB ??= [...new Set([...CATEGORIES.flatMap((d) => [...d.words, ...d.subs.flatMap((x) => x.words)]), ...BLOCKERS].map(norm))]
    .sort((a, b) => b.length - a.length);
  const used = new Uint8Array(text.length);
  const found = new Map(); // 낱말 → 처음 나온 자리
  for (const w of VOCAB) {
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
const siteHit = (host, list = []) => list.find((h) => host.includes(h));

export function siteName(host) {
  if (!host) return '';
  const k = Object.keys(SITES).find((s) => host.includes(s));
  return k ? SITES[k] : '';
}

// 사이트의 한국어 이름을 그 서랍·세부 서랍의 센 낱말로 (뜻이 여럿인 이름은 뺀다: 멜론=과일, 크림, 웨이브…)
const BRAND_SKIP = new Set(['멜론', '크림', '웨이브', '알리', '토스', '오늘의집', '여기어때', 'SSG']);
const brandsOf = (hosts = []) => [...new Set(hosts.flatMap((h) => Object.keys(SITES).filter((k) => h.includes(k) || k.includes(h)).map((k) => SITES[k])))]
  .filter((n) => !BRAND_SKIP.has(n)).map((n) => `!${n}`);
for (const d of CATEGORIES) {
  d.words = [...d.words, ...brandsOf(d.hosts)];
  for (const x of d.subs) x.words = [...x.words, ...brandsOf(x.hosts)];
}

// 서랍마다 세부 서랍의 사이트·낱말까지 합친 것 (점수를 매길 때 쓴다)
const ALL = new Map(CATEGORIES.map((d) => [d, {
  hosts: [...new Set([...d.hosts, ...d.subs.flatMap((s) => s.hosts ?? [])])],
  words: [...new Set([...d.words, ...d.subs.flatMap((s) => s.words)])],
}]));

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

// 규칙 한 줄: { match: '가습기, 제습기', drawer: '쇼핑/가전', tags: ['가전'] }
export function ruleWords(rule) {
  return String(rule?.match ?? '').split(/[,\n]/).map((s) => lc(s.trim())).filter(Boolean);
}

// opts: { subs: 세부 서랍까지(기본 켬), tags: 자동 태그 수(0이면 안 닮), rules: 내 분류 규칙 }
// → { category, sub, path, why, score, tags }
export function classify({ meta = {}, body = '' }, model = null, opts = {}) {
  const { subs: wantSubs = true, tags: maxTags = 4, rules = [] } = opts;
  const text = lc(textOf(meta, body));
  // 출처가 없어도 글 속 첫 주소의 사이트를 본다 (「청소기 비교 https://coupang.com/…」)
  const host = hostOf(meta.source) || hostOf(/https?:\/\/[^\s)\]>"']+/.exec(String(body ?? ''))?.[0]);
  const existing = model?.names ?? [];
  const scores = new Map();
  const whys = new Map();
  const forced = new Map(); // 규칙이 정한 세부 서랍
  const ruleTags = [];
  const add = (name, s, why) => {
    scores.set(name, (scores.get(name) ?? 0) + s);
    if (why && !whys.has(name)) whys.set(name, why);
  };

  const found = scan(text);
  const hit = (w) => found.has(norm(w));
  // 1) 내 분류 규칙이 가장 세다
  for (const r of rules) {
    const got = ruleWords(r).find((w) => has(text, w) || (host && host.includes(w)));
    if (!got) continue;
    const [top, sub] = parts(r.drawer);
    if (top) { add(top, 10, `내 규칙 “${got}”`); if (sub && !forced.has(top)) forced.set(top, sub); }
    for (const t of r.tags ?? []) ruleTags.push(String(t));
  }
  // 2) 사이트 3) 낱말
  for (const def of CATEGORIES) {
    const name = resolveName(def, existing);
    const all = ALL.get(def);
    if (host && siteHit(host, all.hosts)) add(name, 4, `${host} 링크`);
    let sum = 0;
    let best = null;
    for (const w of all.words) {
      if (!hit(w)) continue;
      sum += weight(w);
      if (!best || weight(w) > weight(best)) best = w;
    }
    if (sum) add(name, Math.min(sum, 6), `“${plain(best)}”`);
  }
  // 4) 내가 정리해 둔 노트에서 배운 것
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
  let best = null;
  for (const [name, s] of scores) if (!best || s > best.score) best = { category: name, score: s };
  if (!best || best.score < 1.2) {
    return { category: OTHER, sub: '', path: OTHER, why: '', score: 0, tags: pickTags({ text, found, host, top: OTHER, sub: '', ruleTags, model, maxTags }) };
  }
  const sub = wantSubs ? pickSub(best.category, { hit, host, model, words, forced, existing }) : '';
  const path = sub ? `${best.category}/${sub}` : best.category;
  return { ...best, sub, path, why: whys.get(best.category) ?? '', tags: pickTags({ text, found, host, top: best.category, sub, ruleTags, model, maxTags }) };
}

// 서랍 안에서 세부 서랍 고르기: 규칙 → 사이트 → 낱말 → 배운 것. 1.2점이 안 되면 세부 서랍 없이 둔다.
function pickSub(top, { hit, host, model, words, forced, existing }) {
  if (forced.has(top)) return forced.get(top);
  const def = CATEGORIES.find((d) => resolveName(d, existing) === top || d.name === top);
  const known = (model?.subPaths ?? []).filter((p) => topOf(p) === top).map((p) => parts(p)[1]);
  const scores = new Map();
  const add = (name, s) => scores.set(name, (scores.get(name) ?? 0) + s);
  for (const s of def?.subs ?? []) {
    // 이미 쓰는 세부 폴더 이름이 있으면 그 이름으로 (「가전」 대신 원래 쓰던 「전자제품」)
    const name = known.find((k) => k === s.name || (s.aliases ?? []).includes(k)) ?? s.name;
    if (host && siteHit(host, s.hosts)) add(name, 4);
    const sum = s.words.filter(hit).reduce((t, w) => t + weight(w), 0);
    if (sum) add(name, Math.min(sum, 6));
  }
  if (words && model?.subs?.size) {
    const mine = [...model.subs].filter(([p]) => topOf(p) === top);
    for (const [p, c] of mine) {
      let s = 0;
      for (const w of words) { const k = c.words.get(w); if (k) s += k / c.n; }
      if (s > 0) add(parts(p)[1], Math.min(s * 2 * Math.min(1, c.n / 3), 5));
    }
  }
  let best = null;
  for (const [name, s] of scores) if (!best || s > best.s) best = { name, s };
  return best && best.s >= 1.2 ? best.name : '';
}

// 자동 태그: 규칙의 태그 → 이미 쓰는 태그 중 글에 나온 것 → 사이트 이름 → 세부 서랍 낱말 → 서랍 낱말 → 다른 서랍 낱말
function pickTags({ text, found, host, top, sub, ruleTags, model, maxTags }) {
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
  const groups = [s?.words ?? [], def ? ALL.get(def).words : [], CATEGORIES.filter((d) => d !== def).flatMap((d) => d.subs.flatMap((x) => x.words))];
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

// 기본 서랍과 세부 서랍 이름 (설정, 사용법, 서랍 고르기에 보여 준다)
export const defaultTree = () => CATEGORIES.map((d) => ({ name: d.name, subs: d.subs.map((s) => s.name) }));
