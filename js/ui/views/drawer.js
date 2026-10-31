// 서랍 화면들.
// 홈: 애플 홈페이지처럼 큰 제목과 넣는 칸 → 넷플릭스처럼 서랍마다 옆으로 넘기는 포스터 줄 → 넣는 곳 소개 타일 → 바닥.
// 서랍 모음, 서랍 하나(포스터 판 또는 목록), 찾은 노트, 할 일도 여기 있다.
import { html, useState, useEffect, useRef, useLayoutEffect, autosize, cx } from '../h.js';
import { Icon, Mascot, TYPE_ICON } from '../icons.js';
import { app, useLib, usePref, prefs, toast, say, useSpeech } from '../state.js';
import { go, folderHref, noteHref, tagHref, setUrl } from '../router.js';
import { PageBar, Footer, Conn } from '../parts/shell.js';
import { NoteRow, Poster, Empty, KindIcon, MenuItem, highlighter, titleOf } from '../parts/common.js';
import { popover, modal, useListNav } from '../parts/layers.js';
import { FolderPicker, ConfirmDialog } from '../parts/dialogs.js';
import { openComposer } from '../parts/composer.js';
import { openTutorial } from '../parts/tutorial.js';
import { capturePhotos, readClipboard } from '../capture.js';
import { quickSave, kindOfText } from '../quick.js';
import { openToday, todayKey, findDaily } from '../notebook.js';
import { categoryOf, guessCategory, drawerList, inDrawer, categoryLook } from '../categories.js';
import { search, parseQuery } from '../../core/search.js';
import { categoryParts } from '../../core/note.js';
import { openTasks, setTask } from '../../core/tasks.js';
import { relTime } from '../format.js';

const PAGE = 60;
const TYPES = [['', '전체'], ['memo', '메모'], ['bookmark', '링크'], ['capture', '사진'], ['instagram', '인스타']];
const SORTS = [['new', '넣은 순'], ['updated', '고친 순'], ['title', '이름 순']];
const SORTER = {
  updated: (a, b) => String(b.meta.updated || b.meta.created).localeCompare(String(a.meta.updated || a.meta.created)),
  title: (a, b) => titleOf(a).localeCompare(titleOf(b), 'ko'),
};
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 처음 한 번은 사용법 안내 (노트가 그려진 뒤에)
function useFirstTour(lib) {
  const ready = lib.all.length > 0 || lib.state.synced || !!lib.state.error;
  useEffect(() => {
    if (!ready || prefs.get('tutorialDone')) return undefined;
    const t = setTimeout(() => openTutorial(), 450);
    return () => clearTimeout(t);
  }, [ready]);
}

// ---------- 넣는 칸 (애플 검색창처럼 가운데 긴 칸) ----------
function draftMeta(text) {
  const k = kindOfText(text);
  const t = text.trim();
  if (k.kind === 'link' || k.kind === 'instagram') {
    const [url, ...rest] = t.split(/\s+/);
    return { meta: { type: k.kind === 'instagram' ? 'instagram' : 'bookmark', source: url }, body: rest.join(' ') };
  }
  const lines = t.split('\n');
  return k.kind === 'titled' ? { meta: { title: lines[0] }, body: lines.slice(1).join('\n') } : { meta: {}, body: t };
}

