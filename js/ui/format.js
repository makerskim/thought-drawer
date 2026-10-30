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

const COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'yellow', 'red', 'brown', 'gray'];
function hash(s) {
  let x = 0;
  for (const c of String(s)) x = (x * 31 + c.codePointAt(0)) >>> 0;
  return x;
}
// 그래프의 폴더 색 (회색은 인박스 몫이라 뺀다)
export const folderColor = (s) => COLORS[hash(s) % (COLORS.length - 1)];
export const GRAPH_COLORS = {
  blue: '#4f7cff', green: '#22b38a', orange: '#ff9440', purple: '#8b6cff', teal: '#22a9c4',
  yellow: '#f2be2a', red: '#ff6b6b', brown: '#b8916f', gray: '#9aa3b5',
};

export const KIND_LABEL = { memo: '메모', capture: '사진', bookmark: '링크', instagram: '인스타' };

// 폴더와 태그 색 (여섯 가지 중 하나, 이름마다 늘 같다)
export const folderTone = (name) => hash(name) % 6;
export const tagTone = (name) => hash(name) % 6;

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';
