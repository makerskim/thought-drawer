// / 명령어와 # 태그, @ 서랍 (노션·옵시디언처럼).
// - 넣는 칸·가운데 입력창·노트 편집기에서 / 를 치고 낱말을 적으면 목록이 뜨고, 고르면 바로 바뀐다.
// - 내 키워드(설정 → / 명령어)는 「/회의」 → 정해 둔 글처럼 글을 통째로 넣는다. {오늘} {지금} 같은 값은 그때 날짜로 바뀐다.
// - 넣을 때 글 속 #태그 는 태그로, @서랍 은 그 서랍으로 보낸다(글에서는 뺀다).

// 바꿀 수 없는 기본 동작 (글을 넣는 게 아니라 무언가를 한다)
export const BUILTINS = [
  { key: '태그', alias: ['tag', '#'], label: '태그 달기', icon: 'tag', insert: '#', desc: '# 다음에 태그 이름' },
  { key: '서랍', alias: ['drawer', '폴더', '@'], label: '서랍 정하기', icon: 'folder', insert: '@', desc: '@ 다음에 서랍 이름' },
  { key: '사진', alias: ['photo', '캡처', '스크린샷'], label: '사진·스크린샷', icon: 'capture', action: 'photo' },
  { key: '붙여넣기', alias: ['paste'], label: '붙여넣기', icon: 'paste', action: 'paste' },
  { key: '크게', alias: ['편집기', '길게', '새노트'], label: '크게 쓰기', icon: 'pen', action: 'big', desc: '편집기에서 이어 쓰기' },
];
// 처음부터 들어 있는 명령어(설정 → 내 명령어에서 고치거나 지울 수 있다)의 다른 이름과 설명
export const ALIASES = { 할일: ['todo', '체크', '할 일', 'ㅎㅇ'], 오늘: ['today', '날짜'], 내일: ['tomorrow'], 어제: ['yesterday'], 지금: ['now', '시간', '시각'] };
export const LABELS = { 할일: '체크 상자', 오늘: '오늘 날짜', 내일: '내일 날짜', 어제: '어제 날짜', 지금: '지금 시각' };
// 줄 맨 앞에 와야 하는 글(할 일, 목록, 제목)은 줄 중간에서 부르면 새 줄로
export const isLine = (text) => /^(\n|- \[[ xX]\] |[-*] |\d+\. |#{1,3} )/.test(String(text ?? ''));

export const VARS = [['{오늘}', '오늘 날짜'], ['{내일}', '내일 날짜'], ['{어제}', '어제 날짜'], ['{지금}', '지금 시각'], ['{요일}', '오늘 요일']];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function fillVars(text, now = new Date()) {
  return String(text ?? '')
    .replace(/\{(오늘|날짜)\}/g, ymd(now))
    .replace(/\{내일\}/g, ymd(shift(now, 1)))
    .replace(/\{어제\}/g, ymd(shift(now, -1)))
    .replace(/\{지금\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replace(/\{요일\}/g, `${DAYS[now.getDay()]}요일`);
}

// 키워드 이름 규칙: 띄어쓰기·/·#·@ 없이 1~16자
export const keyOk = (k) => /^[^\s/#@]{1,16}$/.test(String(k ?? ''));

// 맞는 순서: 이름이 같음 → 이름으로 시작 → 다른 이름으로 시작 → 설명에 들어 있음
export function matchSlash(query, items) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return items;
  const rank = (it) => {
    const key = String(it.key).toLowerCase();
    const alias = (it.alias ?? []).map((a) => a.toLowerCase());
    if (key === q) return 0;
    if (key.startsWith(q)) return 1;
    if (alias.some((a) => a.startsWith(q))) return 2;
    if (String(it.label ?? '').toLowerCase().includes(q) || key.includes(q)) return 3;
    return 9;
  };
  return items.map((it, i) => [it, rank(it), i]).filter(([, r]) => r < 9).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([it]) => it);
}

// 커서 앞의 /낱말, #낱말, @낱말 (줄 처음이나 띄어쓰기 뒤에서만)
export function triggerAt(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const m = /(^|\s)([/#@])([^\s/#@]{0,24})$/.exec(before);
  if (!m) return null;
  return { char: m[2], query: m[3], start: caret - m[3].length - 1, end: caret };
}

// 고른 것을 글에 넣는다 → { text, caret }
export function applyInsert(text, trig, insert, { line = false, now } = {}) {
  let ins = fillVars(insert, now);
  let head = text.slice(0, trig.start);
  const tail = text.slice(trig.end);
  // 줄 단위(할 일)는 줄 중간이면 새 줄로
  if (line && head && !head.endsWith('\n')) { head = head.replace(/[ \t]+$/, ''); ins = `\n${ins}`; }
  const next = head + ins + tail;
  return { text: next, caret: head.length + ins.length };
}

const TAG = /(^|\s)#([^\s#@,.!?()[\]{}"'`<>]*[^\s#@,.!?()[\]{}"'`<>\d][^\s#@,.!?()[\]{}"'`<>]*)/g;
const AT = /(^|\s)@([^\s#@,!?()[\]{}"'`<>]+)/g;

// 넣기 전: #태그·@서랍 을 떼어 내고 남은 글 → { text, tags, drawer }
// drawers: 서랍으로 받아 줄 이름(이미 있는 서랍, 기본 서랍). 그 밖의 @ 는 사람 이름(@nike)일 수 있어서 그대로 둔다.
export function takeTokens(text, { drawers = [], allow = [] } = {}) {
  const known = new Map([...drawers, ...allow].map((d) => [String(d).toLowerCase(), String(d)]));
  const tags = [];
  let drawer = '';
  let out = String(text ?? '').replace(AT, (all, sp, name) => {
    const hit = known.get(name.toLowerCase());
    if (!hit) return all;
    if (!drawer) drawer = hit;
    return sp;
  });
  // 주소 안의 #(https://a.com/#x)는 앞이 띄어쓰기가 아니라서 걸리지 않는다
  out = out.replace(TAG, (all, sp, name) => { if (!tags.includes(name)) tags.push(name); return sp; });
  out = out.split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, '')).join('\n').replace(/^\s+|\s+$/g, '');
  return { text: out, tags, drawer };
}
