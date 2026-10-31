// 선 아이콘 (24×24, 1.75 두께). 이름으로 고른다.
import { html } from './h.js';

const P = {
  home: '<path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9v10.5h13V9"/><path d="M10 19.5v-5h4v5"/>',
  inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5h5a3.5 3.5 0 0 0 7 0h5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  graph: '<circle cx="6" cy="6.5" r="2.3"/><circle cx="18" cy="8" r="2.3"/><circle cx="9" cy="18" r="2.3"/><path d="m8.2 7.3 7.5 1.1M7 8.7l1.4 7M16.6 9.9l-5.8 6.6"/>',
  folder: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  up: '<path d="m6 14.5 6-6 6 6"/>',
  memo: '<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>',
  capture: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 15.5-4.5-4.5L7 19"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><path d="M17.2 6.8h.01"/>',
  gear: '<circle cx="12" cy="12" r="2.8"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
  more: '<circle cx="5.5" cy="12" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="18.5" cy="12" r="1.1" fill="currentColor"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6"/><path d="M6.5 7l.8 12.5h9.4L17.5 7M9.5 7V4.5h5V7"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v5.5H4.5V6H10"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>',
  sparkle: '<path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5z"/><path d="M18.5 15.5c.25 1.6 1 2.3 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.2 2.25-.9 2.5-2.5z"/>',
  thought: '<path d="M9 18h6M10 21h4"/><path d="M12 3.5a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3.5z"/>',
  tag: '<path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z"/><circle cx="8" cy="9" r="1.3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  type: '<path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  upload: '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v4.5h15V15"/>',
  download: '<path d="M12 4.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 15v4.5h15V15"/>',
  logout: '<path d="M14.5 4.5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4M6 12h9.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17.5" r=".9" fill="currentColor"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  table: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 10h17M3.5 14.5h17M9.5 10v9"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8 11h6"/>',
  fit: '<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>',
  connect: '<path d="M9 7H6.5a4.5 4.5 0 0 0 0 9H9M15 7h2.5a4.5 4.5 0 0 1 0 9H15M8.5 11.5h7"/>',
  ask: '<path d="M4.5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h10A2.5 2.5 0 0 1 19.5 7v6a2.5 2.5 0 0 1-2.5 2.5H8.5z"/><path d="M10 8.7a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1v.3"/><path d="M12 13.6h.01"/>',
  enter: '<path d="M19.5 5.5v7a2 2 0 0 1-2 2h-12"/><path d="m9 18.5-3.5-4 3.5-4"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/>',
  alert: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5M12 15.7h.01"/>',
  cloudOff: '<path d="M7 18.5h10a4 4 0 0 0 1-7.9A6 6 0 0 0 7.2 9 4.8 4.8 0 0 0 7 18.5z"/><path d="M4 4l16 16"/>',
  paste: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V3h6v1.5M9 11h6M9 14.5h4"/>',
  arrowUpDown: '<path d="M8 4.5v15M4.5 8 8 4.5 11.5 8M16 19.5v-15M12.5 16l3.5 3.5 3.5-3.5"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 17.5h2"/>',
  puzzle: '<path d="M9 4.5h3.5v2a1.75 1.75 0 1 0 3.5 0v-2h3.5V8h-2a1.75 1.75 0 1 0 0 3.5h2v8H12.5v-2a1.75 1.75 0 1 0-3.5 0v2H4.5V12h2a1.75 1.75 0 1 0 0-3.5h-2V4.5z"/>',
  pin: '<path d="M9 4.5h6l-1 5 3 3v1.5H7V12.5l3-3z"/><path d="M12 15v4.5"/>',
  arrowLeftRight: '<path d="M4.5 9h15M15.5 5l4 4-4 4M19.5 15h-15M8.5 11l-4 4 4 4"/>',
  bag: '<path d="M5.5 8.5h13l-1 11h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  shirt: '<path d="M8.5 4.5 4 7.5l2 3.5 2-1v9.5h8V10l2 1 2-3.5-4.5-3c-.6 1.6-2 2.5-3.5 2.5s-2.9-.9-3.5-2.5z"/>',
  cook: '<path d="M4.5 11h15v3a5.5 5.5 0 0 1-5.5 5.5h-4A5.5 5.5 0 0 1 4.5 14z"/><path d="M3 11h18M9 8V5.5M12 8V4.5M15 8V5.5"/>',
  plane: '<path d="M20.5 3.5 3.5 10.5l7 2.5 2.5 7z"/><path d="m10.5 13 4-4"/>',
  book: '<path d="M5 5.5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20.5v-15M9 7.5h6"/>',
  briefcase: '<rect x="3.5" y="7" width="17" height="12" rx="2"/><path d="M9 7V5.5h6V7M3.5 12h17"/>',
  play: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z"/>',
  heart: '<path d="M12 19.5s-7.5-4.3-7.5-9.5A4 4 0 0 1 12 7.6 4 4 0 0 1 19.5 10c0 5.2-7.5 9.5-7.5 9.5z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2-.5-2.5-1.3M12 6.5V8M12 16v1.5"/>',
  drawer: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 12h16M10 8h4M10 16h4"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8s1-5.7 3.2-8z"/>',
  at: '<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 6.9"/>',
  bookmark: '<path d="M6.5 4.5h11v15.5L12 16.2l-5.5 3.8z"/>',
  help: '<circle cx="12" cy="12" r="8"/><path d="M9.8 9.6a2.3 2.3 0 1 1 3.1 2.2c-.6.3-.9.7-.9 1.3v.4"/><path d="M12 16.4h.01"/>',
  pen: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M12.5 7.5l4 4"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  slash: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="m13.8 8-3.6 8"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
};

