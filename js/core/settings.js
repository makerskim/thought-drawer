// 기기 사이에 함께 쓰는 설정: 드라이브 「메모/_시스템/settings.json」에 둔다 (폰에서 만든 키워드를 PC에서도).
// 밝기·글꼴처럼 이 기기에만 쓰는 값은 여기 말고 브라우저(prefs)에 둔다.
import { keyOk } from './slash.js';

// 처음부터 들어 있는 명령어 중 글을 넣는 것 (예전 설정 파일에도 없으면 채워 준다)
export const BASE_KEYWORDS = [
  { key: '할일', text: '- [ ] ' },
  { key: '오늘', text: '{오늘}' },
  { key: '내일', text: '{내일}' },
  { key: '어제', text: '{어제}' },
  { key: '지금', text: '{지금}' },
];

export const DEFAULT_SETTINGS = {
  v: 2,
  classify: { subs: true, tags: 4, learn: true },
  rules: [],
  keywords: [
    ...BASE_KEYWORDS,
    { key: '회의', text: '회의 {오늘}\n- 참석: \n- 결정: \n- [ ] ' },
    { key: '장보기', text: '장보기 {오늘}\n- [ ] ' },
    { key: '읽을거리', text: '#읽을거리 ' },
    { key: '아이디어', text: '#아이디어 ' },
  ],
};

const clampInt = (v, lo, hi, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const tagList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\s]+/)).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 8);

export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const c = s.classify ?? {};
  const rules = (Array.isArray(s.rules) ? s.rules : [])
    .map((r) => ({ match: String(r?.match ?? '').trim(), drawer: String(r?.drawer ?? '').split('/').map((x) => x.trim()).filter(Boolean).slice(0, 2).join('/'), tags: tagList(r?.tags) }))
    .filter((r) => r.match && (r.drawer || r.tags.length))
    .slice(0, 200);
  const seen = new Set();
  let list = Array.isArray(s.keywords) ? s.keywords : DEFAULT_SETTINGS.keywords;
  // 예전(v1) 파일: 기본 명령어가 고칠 수 있는 내 명령어로 바뀌었으니, 없는 것만 앞에 채운다
  if (Array.isArray(s.keywords) && !(Number(s.v) >= 2)) list = [...BASE_KEYWORDS.filter((b) => !s.keywords.some((k) => String(k?.key ?? '').replace(/^\//, '') === b.key)), ...s.keywords];
  const keywords = list
    .map((k) => ({ key: String(k?.key ?? '').trim().replace(/^\//, ''), text: String(k?.text ?? '') }))
    .filter((k) => keyOk(k.key) && k.text && !seen.has(k.key) && seen.add(k.key))
    .slice(0, 200);
  return {
    v: 2,
    classify: { subs: c.subs !== false, tags: clampInt(c.tags, 0, 8, 4), learn: c.learn !== false },
    rules,
    keywords,
  };
}
