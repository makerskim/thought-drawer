// 입력칸(넣는 칸, 가운데 입력창)의 / 명령어 · # 태그 · @ 서랍 목록 (노션·옵시디언처럼)
// / 를 치면 명령어와 내 키워드, # 를 치면 태그, @ 를 치면 서랍. ↑↓로 고르고 Enter·Tab으로 넣는다.
import { html, useState, useRef, useLayoutEffect } from '../h.js';
import { Icon } from '../icons.js';
import { app } from '../state.js';
import { BUILTINS, matchSlash, triggerAt, applyInsert, fillVars } from '../../core/slash.js';
import { settingsOf, drawerTargets, tagCounts, categoryLook } from '../categories.js';

const LIMIT = 8;
const firstLine = (t) => String(t).split('\n').find((l) => l.trim())?.trim().slice(0, 40) ?? '';

// 내 키워드 + 기본 명령어 (설정·사용법 화면도 같은 목록을 쓴다)
export function slashCommands(lib) {
  const mine = settingsOf(lib).keywords.map((k) => ({ key: k.key, label: k.key, icon: 'sparkle', insert: k.text, desc: firstLine(fillVars(k.text)), mine: true }));
  const taken = new Set(mine.map((k) => k.key));
  return [...mine, ...BUILTINS.filter((b) => !taken.has(b.key))];
}

function itemsFor(trig, lib) {
  const q = trig.query.trim().toLowerCase();
  if (trig.char === '/') {
    const drawers = q ? drawerTargets(lib).filter((d) => d.toLowerCase().includes(q)).slice(0, 4)
      .map((d) => ({ key: d, label: `${d.replace('/', ' › ')} 서랍에 넣기`, icon: categoryLook(d.split('/')[0]).icon, insert: `@${d} `, drawer: true })) : [];
    return [...matchSlash(q, slashCommands(lib)), ...drawers].slice(0, LIMIT);
  }
  if (trig.char === '#') {
    const tags = tagCounts(lib).filter(([t]) => !q || t.toLowerCase().includes(q)).slice(0, LIMIT - 1)
      .map(([t, c]) => ({ key: t, label: `#${t}`, icon: 'tag', insert: `#${t} `, desc: `${c}개` }));
    if (q && !tags.some((t) => t.key.toLowerCase() === q)) tags.push({ key: trig.query, label: `새 태그 #${trig.query}`, icon: 'plus', insert: `#${trig.query} ` });
    return tags;
  }
  const list = drawerTargets(lib).filter((d) => !q || d.toLowerCase().includes(q))
    .sort((a, b) => (a.toLowerCase().startsWith(q) ? 0 : 1) - (b.toLowerCase().startsWith(q) ? 0 : 1) || a.split('/').length - b.split('/').length)
    .slice(0, LIMIT - 1)
    .map((d) => ({ key: d, label: d.replace('/', ' › '), icon: categoryLook(d.split('/')[0]).icon, insert: `@${d} ` }));
  if (q && !list.some((d) => d.key.toLowerCase() === q)) list.push({ key: trig.query, label: `새 서랍 「${trig.query}」`, icon: 'plus', insert: `@${trig.query} `, fresh: true });
  return list;
}

// { menu, allow, refresh(el), onKeyDown(e) → 처리했으면 true, view }
// onAction(name, text): 사진·붙여넣기·크게 쓰기 같은 동작
export function useSlash({ text, setText, ref, onAction }) {
  const [menu, setMenu] = useState(null); // { trig, items, idx }
  const [allow, setAllow] = useState([]); // 목록에서 고른 새 서랍
  const cur = useRef(null);
  cur.current = menu;
  // 고른 뒤 커서 자리: 다시 그린 직후 바로 옮긴다 (이어 치는 글자가 엉뚱한 곳에 들어가지 않게)
  const pending = useRef(null);
  useLayoutEffect(() => {
    const c = pending.current;
    const el = ref.current;
    if (!c || !el) return;
    pending.current = null;
    el.focus();
    el.setSelectionRange(c.caret, c.caret);
    refresh(c.text, c.caret); // # 나 @ 를 넣었으면 바로 다음 목록
  });

  const refresh = (value = ref.current?.value ?? '', caret = ref.current?.selectionStart ?? value.length) => {
    const trig = triggerAt(value, caret);
    if (!trig || !app.lib) { if (cur.current) setMenu(null); return; }
    const items = itemsFor(trig, app.lib);
    const prev = cur.current;
    setMenu(items.length ? { trig, items, idx: prev && prev.trig.char === trig.char && prev.trig.query === trig.query ? Math.min(prev.idx, items.length - 1) : 0 } : null);
  };

  const pick = (i) => {
    const m = cur.current;
    const it = m?.items[i];
    if (!it) return;
    setMenu(null);
    if (it.action) {
      const rest = text.slice(0, m.trig.start) + text.slice(m.trig.end);
      setText(rest);
      onAction?.(it.action, rest.trim());
      return;
    }
    if (it.fresh) setAllow((a) => [...new Set([...a, it.key])]);
    const next = applyInsert(text, m.trig, it.insert, { line: it.line });
    pending.current = next;
    setText(next.text);
  };

  const onKeyDown = (e) => {
    const m = cur.current;
    if (!m || e.isComposing || e.keyCode === 229) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMenu({ ...m, idx: (m.idx + 1) % m.items.length }); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMenu({ ...m, idx: (m.idx - 1 + m.items.length) % m.items.length }); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(m.idx); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(null); return true; }
    return false;
  };

  const head = { '/': '명령어', '#': '태그', '@': '서랍' };
  const view = menu && html`<div class="pop slash in-slash" role="listbox" aria-label=${head[menu.trig.char]}>
    <div class="mi-label">${head[menu.trig.char]}</div>
    ${menu.items.map((it, i) => html`<button type="button" key=${`${it.key}:${i}`} role="option" aria-selected=${i === menu.idx} class=${`mi${i === menu.idx ? ' on' : ''}`}
        onMouseDown=${(e) => e.preventDefault()} onMouseMove=${() => i !== menu.idx && setMenu({ ...menu, idx: i })} onClick=${() => pick(i)}>
      <${Icon} name=${it.icon} /><span class="mi-text"><span>${menu.trig.char === '/' && !it.drawer ? html`<b class="sl-key">/${it.key}</b> ${it.label !== it.key ? it.label : ''}` : it.label}</span>${it.desc && html`<small>${it.desc}</small>`}</span>
      ${it.mine && html`<span class="sub">내 키워드</span>`}
    </button>`)}
    <p class="sl-foot">↑↓ 고르기 · Enter 넣기 · <a href="#/settings?s=keywords" onMouseDown=${(e) => e.preventDefault()}>키워드 만들기</a></p>
  </div>`;
  return { menu, allow, refresh, onKeyDown, view, close: () => setMenu(null) };
}
