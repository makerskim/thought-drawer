// 날짜, 색 같은 표시 도우미
const pad = (n) => String(n).padStart(2, '0');

export function relTime(iso) {
  const t = Date.parse(iso ?? '');
  if (!t) return '';
  const d = new Date(t);
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (d.getFullYear() === today.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function fullDate(iso) {
  const t = Date.parse(iso ?? '');
  if (!t) return '';
  const d = new Date(t);
  const h = d.getHours();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(d.getMinutes())}`;
}

const COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'red', 'brown', 'gray'];
function hash(s) {
  let x = 0;
  for (const c of String(s)) x = (x * 31 + c.codePointAt(0)) >>> 0;
  return x;
}
// 그래프의 폴더 색 (회색은 인박스 몫이라 뺀다)
export const folderColor = (s) => COLORS[hash(s) % (COLORS.length - 1)];
export const GRAPH_COLORS = {
  blue: '#7aa7ff', green: '#5fcf9f', orange: '#ffad6b', purple: '#a68bff', pink: '#ff7fa8',
  yellow: '#f5c94a', red: '#ff8a80', brown: '#c9a58c', gray: '#b3abc7',
};

export const KIND_LABEL = { memo: '메모', capture: '사진', bookmark: '링크', instagram: '인스타' };
export const KIND_EMOJI = { memo: '📝', capture: '📸', bookmark: '🔗', instagram: '💗' };

// 폴더 이름에 어울리는 이모지. 모르는 이름은 이름마다 늘 같은 귀여운 이모지
const FOLDER_EMOJI = [
  [/패션|옷|코디|상의|하의|신발|가방|스타일/, '👗'], [/요리|레시피|음식|맛집|베이킹|디저트/, '🍳'],
  [/여행|제주|해외|숙소|캠핑/, '✈️'], [/공부|메모법|책|독서|강의|영어/, '📚'], [/쇼핑|위시|살 것|구매/, '🛍️'],
  [/카페|커피/, '☕'], [/운동|헬스|요가|러닝/, '💪'], [/일|업무|회사|커리어/, '💼'], [/영화|드라마|영상/, '🎬'],
  [/음악|노래|플리/, '🎵'], [/인테리어|집|살림|가구/, '🏠'], [/뷰티|화장|스킨/, '💄'], [/아이디어|생각|기획/, '💡'],
  [/돈|재테크|투자|가계/, '💰'], [/건강|병원|약/, '🍀'], [/육아|아기|아이/, '🧸'], [/강아지|고양이|반려/, '🐶'],
  [/사진|그림|디자인|아트/, '🎨'], [/확인/, '🔍'], [/선물|기념일|생일/, '🎁'], [/식물|꽃|가드닝/, '🌷'],
];
const CUTE = ['🍓', '🌷', '🍀', '🧸', '🌈', '🍋', '🫧', '🎀', '🌙', '🍒', '🐣', '🪴'];
export function emojiFor(folder) {
  const name = String(folder ?? '');
  if (!name) return '📥';
  const hit = FOLDER_EMOJI.find(([re]) => re.test(name));
  return hit ? hit[1] : CUTE[hash(name) % CUTE.length];
}

// 손으로 붙인 것처럼 카드마다 살짝 다른 기울기 (-1° ~ 1°)
export const tiltOf = (id) => `${((hash(id) % 21) - 10) / 10}deg`;
// 태그 색 (파스텔 여섯 가지 중 하나, 이름마다 늘 같다)
export const tagTone = (name) => hash(name) % 6;

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';
