// 사용법 안내: 화면을 어둡게 덮고 한 곳씩 밝혀 가며 설명한다. 넘기기 / 이전 / 확인.
// 처음 한 번 저절로 뜨고, 메뉴의 「사용법 다시 보기」로 언제든 다시 본다.
import { html, useState, useRef, useEffect, useLayoutEffect } from '../h.js';
import { Mascot } from '../icons.js';
import { prefs } from '../state.js';
import { openLayer } from './layers.js';

const STEPS = [
  { title: '안녕하세요, 서랍이예요', mood: 'wave', text: '생각, 링크, 캡처, 사진, 북마크를 이 서랍에 넣어 두면 알아서 나눠 두고, 필요할 때 바로 찾아 드려요. 30초면 다 보여 드릴게요.' },
  { target: '.capture', title: '넣기는 여기 하나로', text: '적고 Enter면 끝이에요. 링크와 사진은 붙여 넣거나 끌어다 놓아도 되고, 아래 단추로 사진·붙여넣기·가져오기를 할 수 있어요.',
    m: '적고 넣기를 누르면 끝이에요. 다른 앱에서 링크를 복사했다면 「붙여넣기」, 사진은 「사진·캡처」를 눌러요.' },
  { target: '.drawers', title: '알아서 나뉘는 서랍', text: '넣은 것은 사이트와 내용을 보고 쇼핑, 요리, 여행 같은 서랍에 자동으로 들어가요. 잘못 들어간 건 노트에서 서랍을 바꾸면 다음부터 더 잘 나눠요.' },
  { target: '.today', title: '오늘과 할 일', text: '하루에 한 장 쓰는 오늘 노트, 그리고 모든 노트의 체크 상자 중 남은 할 일이 여기 모여요.' },
  { target: '.search', title: '찾기와 묻기', text: '/ 를 누르고 낱말을 적으면 모든 노트에서 바로 찾아요. 「물어보기」를 누르면 Claude가 내 노트로 답해요.',
    m: '낱말을 적으면 모든 노트에서 바로 찾아요. 「물어보기」를 누르면 Claude가 내 노트로 답해요.' },
  { target: '.drawer .me', title: '다른 기기와 앱에서도', text: '휴대폰 앱, 다른 브라우저, 크롬 확장에서 넣는 법과 북마크·인스타 가져오기, 설정이 메뉴에 있어요. 이 안내도 여기서 다시 볼 수 있어요.' },
  { title: '준비 끝!', mood: 'happy', text: '이제 첫 생각을 넣어 보세요.' },
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