// 첫 화면의 서랍이: 넣는 칸 위에 앉아 적는 글을 보고, 어느 서랍으로 갈지 말해 주고, 넣으면 기뻐한다.
// 가만히 있으면 가끔 눈을 깜빡이고 쓰는 법을 하나씩 알려 준다. 누르면 말을 건다.
const GREET = () => {
  const h = new Date().getHours();
  return h < 5 ? '늦은 밤이네요. 떠오른 생각, 여기 두고 가세요.' : h < 11 ? '좋은 아침이에요. 오늘은 무엇을 넣어 둘까요?' : h < 17 ? '안녕하세요! 무엇이든 넣어 주세요. 제가 나눠 둘게요.' : '오늘 하루 어땠어요? 남기고 싶은 걸 넣어 주세요.';
};
const TIPS = [
  '링크를 붙여 넣으면 사이트를 보고 서랍을 골라 드려요.',
  '스크린샷은 그냥 붙여 넣으세요. 사진 속 글자도 읽어 둘게요.',
  '여러 줄로 적으면 첫 줄이 제목이 돼요.',
  '/ 를 누르면 무엇이든 바로 찾을 수 있어요.',
  '노트에서 서랍을 바꿔 주면, 다음부터 더 잘 나눌게요.',
  '휴대폰 앱에서는 링크 복사 후 「붙여넣기」만 누르면 돼요.',
];
function HeroMascot({ text, guess, link, drag, busy }) {
  const said = useSpeech();
  const [bubble, setBubble] = useState(null);
  const [hop, setHop] = useState(0);
  const tip = useRef(0);
  const idle = useRef(Date.now());
  // 처음 한 번 인사
  const typing = useRef(false);
  typing.current = !!text.trim();
  useEffect(() => { const t = setTimeout(() => { if (!typing.current) setBubble((b) => b ?? { text: GREET(), until: Date.now() + 6000 }); }, 700); return () => clearTimeout(t); }, []);
  // 다른 곳에서 건넨 말 (넣었어요 등)
  useEffect(() => { if (said) { setBubble({ text: said.text, mood: said.mood, until: said.until }); if (said.hop) setHop((h) => h + 1); idle.current = Date.now(); } }, [said?.id]);
  // 적는 동안: 무엇으로, 어느 서랍으로 갈지
  useEffect(() => {
    idle.current = Date.now();
    if (!text.trim() || !guess) { setBubble((b) => (b?.guess ? null : b)); return undefined; }
    const t = setTimeout(() => setBubble({ guess: true, text: link ? `링크네요! ${guess} 서랍에 넣을게요.` : guess === '기타' ? '어디에 둘지 고민돼요. 일단 넣어 두면 나중에 옮길게요.' : `${guess} 서랍이 어울려요.`, until: Date.now() + 5000 }), 450);
    return () => clearTimeout(t);
  }, [text.trim().slice(0, 80), guess]);
  // 오래 가만히 있으면 쓰는 법 하나 (세 번까지)
  useEffect(() => {
    const iv = setInterval(() => {
      if (text.trim() || tip.current >= 3 || Date.now() - idle.current < 30000) return;
      idle.current = Date.now();
      setBubble({ text: TIPS[tip.current++ % TIPS.length], until: Date.now() + 6000 });
    }, 5000);
    return () => clearInterval(iv);
  }, [text]);
  // 말풍선은 정한 시간이 지나면 닫힌다
  useEffect(() => {
    if (!bubble) return undefined;
    const t = setTimeout(() => setBubble(null), Math.max(0, bubble.until - Date.now()));
    return () => clearTimeout(t);
  }, [bubble]);
  const mood = drag ? 'wow' : busy ? 'happy' : bubble?.mood ?? (link ? 'wow' : text.trim() ? 'smile' : 'smile');
  const look = text.trim() ? [0.9, 0.7] : null;
  const poke = () => { setHop((h) => h + 1); setBubble({ text: drag ? '여기 놓으세요!' : TIPS[tip.current++ % TIPS.length], until: Date.now() + 5000 }); };
  return html`<div class="cap-mascot">
    <button type="button" class=${cx('cm-body', hop && `hop${hop % 2}`)} onClick=${poke} aria-label="서랍이에게 말 걸기" title="서랍이"><${Mascot} size=${64} mood=${mood} look=${look} /></button>
    ${(bubble || drag) && html`<p class="cm-bubble" role="status" key=${drag ? 'drag' : bubble.text}>${drag ? '여기 놓으세요!' : bubble.text}</p>`}
  </div>`;
}

