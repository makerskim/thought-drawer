// 화면 안내: 화면을 어둡게 덮고 한 곳씩 밝혀 가며 설명한다. 넘기기 / 이전 / 확인.
// 처음 한 번 저절로 뜨고, 매뉴얼의 「화면 안내 다시 보기」로 언제든 다시 본다.
import { html, useState, useRef, useEffect, useLayoutEffect } from '../h.js';
import { Mascot } from '../icons.js';
import { prefs } from '../state.js';
import { openLayer } from './layers.js';

const STEPS = [
  { title: '안녕하세요, 서랍이예요.', mood: 'wave', text: '넣기만 하세요. 정리는 제가 할게요.' },
  { target: '.capbar-box', title: '넣기', text: '적고 Enter. / 명령어, # 태그, @ 서랍. + 에서 사진, 붙여넣기, 가져오기.', m: '적고 「넣기」. / 명령어, + 에서 사진.' },
  { target: '.nav-toggle', title: '메뉴', text: '서랍, 모든 노트·필터, 할 일, 가져오기, 매뉴얼. 핀으로 왼쪽·오른쪽에 고정.' },
  { target: '.gn-search', title: '찾기', text: '/ 또는 ⌘K. 노트 검색과 명령 실행.', m: '노트 검색과 명령 실행.' },
  { target: '.rows.drawers', title: '내 서랍', text: '서랍 › 세부 서랍과 태그로 자동 분류. 옆으로 넘겨 보세요.' },
  { title: '준비됐어요.', mood: 'happy', text: '첫 메모를 넣어 보세요.' },
];
const PAD = 8;
const GAP = 16;

const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const find = (sel) => sel && sel.split(/,\s*(?![^()]*\))/).map((s) => [...document.querySelectorAll(s)].find(shown)).find(Boolean);

function Tour({ close }) {
  const [i, setI] = useState(0);
  const [hole, setHole] = useState(null);
  const [pos, setPos] = useState(null);
  const card = useRef();
  const ok = useRef();
  const step = STEPS[i];
  const phone = window.matchMedia('(max-width: 860px)').matches;
  const last = i === STEPS.length - 1;
  const next = () => (last ? close() : setI(i + 1));
  const prev = () => i > 0 && setI(i - 1);

  // 밝힐 곳 재기 (화면이 바뀌거나 굴리면 다시)
  useLayoutEffect(() => {
    const el = find(step.target);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const measure = () => {
      const t = find(step.target);
      if (!t) { setHole(null); return; }
      const r = t.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(t).borderTopLeftRadius) || 12;
      setHole({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2, r: Math.min(radius + PAD, 36) });
    };
    measure();
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); document.removeEventListener('scroll', measure, true); };
  }, [i]);

  // 설명 창은 밝힌 곳 아래(모자라면 위), 밝힌 곳이 없으면 가운데
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!hole) { setPos({ left: (vw - w) / 2, top: Math.max(GAP, (vh - h) / 2) }); return; }
    const left = Math.min(Math.max(GAP, hole.x + hole.w / 2 - w / 2), vw - w - GAP);
    let top = hole.y + hole.h + GAP;
    if (top + h > vh - GAP) top = hole.y - h - GAP;
    if (top < GAP) top = Math.max(GAP, vh - h - GAP);
    setPos({ left, top });
  }, [hole, i]);

  useEffect(() => { ok.current?.focus(); }, [i]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const h = hole ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0, r: 0 };
  return html`<div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
    <div class="tour-hole" style=${`left:${h.x}px;top:${h.y}px;width:${h.w}px;height:${h.h}px;border-radius:${h.r}px`}></div>
    <div class=${`tour-card${hole ? '' : ' center'}`} ref=${card} key=${i}
      style=${pos ? `left:${pos.left}px;top:${pos.top}px` : 'opacity:0'}>
      <div class="peek" aria-hidden="true"><${Mascot} size=${hole ? 64 : 96} mood=${step.mood ?? 'smile'} /></div>
      <p class="tour-count" aria-label=${`${STEPS.length}단계 중 ${i + 1}단계`}>
        ${STEPS.map((_, j) => html`<i class=${j === i ? 'on' : j < i ? 'done' : ''}></i>`)}
      </p>
      <h2 id="tour-title">${step.title}</h2>
      <p id="tour-text">${phone && step.m ? step.m : step.text}</p>
      <div class="tour-foot">
        ${!last && html`<button type="button" class="btn btn-ghost" onClick=${close}>넘기기</button>`}
        <span class="grow"></span>
        ${i > 0 && html`<button type="button" class="btn btn-ghost" onClick=${prev}>이전</button>`}
        <button type="button" class="btn btn-primary" ref=${ok} onClick=${next}>확인</button>
      </div>
    </div>
  </div>`;
}

let closeOpen = null;
export function openTutorial() {
  if (closeOpen) return;
  closeOpen = openLayer((close) => html`<${Tour} close=${close} />`, {
    kind: 'bare', onClose: () => { closeOpen = null; prefs.set('tutorialDone', true); },
  });
}
export const tutorialOpen = () => !!closeOpen;