export function Icon({ name, size, label, class: cls }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' };
  return html`<svg class=${`i ${cls ?? ''}`} style=${size ? `width:${size}px;height:${size}px` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ...${a11y} dangerouslySetInnerHTML=${{ __html: P[name] ?? '' }}></svg>`;
}

export const TYPE_ICON = { memo: 'memo', capture: 'capture', bookmark: 'link', instagram: 'instagram' };

// 마스코트 서랍이: 두 칸짜리 파란 서랍장. 위 서랍에 눈, 아래 서랍 손잡이가 입, 머리에 쪽지 한 장.
// mood: smile(기본) · happy(눈웃음) · wow(놀람) · think(위를 봄) · wave(손 흔들기)
const INK = 'var(--m-ink, #16203a)';
// look: 눈동자가 볼 곳 [-1~1, -1~1] (예: 적는 글 쪽을 본다)
function eyes(mood, look) {
  if (mood === 'happy' || mood === 'wave') {
    return html`<path d="M15.6 22.2q2.9-3.6 5.8 0M26.6 22.2q2.9-3.6 5.8 0" stroke=${INK} stroke-width="2.3" stroke-linecap="round" fill="none"/>`;
  }
  const dx = look ? look[0] * 1.3 : mood === 'think' ? -0.8 : 0.5;
  const dy = look ? look[1] * 1.3 : mood === 'think' ? -1.3 : 0.6;
  const r = mood === 'wow' ? 1.5 : 2.05;
  return html`<ellipse cx="18.5" cy="21" rx="3.5" ry="4" fill="#fff"/><ellipse cx="29.5" cy="21" rx="3.5" ry="4" fill="#fff"/>
    <circle cx=${18.5 + dx} cy=${21 + dy} r=${r} fill=${INK}/><circle cx=${29.5 + dx} cy=${21 + dy} r=${r} fill=${INK}/>
    <circle cx=${19.3 + dx} cy=${20.1 + dy} r=".7" fill="#fff"/><circle cx=${30.3 + dx} cy=${20.1 + dy} r=".7" fill="#fff"/>`;
}
function mouth(mood) {
  if (mood === 'wow') return html`<ellipse cx="24" cy="34.6" rx="2" ry="2.3" fill=${INK}/>`;
  if (mood === 'happy' || mood === 'wave') return html`<path d="M19.8 33.2q4.2 4.4 8.4 0z" fill=${INK} stroke=${INK} stroke-width="1.6" stroke-linejoin="round"/>`;
  if (mood === 'think') return html`<path d="M21.5 34.6h5" stroke=${INK} stroke-width="2.3" stroke-linecap="round"/>`;
  return html`<path d="M20.5 33.4q3.5 3 7 0" stroke=${INK} stroke-width="2.3" stroke-linecap="round" fill="none"/>`;
}
export function Mascot({ size = 32, mood = 'smile', class: cls = '', look = null }) {
  const right = mood === 'wave' ? 'M41.2 26.5q4.2-1.8 4.6-7.6' : 'M41.2 27.2q3 1.1 3.4 4.6';
  return html`<svg class=${`logo mascot m-${mood} ${cls}`} width=${size} height=${size} viewBox="0 0 48 48" aria-hidden="true">
    <g class="m-note" transform="rotate(-12 30 8)">
      <rect x="24" y="2.6" width="12" height="11" rx="1.6" fill="var(--m-note, #ffd84a)"/>
      <path d="M26.6 6.4h6.6M26.6 9.4h4.2" stroke="var(--m-note-ink, #d9a400)" stroke-width="1.3" stroke-linecap="round"/>
    </g>
    <path d="M6.8 27.2q-3 1.1-3.4 4.6" stroke="var(--m-deep, #2448c4)" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path class="m-arm" d=${right} stroke="var(--m-deep, #2448c4)" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <rect x="12.5" y="39.5" width="7.5" height="5.5" rx="2.6" fill="var(--m-deep, #2448c4)"/>
    <rect x="28" y="39.5" width="7.5" height="5.5" rx="2.6" fill="var(--m-deep, #2448c4)"/>
    <rect x="6" y="10" width="36" height="32" rx="9" fill="var(--m-body, #3f6df6)"/>
    <rect x="10" y="14" width="28" height="14.5" rx="5" fill="#fff" opacity=".2"/>
    <rect x="10" y="30.5" width="28" height="8" rx="4" fill="#fff" opacity=".2"/>
    <g class="m-eyes">${eyes(mood, look)}</g>
    ${mouth(mood)}
  </svg>`;
}
export const Logo = Mascot;

export function GoogleG() {
  return html`<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
}