function CaptureBar() {
  const lib = useLib();
  const ref = useRef();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  useLayoutEffect(() => autosize(ref.current), [text]);
  useEffect(() => {
    app.focusCapture = () => { const el = ref.current; if (!el) return false; el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return true; };
    return () => { app.focusCapture = null; };
  }, []);
  const k = kindOfText(text);
  const d = text.trim() ? draftMeta(text) : null;
  const guess = d ? guessCategory(d.meta, d.body, lib) : null;
  const save = async (open = false) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await quickSave(text, { open }); setText(''); } catch (e) { say(`앗, 넣지 못했어요. ${e.message}`, { mood: 'wow' }); toast(e.message); }
    setBusy(false);
  };
  const photos = (files) => { capturePhotos(files, text); setText(''); };
  const paste = async () => {
    const got = await readClipboard();
    if (!got) { toast('붙여넣기를 허용해 주세요. 또는 칸을 길게 눌러 붙여넣기를 골라요.'); return; }
    if (got.files.length) { photos(got.files); return; }
    if (!got.text.trim()) { say('복사해 둔 글이나 사진이 없어요. 먼저 복사해 주세요.', { mood: 'think' }); return; }
    setText((t) => (t.trim() ? `${t.trim()}\n${got.text.trim()}` : got.text.trim()));
    ref.current?.focus();
  };
  return html`<div class=${cx('capbar', drag && 'drag')}
      onDragOver=${(e) => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); setDrag(true); } }}
      onDragLeave=${() => setDrag(false)}
      onDrop=${(e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); e.stopPropagation(); setDrag(false); photos([...e.dataTransfer.files]); }}>
    <${HeroMascot} text=${text} guess=${guess?.category} link=${k.kind === 'link' || k.kind === 'instagram'} drag=${drag} busy=${busy} />
    <div class="capbar-box">
      <textarea ref=${ref} rows="1" value=${text} aria-label="넣을 내용" enterkeyhint="send" placeholder="메모, 할 일, 링크를 적거나 붙여 넣으세요"
        onInput=${(e) => setText(e.target.value)}
        onKeyDown=${(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(e.metaKey || e.ctrlKey); } else if (e.key === 'Escape' && text) { e.preventDefault(); e.stopPropagation(); setText(''); } }}
        onPaste=${(e) => { const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); e.stopPropagation(); photos(files); } }}></textarea>
      <button type="button" class="cap-save" disabled=${busy || !text.trim()} onClick=${() => save()}>넣기</button>
    </div>
    ${guess && html`<p class="cap-hint"><span class="cap-guess"><${Icon} name=${categoryLook(guess.category).icon} /><b>${guess.category}</b> 서랍으로</span></p>`}
    <div class="hero-links">
      <button type="button" onClick=${() => app.pickPhotos(text)}>사진·스크린샷 넣기</button>
      <button type="button" onClick=${paste}>복사한 것 붙여넣기</button>
      <button type="button" onClick=${() => go('#/connect')}>다른 앱·사이트에서 넣는 법</button>
    </div>
  </div>`;
}

function TodayLine() {
  const lib = useLib();
  const d = new Date();
  const daily = findDaily(lib, todayKey(d));
  const left = taskGroups(lib).reduce((s, g) => s + g.tasks.length, 0);
  return html`<div class="today-line today">
    <span>${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일</span>
    <a href="#/tasks">남은 할 일 <b>${left}개</b></a>
    <button type="button" class="today-btn" onClick=${() => openToday()} title="오늘 노트 (T)">${daily ? '오늘 노트 이어 쓰기' : '오늘 노트 쓰기'}</button>
  </div>`;
}

