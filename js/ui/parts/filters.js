// 필터 막대: 날짜 · 종류 · 서랍 · 태그 · 사이트 · 조건. 고른 값은 주소에 담긴다 (core/filter.js).
import { html, useState, cx } from '../h.js';
import { Icon, TYPE_ICON } from '../icons.js';
import { popover } from './layers.js';
import { DATES, HAS, BASIS, facets, activeCount, dateLabel, readFilter, writeFilter, ymd } from '../../core/filter.js';
import { parse, go } from '../router.js';
import { categoryLook } from '../categories.js';

export const TYPE_LABEL = [['memo', '메모'], ['bookmark', '링크'], ['capture', '사진'], ['instagram', '인스타'], ['map', '지도']];
const typeName = (k) => TYPE_LABEL.find(([t]) => t === k)?.[1] ?? k;
const hasName = (k) => HAS.find(([h]) => h === k)?.[1] ?? k;

// 지금 주소의 필터를 고친다 (뒤로 가기에 쌓지 않음)
export function setFilter(patch) {
  const { path, params } = parse();
  const f = { ...readFilter(params), ...patch };
  go(`#${path}${writeFilter(f, { q: params.get('q') ?? '' })}`, { replace: true });
}
export const clearFilters = () => setFilter({ d: '', from: '', to: '', on: 'created', type: [], dr: '', tag: [], site: '', has: [] });

function Check({ on }) { return html`<span class=${cx('fchk', on && 'on')} aria-hidden="true">${on && html`<${Icon} name="check" />`}</span>`; }

