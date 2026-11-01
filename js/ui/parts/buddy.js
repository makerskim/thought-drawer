// 어디서나 따라다니는 서랍이: 오른쪽 아래에 앉아 있다가 화면마다 한마디 하고, 넣거나 지우면 반응한다.
// 누르면 작은 메뉴(넣기 · 오늘 노트 · 사용법 · 한마디 · 숨기기). 첫 화면 위쪽에서는 넣는 칸의 서랍이가 대신 말한다.
// 설정 → 화면의 「서랍이 따라다님」으로 끄고, 「서랍이 말」로 말수를 정한다.
import { html, useState, useEffect, useRef, cx } from '../h.js';
import { Mascot } from '../icons.js';
import { app, useLib, usePref, useSpeech, toast } from '../state.js';
import { go } from '../router.js';
import { popover } from './layers.js';
import { MenuItem } from './common.js';
import { openComposer } from './composer.js';
import { openToday } from '../notebook.js';
import { drawerList } from '../categories.js';
import { openTasks } from '../../core/tasks.js';

const TIPS = [
  '/ 를 치면 명령어가 나와요. /오늘, /할일 처럼요.',
  '#태그, @서랍 을 적으면 그대로 정리해 드려요.',
  '생각 지도의 점선은 제가 찾은 비슷한 노트예요.',
  '사진은 그냥 붙여 넣으세요. 글자도 읽어 둘게요.',
  '키보드에서 H는 홈, D는 서랍, ?는 사용법이에요.',
  '노트에서 서랍을 바꿔 주면 다음엔 더 잘 나눠요.',
];
const heard = new Set(); // 이번에 한마디 한 화면 (같은 화면에서 되풀이하지 않는다)

// 화면마다 한마디
function lineFor(path, lib) {
  if (path === '/drawers') return ['서랍을 눌러 열어 보세요.', 'wave'];
  if (path === '/all') return ['필터로 원하는 노트만 골라 봐요.', 'smile'];
  if (path === '/graph') return ['점선은 제가 찾은 비슷한 노트예요.', 'wow'];
  if (path === '/settings') return ['저를 조용히 시키려면 「서랍이 말」이에요.', 'smile'];
  if (path === '/help') return ['궁금한 건 여기 다 있어요.', 'happy'];
  if (path === '/new') return ['길게 써 보세요. / 를 치면 명령어!', 'happy'];
  if (path === '/tasks') {
    const left = lib.all.reduce((s, n) => s + (n.body ? openTasks(n.body).length : 0), 0);
    return left ? [`할 일 ${left}개 남았어요. 같이 해치워요!`, 'happy'] : ['할 일을 다 했어요. 최고예요!', 'happy'];
  }
  const m = /^\/f\/(.+)$/.exec(path);
  if (m) {
    const name = decodeURIComponent(m[1]).split('/')[0];
    const d = drawerList(lib).find((x) => x.name === name);
    return d ? [`${name} 서랍이에요. 노트 ${d.count}개!`, 'smile'] : null;
  }
  return null;
}

export function Buddy({ path }) {
  const lib = useLib();
  const [follow, setFollow] = usePref('mascotFollow', true);
  const [talk] = usePref('mascotTalk', 'on');
  const said = useSpeech();
  const [bubble, setBubble] = useState(null);
  const [mood, setMood] = useState('smile');
  const [hop, setHop] = useState(0);
  const [heroOn, setHeroOn] = useState(true);
  const tips = useRef(0);
  const home = path === '/';
  // 첫 화면에서 넣는 칸이 보이는 동안은 숨는다 (그 서랍이가 대신 말한다)
  useEffect(() => {
    if (!home) return undefined;
    const box = document.querySelector('.capbar');
    if (!box || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setHeroOn(e.isIntersecting), { threshold: 0.2 });
    io.observe(box);
    return () => io.disconnect();
  }, [home, lib?.all.length]);
  const hidden = !follow || (home && heroOn) || (/^\/(n\/|new$)/.test(path) && window.matchMedia('(max-width: 860px)').matches);

  const speak = (text, m = 'smile', ms = 4500) => { setBubble({ text, until: Date.now() + ms }); setMood(m); };
  // 다른 곳에서 건넨 말 (넣었어요, 지웠어요 …)
  useEffect(() => { if (said && !hidden && talk !== 'off') { speak(said.text, said.mood, Math.max(2500, said.until - Date.now())); if (said.hop) setHop((h) => h + 1); } }, [said?.id]);
  // 화면이 바뀌면 그 화면 한마디 (화면마다 한 번)
  useEffect(() => {
    if (hidden || talk !== 'on' || heard.has(path)) return undefined;
    const line = lineFor(path, lib);
    if (!line) return undefined;
    heard.add(path);
    const t = setTimeout(() => { speak(line[0], line[1]); setHop((h) => h + 1); }, 600);
    return () => clearTimeout(t);
  }, [path, hidden]);
  useEffect(() => {
    if (!bubble) return undefined;
    const t = setTimeout(() => { setBubble(null); setMood('smile'); }, Math.max(0, bubble.until - Date.now()));
    return () => clearTimeout(t);
  }, [bubble]);
  if (hidden || !lib) return null;

  const menu = (anchor) => popover(anchor, (close) => html`
    <div class="mi-label">서랍이</div>
    <${MenuItem} icon="plus" label="넣기" sub="Enter" onClick=${() => { close(); if (!app.focusCapture?.()) openComposer(); }} />
    <${MenuItem} icon="calendar" label="오늘 노트" sub="T" onClick=${() => { close(); openToday(); }} />
    <${MenuItem} icon="help" label="사용법" sub="?" onClick=${() => { close(); go('#/help'); }} />
    <${MenuItem} icon="sparkle" label="한마디 듣기" onClick=${() => { close(); speak(TIPS[tips.current++ % TIPS.length], 'happy', 6000); setHop((h) => h + 1); }} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="x" label="잠깐 숨기기" onClick=${() => { close(); setFollow(false); toast('설정 → 화면 → 서랍이 따라다님에서 다시 켜요.'); }} />`, { width: 220 });

  return html`<div class="buddy" aria-live="polite">
    ${bubble && talk !== 'off' && html`<p class="buddy-bubble" role="status" key=${bubble.text}>${bubble.text}</p>`}
    <button type="button" class=${cx('buddy-btn', hop && `hop${hop % 2}`)} aria-label="서랍이 메뉴" aria-haspopup="menu" aria-expanded="false" title="서랍이"
      onClick=${(e) => { setHop((h) => h + 1); menu(e.currentTarget); }}>
      <${Mascot} size=${52} mood=${mood} />
    </button>
  </div>`;
}