// ---------- 포스터 줄 (넷플릭스) ----------
function Row({ title, href, notes, activeId, count = 0 }) {
  const track = useRef();
  if (!notes.length) return null;
  const slide = (dir) => { const el = track.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' }); };
  return html`<section class="row" aria-label=${title}>
    <div class="row-head"><h2>${title}</h2>${count > notes.length && html`<span class="n">${count}</span>`}${href && html`<a class="more" href=${href}>모두 보기</a>`}</div>
    <button type="button" class="row-arrow l" aria-label=${`${title} 앞으로`} tabindex="-1" onClick=${() => slide(-1)}><${Icon} name="back" /></button>
    <div class="row-track" ref=${track}>${notes.map((n) => html`<${Poster} key=${n.id} note=${n} active=${n.id === activeId} />`)}</div>
    <button type="button" class="row-arrow r" aria-label=${`${title} 뒤로`} tabindex="-1" onClick=${() => slide(1)}><${Icon} name="chevron" /></button>
  </section>`;
}

// ---------- 넣는 곳 소개 (애플 2단 타일) ----------
const TILES = [
  { h: '브라우저 단추', p: '보던 페이지를 클릭 한 번에 넣어요. 모든 브라우저에서.', icon: 'globe', links: [['설치하기', '#/connect']] },
  { h: '휴대폰 앱에서', p: '공유에서 링크를 복사하고, 여기서 붙여 넣으면 끝.', icon: 'phone', links: [['방법 보기', '#/connect']] },
  { h: '북마크 가져오기', p: '브라우저 북마크 수백 개도 한 번에, 알아서 나눠서.', icon: 'star', links: [['가져오기', '#/bookmarks']] },
  { h: '생각 지도', p: '노트와 노트가 어떻게 이어지는지 한눈에.', icon: 'graph', links: [['지도 열기', '#/graph']] },
];
function Tiles() {
  return html`<section aria-labelledby="tiles-title">
    <div class="tiles-head"><h2 id="tiles-title">어디서든 넣으세요.</h2><p>휴대폰, 다른 브라우저, 북마크까지 한곳으로.</p></div>
    <div class="tiles">${TILES.map((t) => html`<div class="tile" key=${t.h}>
      <span class="tile-ic"><${Icon} name=${t.icon} /></span>
      <h3>${t.h}</h3><p>${t.p}</p>
      <div class="tile-links">${t.links.map(([l, href]) => html`<a class="more" href=${href} key=${l}>${l}</a>`)}</div>
    </div>`)}</div>
  </section>`;
}

// 아래로 내리면 하나씩 떠오른다
function useReveal(dep) {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal:not(.in)')];
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return undefined; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
}

export function Home() {
  const lib = useLib();
  useFirstTour(lib);
  const loading = !lib.all.length && !lib.state.synced && !lib.state.error;
  const recent = prefs.get('recent', []).map((id) => lib.get(id)).filter(Boolean).slice(0, 20);
  const drawers = drawerList(lib);
  const byDrawer = (name) => lib.all.filter((n) => categoryOf(n, lib).name === name).slice(0, 20);
  app.visible = lib.all.map((n) => n.id);
  useReveal(`${lib.all.length}:${drawers.length}`);
  useEffect(() => { if (loading) say('드라이브에서 노트를 가져오고 있어요. 잠깐만요.', { mood: 'think', ms: 6000 }); }, [loading]);
  return html`<div class="home">
    <${Conn} />
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-in">
        <h1 id="hero-title">넣기만 하세요.<br />정리는 서랍이.</h1>
        <p class="hero-sub">메모, 링크, 스크린샷, 북마크. 무엇이든 넣으면 알아서 나눠 둡니다.</p>
        <${CaptureBar} />
      </div>
      ${lib.all.length > 0 && html`<button type="button" class="scroll-cue" onClick=${() => document.querySelector('.below')?.scrollIntoView({ behavior: 'smooth' })}>내 서랍 보기<${Icon} name="down" /></button>`}
    </section>
    <div class="below">
      ${loading
        ? html`<div class="rows"><section class="row"><div class="row-track">${[1, 2, 3, 4, 5].map((i) => html`<div class="poster sk" key=${i}></div>`)}</div></section></div>`
        : lib.all.length
          ? html`<div class="below-head reveal"><h2>내 서랍</h2><${TodayLine} /></div>
            <div class="rows drawers">
              ${recent.length > 0 && html`<div class="reveal"><${Row} title="이어서 보기" notes=${recent} /></div>`}
              <div class="reveal"><${Row} title="새로 넣은 것" href="#/all" notes=${lib.all.slice(0, 20)} count=${lib.all.length} /></div>
              ${drawers.map((d) => html`<div class="reveal" key=${d.name}><${Row} title=${d.name} href=${folderHref(d.name)} notes=${byDrawer(d.name)} count=${d.count} /></div>`)}
            </div>`
          : html`<${Empty} mood="wave" title="서랍이 비어 있어요" text="위 칸에 첫 생각을 적거나, 아래 방법으로 넣어 보세요." />`}
      <div class="reveal"><${Tiles} /></div>
      <${Footer} />
    </div>
  </div>`;
}

// ---------- 서랍 모음 ----------
export function Drawers() {
  const lib = useLib();
  const list = drawerList(lib);
  return html`<div class="drawers-page">
    <${Conn} />
    <div class="page-hero"><h1>서랍.</h1><p>넣은 것을 사이트와 내용을 보고 앱이 나눴어요. 노트에서 서랍을 바꾸면 다음부터 더 잘 나눠요.</p></div>
    <div class="dbig-grid drawers">
      ${list.map((d) => html`<a key=${d.name} class=${`dbig c${d.look.tone}`} href=${folderHref(d.name)}>
        <span class="dbig-ic"><${Icon} name=${d.look.icon} /></span><b>${d.name}</b><span>노트 ${d.count}개${d.auto ? `, 그중 ${d.auto}개는 자동 분류` : ''}</span>
        <ul>${lib.all.filter((n) => categoryOf(n, lib).name === d.name).slice(0, 3).map((n) => html`<li key=${n.id}>${titleOf(n)}</li>`)}</ul>
      </a>`)}
      <a class="dbig c6" href="#/all"><span class="dbig-ic"><${Icon} name="grid" /></span><b>모든 노트</b><span>노트 ${lib.all.length}개</span></a>
      ${lib.pinned().length > 0 && html`<a class="dbig c2" href="#/star"><span class="dbig-ic"><${Icon} name="star" /></span><b>즐겨찾기</b><span>노트 ${lib.pinned().length}개</span></a>`}
    </div>
    <${Footer} />
  </div>`;
}

// ---------- 서랍 하나, 태그, 즐겨찾기, 찾기: 포스터 판 또는 목록 ----------
function useMore(key, total) {
  const [limit, setLimit] = useState(PAGE);
  const ref = useRef();
  useEffect(() => setLimit(PAGE), [key]);
  useEffect(() => {
    const el = ref.current;
    if (!el || limit >= total || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit(limit + PAGE); }, { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, total, key]);
  return [limit, ref];
}

function TagList({ close }) {
  const lib = useLib();
  const [q, setQ] = useState('');
  const counts = new Map();
  for (const n of lib.all) for (const t of n.meta.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const list = [...counts].filter(([t]) => t.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  const pick = (i) => { close(); go(tagHref(list[i][0])); };
  const [idx, , onKeyDown] = useListNav(list.length, pick, [q]);
  return html`<div class="pop-search"><input autofocus value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown} placeholder="태그 찾기" aria-label="태그 찾기" /></div>
    <div class="pop-list">${list.length
      ? list.map(([t, c], i) => html`<${MenuItem} key=${t} icon="tag" label=${t} sub=${String(c)} on=${i === idx} onClick=${() => pick(i)} />`)
      : html`<p class="mi-label">${counts.size ? '맞는 태그가 없어요' : '아직 태그가 없어요'}</p>`}</div>`;
}

function List({ notes, hl, more }) {
  const lib = useLib();
  const [sel, setSel] = useState(() => new Set());
  const chosen = notes.filter((n) => sel.has(n.id));
  const toggle = (id, yes) => setSel((prev) => { const next = new Set(prev); yes ? next.add(id) : next.delete(id); return next; });
  const moveMany = (list, anchor) => popover(anchor, (close) => html`<${FolderPicker} close=${close} onPick=${async (p) => {
    const t = toast(`${list.length}개를 옮기는 중`, { busy: true });
    try {
      for (const n of list) await lib.moveTo(lib.get(n.id) ?? n, p);
      setSel(new Set());
      t.update(p ? `${list.length}개를 ${categoryParts(p).join(' / ')} 서랍에 넣었어요` : `${list.length}개를 자동 분류에 맡겼어요`);
    } catch (e) { t.update(e.message, { duration: 6000 }); }
  }} />`, { width: 300 });
  const removeMany = (list) => modal((close) => html`<${ConfirmDialog} close=${close} danger yes="지우기"
    title=${`${list.length}개를 지울까요?`} text="구글 드라이브 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요."
    onYes=${async () => {
      const undos = [];
      try { for (const n of list) undos.push(await lib.remove(n)); } catch (e) { toast(e.message); }
      setSel(new Set());
      toast(`${undos.length}개를 지웠어요`, { action: '되돌리기', duration: 6000, onAction: async () => { for (const u of undos) await u(); } });
    }} />`);
  const [limit, sentinel] = more;
  return html`
    <div class="bulkbar">
      <label class="pick-all"><input type="checkbox" checked=${notes.length > 0 && chosen.length === notes.length} indeterminate=${chosen.length > 0 && chosen.length < notes.length}
        onChange=${(e) => setSel(e.target.checked ? new Set(notes.map((n) => n.id)) : new Set())} aria-label="모두 고르기" />
        <span>${chosen.length ? `${chosen.length}개 고름` : `${notes.length}개`}</span></label>
      ${chosen.length > 0 && html`
        <button type="button" class="btn" onClick=${(e) => moveMany(chosen, e.currentTarget)}><${Icon} name="folder" />서랍 옮기기</button>
        <button type="button" class="btn btn-ghost btn-danger" onClick=${() => removeMany(chosen)}><${Icon} name="trash" />지우기</button>
        <button type="button" class="btn btn-ghost" onClick=${() => setSel(new Set())}>고르기 취소</button>`}
    </div>
    <div class="rows-list">${notes.slice(0, limit).map((n) => html`<${NoteRow} key=${n.id} note=${n} hl=${hl}
      selectable selected=${sel.has(n.id)} onSelect=${(yes) => toggle(n.id, yes)} right=${html`
        <span class="hide-m">${categoryOf(n, lib).name}</span>
        <span class="num">${relTime(n.meta.updated || n.meta.created)}</span>
        <button type="button" class="btn btn-ghost act" title="서랍 바꾸기" aria-label=${`${categoryOf(n, lib).name}에서 다른 서랍으로`} onClick=${(e) => moveMany([n], e.currentTarget)}><${Icon} name="folder" /></button>`} />`)}</div>
    <div ref=${sentinel} class="sentinel"></div>`;
}

function pick(lib, scope) {
  if (scope.kind === 'all') return lib.all;
  if (scope.kind === 'star') return lib.pinned();
  if (scope.kind === 'inbox') return lib.inbox();
  if (scope.kind === 'tag') return lib.all.filter((n) => (n.meta.tags ?? []).includes(scope.value));
  return lib.all.filter((n) => inDrawer(n, lib, scope.value));
}

// scope: { kind: 'folder'|'tag'|'star'|'inbox'|'all'|'search', value }
export function Shelf({ scope }) {
  const lib = useLib();
  const [type, setType] = useState('');
  const [view, setView] = usePref('view', 'wall');
  const [sort, setSort] = usePref('sort', 'new');
  const [q, setQ] = useState(scope.kind === 'search' ? scope.value : '');
  useEffect(() => { setType(''); window.scrollTo(0, 0); }, [scope.kind, scope.value]);
  const searching = scope.kind === 'search';
  const pq = parseQuery(q);
  const base = searching ? (q.trim() ? search(lib.all, pq, { limit: 400 }).map((h) => h.note) : []) : pick(lib, scope);
  const typed = type ? base.filter((n) => (n.meta.type ?? 'memo') === type) : base;
  const notes = !searching && SORTER[sort] ? [...typed].sort(SORTER[sort]) : typed;
  app.visible = notes.map((n) => n.id);
  const hl = searching ? highlighter(pq.terms) : null;
  const more = useMore(`${scope.kind}|${scope.value}|${type}|${sort}|${q}`, notes.length);
  const counts = new Map();
  for (const n of base) counts.set(n.meta.type ?? 'memo', (counts.get(n.meta.type ?? 'memo') ?? 0) + 1);
  const top = scope.kind === 'folder' ? categoryParts(scope.value)[0] : null;
  const look = categoryLook(top ?? '');
  const subs = top ? lib.folders().find((f) => f.path === top)?.children ?? [] : [];
  const autoN = scope.kind === 'folder' ? base.filter((n) => categoryOf(n, lib).auto).length : 0;
  const title = { folder: categoryParts(scope.value ?? '').join(' / '), tag: `#${scope.value}`, star: '즐겨찾기', inbox: 'Claude 정리 전', all: '모든 노트', search: '찾기' }[scope.kind];
  const menu = (anchor) => popover(anchor, (close) => html`
    <div class="mi-label">정렬</div>
    ${SORTS.map(([k, label]) => html`<${MenuItem} key=${k} icon=${sort === k ? 'check' : 'blank'} label=${label} onClick=${() => { close(); setSort(k); }} />`)}
    <div class="mi-sep"></div>
    <div class="mi-label">보기</div>
    <${MenuItem} icon=${view === 'wall' ? 'check' : 'blank'} label="포스터" onClick=${() => { close(); setView('wall'); }} />
    <${MenuItem} icon=${view === 'list' ? 'check' : 'blank'} label="목록 (여러 개 고르기)" onClick=${() => { close(); setView('list'); }} />
    <div class="mi-sep"></div>
    <${MenuItem} icon="tag" label="태그 모아 보기" onClick=${() => { close(); setTimeout(() => popover(anchor, (c2) => html`<${TagList} close=${c2} />`, { width: 260 }), 0); }} />`, { width: 240 });
  return html`<div class="shelf">
    <${PageBar} title=${title} back="#/drawers" right=${html`<button type="button" class="btn btn-ghost view-btn" aria-haspopup="menu" aria-expanded="false" aria-label="보기 설정" onClick=${(e) => menu(e.currentTarget)}><${Icon} name=${view === 'list' ? 'list' : 'grid'} /><span class="hide-m">${searching ? '맞는 순' : SORTS.find(([k]) => k === sort)?.[1]}</span></button>`} />
    ${searching
      ? html`<div class="page-hero"><h1>${q.trim() ? `“${q.trim()}”` : '찾기'}</h1>
          <form class="ask-box" style="margin-top:18px;max-width:640px" onSubmit=${(e) => { e.preventDefault(); setUrl(`#/search?q=${encodeURIComponent(q)}`); }}>
            <${Icon} name="search" /><textarea rows="1" value=${q} aria-label="찾을 말" placeholder="찾을 말" onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); setUrl(`#/search?q=${encodeURIComponent(q)}`); } }}></textarea>
            <a class="btn btn-primary" href=${`#/ask?q=${encodeURIComponent(q.trim())}`}><${Icon} name="sparkle" />물어보기</a></form>
          <p>${q.trim() ? `찾은 노트 ${notes.length}개` : '모든 노트의 제목, 본문, 태그, 사진 속 글자에서 찾아요.'}</p></div>`
      : html`<div class="page-hero">
          <h1>${title}.</h1>
          <p>노트 ${base.length}개${scope.kind === 'folder' && top !== title ? '' : ''}</p>
          ${autoN > 0 && html`<p class="sh-note"><${Icon} name="sparkle" /><span>${autoN}개는 앱이 자동으로 나눴어요. 잘못 들어갔으면 노트를 열어 서랍을 바꿔 주세요.</span></p>`}
          ${subs.length > 0 && html`<nav class="chip-row" style="margin-top:16px" aria-label="안쪽 서랍">
            <a class="chip" href=${folderHref(top)} aria-current=${scope.value === top ? 'page' : undefined}>${top} 전체</a>
            ${subs.map((f) => html`<a key=${f.path} class="chip" href=${folderHref(f.path)} aria-current=${scope.value === f.path ? 'page' : undefined}>${f.name}<span class="n">${f.count}</span></a>`)}
          </nav>`}
        </div>`}
    ${base.length > 0 && html`<div class="filters type-chips" role="group" aria-label="종류">
      ${TYPES.filter(([k]) => !k || counts.get(k) || type === k).map(([k, label]) => html`<button type="button" key=${k || 'all'} class="chip" aria-pressed=${type === k}
        onClick=${() => setType(type === k ? '' : k)}>${k && html`<${Icon} name=${TYPE_ICON[k]} />`}${label}${k && html`<span class="n">${counts.get(k) ?? 0}</span>`}</button>`)}
    </div>`}
    ${!notes.length
      ? (searching && q.trim()
        ? html`<${Empty} mood="wow" title=${`“${q.trim()}” 노트는 없어요`} text="다른 낱말로 찾아보거나 Claude에게 물어보세요.">
            <button type="button" class="btn" onClick=${() => openComposer(q)}><${Icon} name="plus" />이 글을 메모로 넣기</button></${Empty}>`
        : !searching && html`<${Empty} mood="think" title="여기는 아직 비어 있어요" text=${type ? '종류 거르기를 끄면 다른 노트도 보여요.' : ''} />`)
      : view === 'list'
        ? html`<${List} notes=${notes} hl=${hl} more=${more} />`
        : html`<div class="grid">${notes.slice(0, more[0]).map((n) => html`<${Poster} key=${n.id} note=${n} hl=${hl} />`)}</div><div ref=${more[1]} class="sentinel"></div>`}
    <${Footer} />
  </div>`;
}