function DatePop({ f, close }) {
  const [on, setOn] = useState(f.on);
  const [from, setFrom] = useState(f.from || ymd(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(f.to || ymd(new Date()));
  const [custom, setCustom] = useState(f.d === 'custom');
  return html`<div class="fpop">
    <div class="seg fseg" role="group" aria-label="기준">${BASIS.map(([k, l]) => html`<button type="button" key=${k} aria-pressed=${on === k}
      onClick=${() => { setOn(k); if (f.d) setFilter({ on: k }); }}>${l}</button>`)}</div>
    <div class="fopts">${DATES.map(([k, l]) => html`<button type="button" key=${k} class=${cx('fopt', (k === 'custom' ? custom : f.d === k) && 'on')}
      onClick=${() => { if (k === 'custom') { setCustom(true); return; } setFilter({ d: k, on }); close(); }}>${l}</button>`)}</div>
    ${custom && html`<form class="frange" onSubmit=${(e) => { e.preventDefault(); setFilter({ d: 'custom', from, to, on }); close(); }}>
      <label><span>부터</span><input type="date" class="input" value=${from} max=${to} onInput=${(e) => setFrom(e.target.value)} /></label>
      <label><span>까지</span><input type="date" class="input" value=${to} min=${from} onInput=${(e) => setTo(e.target.value)} /></label>
      <button class="btn btn-primary">적용</button>
    </form>`}
    ${f.d && html`<button type="button" class="btn btn-ghost fclear" onClick=${() => { setFilter({ d: '', from: '', to: '' }); close(); }}>날짜 지우기</button>`}
  </div>`;
}

// 여러 개 고르기 (종류, 태그, 조건): 누를 때마다 바로 걸러진다
function MultiPop({ field, f, options, search }) {
  const [sel, setSel] = useState(() => new Set(f[field]));
  const [q, setQ] = useState('');
  const list = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const toggle = (v) => {
    const next = new Set(sel);
    next.has(v) ? next.delete(v) : next.add(v);
    setSel(next);
    setFilter({ [field]: [...next] });
  };
  return html`<div class="fpop">
    ${search && html`<div class="pop-search"><input autofocus value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${search} aria-label=${search} /></div>`}
    <div class="pop-list">${list.length ? list.slice(0, 80).map((o) => html`<button type="button" key=${o.value} class="mi" role="menuitemcheckbox" aria-checked=${sel.has(o.value)} onClick=${() => toggle(o.value)}>
      <${Check} on=${sel.has(o.value)} />${o.icon && html`<${Icon} name=${o.icon} />`}<span>${o.label}</span><span class="sub">${o.count ?? ''}</span></button>`)
      : html`<p class="mi-label">없음</p>`}</div>
    ${sel.size > 0 && html`<button type="button" class="btn btn-ghost fclear" onClick=${() => { setSel(new Set()); setFilter({ [field]: [] }); }}>모두 풀기</button>`}
  </div>`;
}

// 하나 고르기 (서랍, 사이트)
function OnePop({ field, f, options, close, search }) {
  const [q, setQ] = useState('');
  const list = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return html`<div class="fpop">
    ${search && html`<div class="pop-search"><input autofocus value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${search} aria-label=${search} /></div>`}
    <div class="pop-list">${list.length ? list.slice(0, 80).map((o) => html`<button type="button" key=${o.value} class=${cx('mi', o.child && 'mi-child')} role="menuitemradio" aria-checked=${f[field] === o.value}
      onClick=${() => { setFilter({ [field]: f[field] === o.value ? '' : o.value }); close(); }}>
      <${Check} on=${f[field] === o.value} />${o.icon && html`<${Icon} name=${o.icon} />`}<span>${o.label}</span><span class="sub">${o.count ?? ''}</span></button>`)
      : html`<p class="mi-label">없음</p>`}</div>
  </div>`;
}

// notes: 이 화면의 노트 전체(필터 전), ctx: { cat, tags }, drawer: 서랍 화면이면 서랍 고르기는 숨긴다
export function FilterBar({ notes, f, ctx, drawer = false }) {
  const fx = facets(notes, ctx);
  const drawers = [...fx.drawers].filter(([k]) => !k.includes('/')).sort((a, b) => b[1] - a[1])
    .flatMap(([top, c]) => [{ value: top, label: top, count: c, icon: categoryLook(top).icon },
      ...[...fx.drawers].filter(([k]) => k.startsWith(`${top}/`)).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: k.split('/')[1], count: n, child: true }))]);
  const pills = [
    { key: 'd', icon: 'calendar', label: f.d ? dateLabel(f) + (f.on === 'updated' ? ' 고침' : '') : '날짜', on: !!f.d,
      open: (a) => popover(a, (close) => html`<${DatePop} f=${f} close=${close} />`, { width: 300 }), clear: { d: '', from: '', to: '' } },
    { key: 'type', icon: 'memo', label: f.type.length ? f.type.map(typeName).join(', ') : '종류', on: f.type.length > 0,
      open: (a) => popover(a, () => html`<${MultiPop} field="type" f=${f} options=${TYPE_LABEL.filter(([k]) => fx.types.get(k) || f.type.includes(k)).map(([k, l]) => ({ value: k, label: l, icon: TYPE_ICON[k], count: fx.types.get(k) ?? 0 }))} />`, { width: 240 }), clear: { type: [] } },
    !drawer && { key: 'dr', icon: 'drawer', label: f.dr ? f.dr.replace('/', ' › ') : '서랍', on: !!f.dr,
      open: (a) => popover(a, (close) => html`<${OnePop} field="dr" f=${f} close=${close} options=${drawers} search=${drawers.length > 12 ? '서랍 찾기' : ''} />`, { width: 260 }), clear: { dr: '' } },
    { key: 'tag', icon: 'tag', label: f.tag.length ? `#${f.tag[0]}${f.tag.length > 1 ? ` 외 ${f.tag.length - 1}` : ''}` : '태그', on: f.tag.length > 0,
      open: (a) => popover(a, () => html`<${MultiPop} field="tag" f=${f} search="태그 찾기" options=${[...new Set([...f.tag, ...fx.tags.map(([t]) => t)])].map((t) => ({ value: t, label: `#${t}`, count: fx.tags.find(([x]) => x === t)?.[1] ?? 0 }))} />`, { width: 260 }), clear: { tag: [] } },
    fx.sites.length > 0 && { key: 'site', icon: 'globe', label: f.site || '사이트', on: !!f.site,
      open: (a) => popover(a, (close) => html`<${OnePop} field="site" f=${f} close=${close} search=${fx.sites.length > 12 ? '사이트 찾기' : ''} options=${fx.sites.map(([h, c]) => ({ value: h, label: h, count: c }))} />`, { width: 260 }), clear: { site: '' } },
    { key: 'has', icon: 'check', label: f.has.length ? f.has.map(hasName).join(', ') : '조건', on: f.has.length > 0,
      open: (a) => popover(a, () => html`<${MultiPop} field="has" f=${f} options=${HAS.map(([k, l]) => ({ value: k, label: l, count: fx.has.get(k) ?? 0 }))} />`, { width: 240 }), clear: { has: [] } },
  ].filter(Boolean);
  const n = activeCount(f);
  return html`<div class="fbar" role="toolbar" aria-label="필터">
    ${pills.map((p) => html`<span class=${cx('fpill-w', p.on && 'on')} key=${p.key}>
      <button type="button" class="fpill" data-f=${p.key} aria-haspopup="menu" aria-expanded="false" onClick=${(e) => p.open(e.currentTarget)}>
        <${Icon} name=${p.icon} /><span>${p.label}</span>${!p.on && html`<${Icon} name="down" />`}</button>
      ${p.on && html`<button type="button" class="fpill-x" aria-label=${`${p.label} 풀기`} onClick=${() => setFilter(p.clear)}><${Icon} name="x" /></button>`}
    </span>`)}
    ${n > 1 && html`<button type="button" class="fbar-clear" onClick=${clearFilters}>모두 지우기</button>`}
  </div>`;
}
