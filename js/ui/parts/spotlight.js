// 찾기와 빠른 실행: 애플 홈페이지의 검색 창 + 옵시디언의 명령 팔레트.
// 적는 대로 노트를 찾고, 「오늘 노트」 「설정」 같은 할 일도 같은 칸에서 바로 실행한다.
import { html, useState, useRef, useLayoutEffect } from '../h.js';
import { Icon } from '../icons.js';
import { app } from '../state.js';
import { go, noteHref } from '../router.js';
import { openLayer, useListNav } from './layers.js';
import { KindIcon, titleOf, highlighter } from './common.js';
import { openComposer } from './composer.js';
import { openTutorial } from './tutorial.js';
import { openToday } from '../notebook.js';
import { categoryOf } from '../categories.js';
import { search, parseQuery } from '../../core/search.js';

const COMMANDS = [
  ['plus', '넣기', 'Enter', () => { if (!app.focusCapture?.()) openComposer(); }],
  ['calendar', '오늘 노트', 'T', () => openToday()],
  ['check', '할 일 모아 보기', '', '#/tasks'],
  ['drawer', '모든 서랍', '', '#/drawers'],
  ['graph', '생각 지도', '', '#/graph'],
  ['pen', '새 노트 크게 쓰기', 'N', '#/new'],
  ['capture', '사진·스크린샷 넣기', '', () => app.pickPhotos()],
  ['star', '북마크 가져오기', '', '#/bookmarks'],
  ['instagram', '인스타 저장 가져오기', '', '#/import'],
  ['phone', '다른 앱에서 넣기', '', '#/connect'],
  ['gear', '설정', '', '#/settings'],
  ['book', '매뉴얼', '', () => go('#/help')],
  ['help', '화면 안내 다시 보기', '', () => { go('#/'); setTimeout(openTutorial, 160); }],
];

function Spot({ close }) {
  const ref = useRef();
  const [q, setQ] = useState('');
  useLayoutEffect(() => ref.current?.focus(), []);
  const lib = app.lib;
  const t = q.trim();
  const pq = parseQuery(t);
  const notes = t ? search(lib.all, pq, { limit: 7 }).map((h) => h.note) : lib.all.slice(0, 5);
  const cmds = COMMANDS.filter(([, label]) => !t || label.includes(t)).slice(0, t ? 5 : 6);
  const hl = highlighter(pq.terms);
  // 할 일 이름과 맞으면(또는 아무것도 안 적었으면) 빠른 실행이 먼저, 아니면 노트가 먼저
  const cmdFirst = !t || cmds.length > 0;
  const noteOptions = notes.map((n) => ({ kind: 'note', n, run: () => go(noteHref(n.id)) }));
  const cmdOptions = cmds.map(([icon, label, key, act]) => ({ kind: 'cmd', icon, label, key, run: () => (typeof act === 'string' ? go(act) : act()) }));
  const options = [
    ...(cmdFirst ? cmdOptions : []),
    ...noteOptions,
    ...(t ? [{ kind: 'all', run: () => go(`#/search?q=${encodeURIComponent(t)}`) }, { kind: 'ask', run: () => go(`#/ask?q=${encodeURIComponent(t)}`) }] : []),
    ...(cmdFirst ? [] : cmdOptions),
  ];
  const pick = (i) => { const o = options[i]; if (!o) return; close(); setTimeout(o.run, 0); };
  const [idx, setIdx, onKeyDown] = useListNav(options.length, pick, [t]);
  let i = -1;
  const item = (o, body) => { i++; const k = i; return html`<button type="button" key=${k} class=${`mi${k === idx ? ' on' : ''}`} onMouseMove=${() => setIdx(k)} onClick=${() => pick(k)}>${body}</button>`; };
  const noteOpts = options.filter((o) => o.kind === 'note');
  const moreOpts = options.filter((o) => o.kind === 'all' || o.kind === 'ask');
  const cmdOpts = options.filter((o) => o.kind === 'cmd');
  const cmdBlock = () => cmdOpts.length > 0 && html`<p class="mi-label">빠른 실행</p>${cmdOpts.map((o) => item(o, html`<${Icon} name=${o.icon} /><span>${o.label}</span>${o.key && html`<span class="sub"><kbd>${o.key}</kbd></span>`}`))}`;
  return html`<div class="spot" role="dialog" aria-modal="true" aria-label="찾기와 빠른 실행">
    <div class="spot-in"><${Icon} name="search" /><input ref=${ref} value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown}
      placeholder="검색 또는 명령" aria-label="찾기" enterkeyhint="search" autocomplete="off" spellcheck="false" /></div>
    <div class="spot-list">
      ${cmdFirst && cmdBlock()}
      ${noteOpts.length > 0 && html`<p class="mi-label">${t ? '노트' : '최근에 넣은 것'}</p>`}
      ${noteOpts.map((o) => item(o, html`<${KindIcon} type=${o.n.meta.type} /><span class="mi-text"><span>${hl ? hl(titleOf(o.n)) : titleOf(o.n)}</span><small>${categoryOf(o.n, lib).name}</small></span>`))}
      ${t && !noteOpts.length && html`<p class="mi-label">결과 없음</p>`}
      ${moreOpts.map((o) => item(o, o.kind === 'all'
        ? html`<${Icon} name="search" /><span>“${t}” 전체 검색</span>`
        : html`<${Icon} name="sparkle" /><span>Claude에게 묻기</span>`))}
      ${!cmdFirst && cmdBlock()}
    </div>
    <div class="spot-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> 고르기</span><span><kbd>Enter</kbd> 열기</span><span><kbd>Esc</kbd> 닫기</span></div>
  </div>`;
}

let closeOpen = null;
export function openSpotlight() {
  if (closeOpen) return;
  closeOpen = openLayer((close) => html`<${Spot} close=${close} />`, { kind: 'modal', cls: 'spot-overlay', onClose: () => { closeOpen = null; } });
}