// ---------- 할 일 ----------
async function flipTask(lib, n, t, done) {
  try {
    const cur = await lib.ensureBody(lib.get(n.id) ?? n);
    const body = setTask(cur.body, t.line, done, t.text);
    if (body == null) { toast('노트가 그새 바뀌었어요. 노트를 열어 확인해 주세요.'); return; }
    await lib.update(cur, { body });
    if (done) toast(`“${t.text}” 했어요`, { action: '되돌리기', duration: 5000, onAction: () => flipTask(lib, n, t, false) });
  } catch (e) { toast(e.message); }
}
const taskGroups = (lib) => lib.all.map((n) => ({ n, tasks: n.body ? openTasks(n.body) : [] })).filter((g) => g.tasks.length)
  .sort((a, b) => String(b.n.meta.updated || b.n.meta.created).localeCompare(String(a.n.meta.updated || a.n.meta.created)));

export function Tasks() {
  const lib = useLib();
  const [prog, setProg] = useState(null);
  // 본문을 아직 안 받은 노트는 받아 온다 (한 번 받으면 기기에 남는다)
  useEffect(() => {
    const missing = lib.all.filter((n) => n.body === undefined);
    if (!missing.length) return undefined;
    let alive = true;
    let done = 0;
    setProg([0, missing.length]);
    const work = async () => {
      while (alive && missing.length) {
        const n = missing.shift();
        try { await lib.ensureBody(n); } catch { /* 못 받은 노트는 건너뛴다 */ }
        if (alive) setProg([++done, done + missing.length]);
      }
    };
    Promise.all([work(), work(), work(), work()]).then(() => alive && setProg(null));
    return () => { alive = false; };
  }, [lib.all.length]);
  const groups = taskGroups(lib);
  const left = groups.reduce((s, g) => s + g.tasks.length, 0);
  return html`<div class="tasks-page">
    <${Conn} />
    <div class="page-hero"><h1>할 일.</h1><p>${prog ? `노트에서 할 일을 모으는 중 ${prog[0]}/${prog[1]}` : left ? `노트 ${groups.length}개에 남은 할 일 ${left}개. 체크하면 노트에도 바로 표시돼요.` : '모든 노트의 체크 상자 중 아직 안 한 것이 여기에 모여요.'}</p></div>
    ${!groups.length && !prog
      ? html`<${Empty} mood="happy" title="남은 할 일이 없어요" text="노트에 「- [ ] 할 일」처럼 적거나 / 메뉴의 체크 상자를 쓰면 여기에 모여요.">
          <button type="button" class="btn btn-primary" onClick=${() => openToday()}><${Icon} name="calendar" />오늘 노트 열기</button>
          <button type="button" class="btn" onClick=${() => go('#/new?template=todo')}><${Icon} name="check" />할 일 노트 만들기</button>
        </${Empty}>`
      : html`<div class="tasks">${groups.map(({ n, tasks }) => html`<section class="task-group" key=${n.id}>
          <a class="tg-head" href=${noteHref(n.id)}><${KindIcon} type=${n.meta.type} /><b>${titleOf(n)}</b><span>${categoryOf(n, lib).name}</span></a>
          <ul>${tasks.map((t) => html`<li key=${`${t.line}:${t.text}`}><label><input type="checkbox" onChange=${(e) => { e.target.disabled = true; flipTask(lib, n, t, true); }} /><span>${t.text}</span></label></li>`)}</ul>
        </section>`)}</div>`}
    <${Footer} />
  </div>`;
}

