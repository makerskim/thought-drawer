// 아이폰 단축어·안드로이드 공유·브라우저 단추가 앱을 연 주소(?text=… / ?paste=1 / ?title=&text=&url=)를 받기 화면 주소로 바꾼다.
// 아이폰 단축어 「메모로 보내기」는 URL 인코딩 없이 `…/?text=[단축어 입력]` 으로 보내도 되게, ?text= 뒤를 통째로 읽는다
// (공유한 주소 속의 & 와 # 도 살린다). 단축어가 잘못 만들어졌으면 무엇이 문제인지 알려 줄 수 있게 이유(oops)를 붙인다.

const VAR_NAMES = /^(단축어\s?입력|URL\s?인코딩된\s?텍스트|Shortcut\s?Input|URL\s?Encoded\s?Text|Provided\s?Input|제공된\s?입력)$/i;
const IMAGE_NAME = /^[^\s/]+\.(png|jpe?g|heic|heif|gif|webp)$/i;

// search: location.search ('?text=…'), hash: location.hash → 받기 화면 주소 '#/share?…' / '#/paste', 해당 없으면 ''
export function shareTarget(search = '', hash = '') {
  const q = new URLSearchParams(search);
  if (q.get('state') === 'td-code') return ''; // 정리기 토큰 받기에서 돌아온 경우
  if (q.has('paste')) return '#/paste';
  if (!q.has('url') && !q.has('text')) return '';
  // 안드로이드 공유·브라우저 단추: 제대로 인코딩된 여러 값
  if (q.has('url') || q.has('title') || q.has('via')) return `#/share?${q}`;
  // 아이폰 단축어: ?text= 뒤를 통째로 (인코딩했든 안 했든)
  const all = search.replace(/^\?/, '') + (hash || '');
  const raw = all.slice(all.indexOf('text=') + 5);
  let text = raw;
  try { text = decodeURIComponent(raw); } catch { /* 인코딩하지 않은 % 가 섞였으면 그대로 */ }
  text = text.trim();
  if (!text) return '#/share?oops=empty';
  if (VAR_NAMES.test(text)) return '#/share?oops=var';
  if (IMAGE_NAME.test(text)) return '#/share?oops=photo';
  return `#/share?text=${encodeURIComponent(text)}`;
}

// 받기 화면이 보여 줄 안내 (단축어가 잘못 만들어졌을 때)
export const SHORTCUT_OOPS = {
  empty: '단축어가 보낸 내용이 비어 있어요. 단축어의 URL 칸 끝, 「?text=」 바로 뒤에 파란 「단축어 입력」이 붙어 있는지 확인해 주세요.',
  var: '단축어의 URL 칸에 「단축어 입력」이 글자로 들어갔어요. 그 글자를 지우고, 키보드 바로 위 줄에 뜨는 「단축어 입력」을 눌러 파란 덩어리로 넣어 주세요.',
  photo: '사진은 「사진 보내기」 단축어로 보내 주세요. 「메모로 보내기」는 링크·글용이에요.',
};
