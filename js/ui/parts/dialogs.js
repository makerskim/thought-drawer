// 검색 팔레트, 폴더 고르기, 링크 넣기, 사진 크게 보기
import { html, useState, useMemo, useRef, useEffect, useFocus } from '../h.js';
import { Icon, TYPE_ICON } from '../icons.js';
import { app, toast } from '../state.js';
import { go, noteHref, folderHref, tagHref } from '../router.js';
import { useListNav } from './layers.js';
import { titleOf, folderLabel, highlighter } from './common.js';
import { search, parseQuery } from '../../core/search.js';
import { categoryParts } from '../../core/note.js';
import { modKey } from '../format.js';

const ACTIONS = [
  { icon: 'plus', label: '새 노트', run: () => go('#/new') },
  { icon: 'capture', label: '사진·캡처 넣기', run: () => app.pickPhotos() },
  { icon: 'link', label: '링크 넣기', run: () => app.openLinkDialog() },
  { icon: 'inbox', label: '인박스', run: () => go('#/inbox') },
  { icon: 'ask', label: '묻기', run: () => go('#/ask') },
  { icon: 'graph', label: '그래프', run: () => go('#/graph') },
  { icon: 'instagram', label: '인스타 저장함 가져오기', run: () => go('#/import') },
  { icon: 'gear', label: '설정', run: () => go('#/settings') },
];

