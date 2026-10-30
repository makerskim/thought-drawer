// 세 앱에서 가져온 노트 습관: 오늘 노트(옵시디언), 템플릿(노션), 최근에 본 노트(에버노트)
import { app, prefs, toast } from './state.js';
import { go, noteHref } from './router.js';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
export const DAILY_FOLDER = '일기';
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const findDaily = (lib, key = todayKey()) => lib.all.find((n) => n.meta.daily === key);

// 오늘 노트: 하루에 한 장. 없으면 「일기」 폴더에 날짜 제목으로 만든다 (인박스를 거치지 않아 정리기가 손대지 않는다)
let making = null;
export async function openToday() {
  const key = todayKey();
  const have = findDaily(app.lib, key);
  if (have) { go(noteHref(have.id)); return; }
  if (!making) {
    const d = new Date();
    making = app.lib.create({
      type: 'memo', title: `${key} ${DAYS[d.getDay()]}요일`, body: TEMPLATES.find((t) => t.id === 'daily').body,
      daily: key, status: 'organized', category: DAILY_FOLDER,
    }).finally(() => { making = null; });
  }
  try { const n = await making; go(noteHref(n.id)); } catch (e) { toast(e.message); }
}

// 빈 새 노트에서 고르는 틀
export const TEMPLATES = [
  { id: 'todo', label: '할 일 목록', icon: 'check', title: '할 일', body: '- [ ] \n' },
  { id: 'meeting', label: '회의·통화', icon: 'ask', title: '', body: '## 누구와\n\n\n## 나눈 이야기\n- \n\n## 할 일\n- [ ] \n' },
  { id: 'book', label: '독서 노트', icon: 'memo', title: '', body: '## 책\n- 제목: \n- 지은이: \n\n## 밑줄\n> \n\n## 내 생각\n\n' },
  { id: 'trip', label: '여행 계획', icon: 'calendar', title: '', body: '## 일정\n- \n\n## 갈 곳\n- \n\n## 챙길 것\n- [ ] \n' },
  { id: 'idea', label: '아이디어', icon: 'thought', title: '', body: '## 무엇\n\n\n## 왜\n\n\n## 다음에 할 일\n- [ ] \n' },
  { id: 'daily', label: '오늘 노트', icon: 'calendar', title: '', body: '## 오늘 할 일\n- [ ] \n\n## 메모\n\n', hidden: true },
];

// 최근에 본 노트 (이 기기에만, 12개까지)
export function rememberSeen(id) {
  const list = prefs.get('recent', []).filter((x) => x !== id);
  prefs.set('recent', [id, ...list].slice(0, 12));
}
export const recentNotes = (lib, n = 8) => prefs.get('recent', []).map((id) => lib.get(id)).filter(Boolean).slice(0, n);
