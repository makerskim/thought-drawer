// 아이폰 단축어·안드로이드 공유·브라우저 단추가 앱을 연 주소(?text=… / ?paste=1 / ?title=&text=&url=)를 받기 화면 주소로 바꾼다.
// 아이폰 단축어 「메모로 보내기」는 URL 인코딩 없이 `…/?text=[단축어 입력]` 으로 보내도 되게, ?text= 뒤를 통째로 읽는다
// (공유한 주소 속의 & 와 # 도 살린다). 단축어가 잘못 만들어졌으면 무엇이 문제인지 알려 줄 수 있게 이유(oops)를 붙인다.

const VAR_NAMES = /^(단축어\s?입력|URL\s?인코딩된\s?텍스트|Shortcut\s?Input|URL\s?Encoded\s?Text|Provided\s?Input|제공된\s?입력)$/i;
const IMAGE_NAME = /^[^\s/]+\.(png|jpe?g|heic|heif|gif|webp)$/i;

// 아이폰 단축어 「메모로 보내기」(Base64 방식): 공유한 글을 Base64로 바꿔 #t= 뒤에 싣는다.
// 글 속 주소(https://…)가 그대로 있으면 아이폰이 주소를 둘로 읽어 탭이 두 개 열리고 앱은 빈 내용을 받아서, 주소처럼 보이는 글자가 없게 한다.
export function textFromBase64(raw) {
  let s = String(raw ?? '');
  if (/%[0-9a-f]{2}/i.test(s)) { try { s = decodeURIComponent(s); } catch { /* 그대로 */ } }
  const b = s.replace(/[\r\n\t]/g, '').replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!b || /[^A-Za-z0-9+/]/.test(b)) return s; // Base64 가 아니면(단축어 입력을 바로 넣었으면) 글 그대로
  try {
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return s; }
}

// 받은 글 → 받기 화면 주소 (비었거나 단축어를 잘못 만들었으면 이유를 붙인다)
function textTarget(text) {
  text = String(text ?? '').trim();
  if (!text) return '#/share?oops=empty';
  if (VAR_NAMES.test(text)) return '#/share?oops=var';
  if (IMAGE_NAME.test(text)) return '#/share?oops=photo';
  return `#/share?text=${encodeURIComponent(text)}`;
}

// search: location.search ('?text=…'), hash: location.hash → 받기 화면 주소 '#/share?…' / '#/paste', 해당 없으면 ''
export function shareTarget(search = '', hash = '') {
  if (String(hash).startsWith('#t=')) return textTarget(textFromBase64(hash.slice(3)));
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
  return textTarget(text);
}

// 받기 화면이 보여 줄 안내 (단축어가 잘못 만들어졌을 때)
export const SHORTCUT_OOPS = {
  empty: '단축어가 보낸 내용이 비어 있어요. ① URL 칸에서 「?text=」와 파란 덩어리 사이에 줄 바꿈이 있으면 아이폰이 그 앞까지만 열어요. 파란 덩어리 바로 앞을 눌러 ⌫ 로 줄 바꿈을 지워 「?text=」 뒤에 같은 줄로 붙여 주세요. ② 파란 덩어리(「URL 인코딩됨」)가 아예 없으면 넣어 주세요. ③ 메모 앱 글이면 글을 길게 눌러 고른 뒤 공유해 보세요.',
  var: '단축어의 URL 칸에 「단축어 입력」이 글자로 들어갔어요. 그 글자를 지우고, 키보드 바로 위 줄에 뜨는 「단축어 입력」을 눌러 파란 덩어리로 넣어 주세요.',
  photo: '사진은 「사진 보내기」 단축어로 보내 주세요. 「메모로 보내기」는 링크·글용이에요.',
};

// ---------- 아이폰 단축어 「사진 보내기」: 사진을 Base64 글자로 바꿔 주소 #img= 뒤에 실어 보낸다 (붙여넣기 없이) ----------
// 주소의 # 뒤는 서버로 가지 않아 길어도 된다. 앱은 열리자마자 그 글자를 이 탭의 sessionStorage 로 옮기고 주소를 #/share?img=1 로 바꾼다.
export const SHARE_IMG = 'td.shareImg';
export const SHARE_IMG_LEN = 'td.shareImgLen'; // 주소로 받은 글자 수 (저장하지 못했을 때 원인을 찾으려고)

const sniff = (b) => {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'image/heic';
  return '';
};

// Base64 글자 → { bytes, type } (사진이 아니면 null). 줄 바꿈, %인코딩, URL용 Base64(-_), data: 머리말도 받는다.
export function imageFromBase64(raw) {
  let s = String(raw ?? '');
  if (/%[0-9a-f]{2}/i.test(s)) { try { s = decodeURIComponent(s); } catch { /* 그대로 */ } }
  s = s.replace(/^data:[^,]*,/, '').replace(/[\r\n\t]/g, '').replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (s.length < 16 || /[^A-Za-z0-9+/]/.test(s)) return null;
  s += '='.repeat((4 - (s.length % 4)) % 4);
  let bin;
  try { bin = atob(s); } catch { return null; }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const type = sniff(bytes);
  return type ? { bytes, type } : null;
}

SHORTCUT_OOPS.img = '사진을 받지 못했어요. 「사진 보내기」 단축어의 URL 칸이 「…/#img=」 바로 뒤에 파란 「URL 인코딩됨」(또는 「Base64로 인코딩됨」)인지 확인해 주세요. 안 되면 붙여넣기 방식으로 바꿔 쓸 수 있어요.';

// 사진을 받지 못했을 때: 실제로 받은 것(글자 수·앞부분)으로 고칠 곳을 짚는다
// raw: 이 탭에 옮겨 둔 글자(못 옮겼으면 null), arrived: 주소로 온 글자 수
export function photoTrouble(raw, arrived = 0) {
  const n = Number(arrived) || (raw ? raw.length : 0);
  if (!n) return '단축어가 사진 글자를 보내지 않았어요(받은 글자 0자). ① URL 칸에서 「#img=」와 파란 덩어리 사이에 줄 바꿈이 있으면 그 앞까지만 열려요. 파란 덩어리 바로 앞을 눌러 ⌫ 로 지워 같은 줄로 붙여 주세요. ② 「base64로 … 인코딩」 상자의 칸이 회색 「입력」이면 비어 있는 거예요. 눌러서 「변환된 이미지」를 골라 주세요. ③ 그래도 0자면 「이미지 크기 변경」의 640을 400으로 줄여 보세요.';
  if (raw == null) return `사진 글자 ${n.toLocaleString()}자를 받았지만 너무 커서 담지 못했어요. 「이미지 크기 변경」의 640을 400으로 줄여 보세요.`;
  let text = raw;
  try { text = decodeURIComponent(raw); } catch { /* 그대로 */ }
  const head = text.replace(/\s+/g, ' ').slice(0, 24);
  if (n < 300 || /\.(png|jpe?g|heic|heif|gif|webp)$/i.test(text.trim())) {
    return `사진 대신 「${head}」(${n.toLocaleString()}자)이(가) 왔어요. 「URL 인코딩」 상자가 「Base64로 인코딩됨」을 받는지(「단축어 입력」이 아니라), URL 칸 끝이 파란 「URL 인코딩됨」인지 확인해 주세요.`;
  }
  return `사진 글자 ${n.toLocaleString()}자를 받았지만 사진으로 읽지 못했어요(앞부분 「${head}」). 「이미지 변환」이 JPEG인지, 「Base64 인코딩」의 파란 「인코딩」이 「디코딩」으로 바뀌지 않았는지 확인해 주세요.`;
}