function buildItems(q) {
  const lib = app.lib;
  const out = [];
  const query = q.trim();
  if (!query) {
    const recent = lib.recent(6);
    if (recent.length) {
      out.push({ section: '최근 노트' });
      recent.forEach((n) => out.push({ icon: TYPE_ICON[n.meta.type] ?? 'memo', label: titleOf(n), sub: folderLabel(n), run: () => go(noteHref(n.id)) }));
    }
    out.push({ section: '바로 가기' });
    ACTIONS.forEach((a) => out.push(a));
    return { items: out, terms: [] };
  }
  const pq = parseQuery(query);
  const hits = search(lib.all, pq, { limit: 8 });
  if (hits.length) {
    out.push({ section: '노트' });
    hits.forEach(({ note }) => out.push({ icon: TYPE_ICON[note.meta.type] ?? 'memo', label: titleOf(note), detail: note.meta.summary || note.snippet, sub: folderLabel(note), run: () => go(noteHref(note.id)) }));
  }
  const ql = query.toLowerCase().replace(/^#/, '');
  const folders = lib.folderPaths().filter((p) => p.toLowerCase().includes(ql)).slice(0, 4);
  const tags = lib.tags().filter(([t]) => t.toLowerCase().includes(ql)).slice(0, 4);
  if (folders.length || tags.length) {
    out.push({ section: '폴더와 태그' });
    folders.forEach((p) => out.push({ icon: 'folder', label: categoryParts(p).join(' / '), run: () => go(folderHref(p)) }));
    tags.forEach(([t, n]) => out.push({ icon: 'tag', label: `#${t}`, sub: `${n}개`, run: () => go(tagHref(t)) }));
  }
  out.push({ section: '할 일' });
  out.push({ icon: 'ask', label: `“${query}” 물어보기`, sub: '관련 노트 모아 보기', run: () => go(`#/ask?q=${encodeURIComponent(query)}`) });
  out.push({ icon: 'plus', label: `“${query}”(으)로 새 노트`, run: () => go(`#/new?title=${encodeURIComponent(query)}`) });
  ACTIONS.filter((a) => a.label.includes(query)).forEach((a) => out.push(a));
  return { items: out, terms: pq.terms };
}

export function Palette({ close }) {
  const [q, setQ] = useState('');
  const { items, terms } = useMemo(() => buildItems(q), [q]);
  const pickable = items.filter((x) => !x.section);
  const run = (i) => { const it = pickable[i]; if (!it) return; close(); it.run(); };
  const [idx, setIdx, onKeyDown] = useListNav(pickable.length, run, [q]);
  const listRef = useRef();
  useEffect(() => { listRef.current?.querySelector('.mi.on')?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  const hl = highlighter(terms);
  const inputRef = useFocus();
  let k = -1;
  return html`<div class="palette" role="dialog" aria-label="검색">
    <div class="p-input"><${Icon} name="search" />
      <input ref=${inputRef} value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown}
        placeholder="노트, 폴더, 태그 검색 또는 질문" aria-label="검색어" autocomplete="off" />
      <kbd class="hide-m">esc</kbd>
    </div>
    <div class="p-list" ref=${listRef} role="listbox">
      ${items.map((it, i) => {
        if (it.section) return html`<div class="mi-label" key=${`s${i}`}>${it.section}</div>`;
        k += 1;
        const me = k;
        return html`<button type="button" key=${`i${i}`} role="option" aria-selected=${me === idx} class=${`mi${me === idx ? ' on' : ''}`}
          onMouseMove=${() => idx !== me && setIdx(me)} onClick=${() => run(me)}>
          <${Icon} name=${it.icon} />
          <span class="mi-text"><span>${hl ? hl(it.label) : it.label}</span>${it.detail && html`<small>${hl ? hl(it.detail) : it.detail}</small>`}</span>
          ${it.sub && html`<span class="sub">${it.sub}</span>`}
        </button>`;
      })}
    </div>
    <div class="p-foot hide-m"><span>↑↓ 이동</span><span>↵ 열기</span><span>${modKey} K 열고 닫기</span><span>#태그, 폴더:이름으로 좁히기</span></div>
  </div>`;
}

// 폴더 고르기 (팝오버 안)
export function FolderPicker({ current, onPick, close }) {
  const [q, setQ] = useState('');
  const all = app.lib.folderPaths();
  const ql = q.trim();
  const list = all.filter((p) => p.toLowerCase().includes(ql.toLowerCase()));
  const clean = categoryParts(ql).slice(0, 2).join('/');
  const inbox = { label: '인박스에 두기', sub: 'Claude가 정해요', icon: 'inbox', value: '' };
  const folders = list.map((p) => ({ label: categoryParts(p).join(' / '), icon: 'folder', value: p, on: p === current }));
  const create = clean && !all.includes(clean) ? [{ label: `새 폴더 “${clean}”`, icon: 'plus', value: clean }] : [];
  // 무언가 입력했으면 맞는 폴더(또는 새 폴더)가 먼저, 아니면 인박스가 먼저
  const options = ql ? [...folders, ...create, inbox] : [inbox, ...folders];
  const pick = (i) => { const o = options[i]; if (!o) return; close(); onPick(o.value); };
  const [idx, setIdx, onKeyDown] = useListNav(options.length, pick, [q]);
  const inputRef = useFocus();
  return html`
    <div class="pop-search"><input ref=${inputRef} value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown} placeholder="폴더 찾기 또는 새로 만들기" aria-label="폴더 이름" /></div>
    <div class="pop-list">${options.map((o, i) => html`<button type="button" key=${o.label} class=${`mi${i === idx ? ' on' : ''}`} onMouseMove=${() => setIdx(i)} onClick=${() => pick(i)}>
      <${Icon} name=${o.icon} /><span>${o.label}</span>${o.on ? html`<${Icon} name="check" class="sub" />` : o.sub && html`<span class="sub">${o.sub}</span>`}
    </button>`)}</div>
    <div class="muted" style="font-size:11.5px;padding:6px 8px 2px">“큰 폴더/작은 폴더”처럼 빗금으로 나눠요.</div>`;
}

export function LinkDialog({ close }) {
  const [url, setUrl] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const urlRef = useFocus();
  const submit = async (e) => {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) { toast('https:// 로 시작하는 주소를 넣어 주세요.'); return; }
    setBusy(true);
    try {
      const n = await app.lib.addLink(u, memo);
      close();
      toast('인박스에 저장했어요.', { action: '열기', onAction: () => go(noteHref(n.id)) });
    } catch (err) { setBusy(false); toast(err.message); }
  };
  return html`<form class="modal" onSubmit=${submit}>
    <h2>링크 저장</h2>
    <p class="desc">페이지 내용은 다음 정리 때 Claude가 읽고 요약해요. 인스타 주소면 캡션을 읽어요.</p>
    <label class="field"><span>주소</span><input class="input" ref=${urlRef} type="url" inputmode="url" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="https://" required /></label>
    <label class="field"><span>메모</span><input class="input" value=${memo} onInput=${(e) => setMemo(e.target.value)} placeholder="왜 저장하는지 한 줄 (선택)" /></label>
    <div class="actions"><button type="button" class="btn btn-ghost" onClick=${close}>취소</button><button class="btn btn-primary" disabled=${busy}>저장</button></div>
  </form>`;
}

export function Lightbox({ src, close }) {
  return html`<div class="lightbox" onClick=${close} role="dialog" aria-label="사진 크게 보기"><img src=${src} alt="첨부한 사진" /></div>`;
}

export function ConfirmDialog({ title, text, yes = '확인', danger, onYes, close }) {
  const yesRef = useFocus();
  return html`<div class="modal" role="alertdialog" aria-label=${title}>
    <h2>${title}</h2>${text && html`<p class="desc">${text}</p>`}
    <div class="actions"><button type="button" class="btn btn-ghost" onClick=${close}>취소</button>
    <button type="button" ref=${yesRef} class=${`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick=${() => { close(); onYes(); }}>${yes}</button></div>
  </div>`;
}
