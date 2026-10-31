// 폴더 고르기, 사진 크게 보기, 확인 창
import { html, useState, useFocus } from '../h.js';
import { Icon } from '../icons.js';
import { app } from '../state.js';
import { useListNav } from './layers.js';
import { categoryParts } from '../../core/note.js';
import { drawerNames } from '../categories.js';

// 서랍 고르기 (팝오버 안): 있는 폴더와 기본 서랍, 또는 새로 만들기
export function FolderPicker({ current, onPick, close }) {
  const [q, setQ] = useState('');
  const all = drawerNames(app.lib);
  const ql = q.trim();
  const list = all.filter((p) => p.toLowerCase().includes(ql.toLowerCase()));
  const clean = categoryParts(ql).slice(0, 2).join('/');
  const inbox = { label: '자동 분류에 맡기기', sub: '앱이 정해요', icon: 'sparkle', value: '' };
  const folders = list.map((p) => ({ label: categoryParts(p).join(' / '), icon: 'folder', value: p, on: p === current }));
  const create = clean && !all.includes(clean) ? [{ label: `새 서랍 “${clean}”`, icon: 'plus', value: clean }] : [];
  // 무언가 입력했으면 맞는 서랍(또는 새 서랍)이 먼저, 아니면 「자동 분류에 맡기기」가 먼저
  const options = ql ? [...folders, ...create, inbox] : [inbox, ...folders];
  const pick = (i) => { const o = options[i]; if (!o) return; close(); onPick(o.value); };
  const [idx, setIdx, onKeyDown] = useListNav(options.length, pick, [q]);
  const inputRef = useFocus();
  return html`
    <div class="pop-search"><input ref=${inputRef} value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKeyDown} placeholder="서랍 찾기 또는 새로 만들기" aria-label="서랍 이름" /></div>
    <div class="pop-list">${options.map((o, i) => html`<button type="button" key=${o.label} class=${`mi${i === idx ? ' on' : ''}`} onMouseMove=${() => setIdx(i)} onClick=${() => pick(i)}>
      <${Icon} name=${o.icon} /><span>${o.label}</span>${o.on ? html`<${Icon} name="check" class="sub" />` : o.sub && html`<span class="sub">${o.sub}</span>`}
    </button>`)}</div>
    <div class="muted" style="font-size:11.5px;padding:6px 8px 2px">“큰 서랍/작은 서랍”처럼 빗금으로 나눠요.</div>`;
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

