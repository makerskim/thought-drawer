// 인박스, 폴더, 태그 화면
import { html, useState } from '../h.js';
import { Icon } from '../icons.js';
import { useLib, usePref, toast } from '../state.js';
import { folderHref, go } from '../router.js';
import { Topbar, openAddMenu } from '../parts/shell.js';
import { NoteList, NoteRow, Empty } from '../parts/common.js';
import { popover, modal } from '../parts/layers.js';
import { FolderPicker, ConfirmDialog } from '../parts/dialogs.js';
import { categoryParts } from '../../core/note.js';
import { relTime } from '../format.js';

const SORTS = {
  updated: { label: '최근 수정', fn: (a, b) => (Date.parse(b.meta.updated || b.meta.created) || 0) - (Date.parse(a.meta.updated || a.meta.created) || 0) },
  created: { label: '만든 순', fn: (a, b) => b.id.localeCompare(a.id) },
  title: { label: '이름 순', fn: (a, b) => (a.meta.title || a.snippet || '').localeCompare(b.meta.title || b.snippet || '', 'ko') },
};

function ViewControls({ view, setView, sort, setSort }) {
  return html`<div class="toolbar">
    <div class="seg" role="group" aria-label="보기">
      ${[['list', 'list', '목록'], ['gallery', 'grid', '갤러리'], ['table', 'table', '표']].map(([v, ic, l]) => html`
        <button type="button" key=${v} aria-pressed=${view === v} onClick=${() => setView(v)}><${Icon} name=${ic} /><span class="hide-m">${l}</span></button>`)}
    </div>
    <span class="spacer"></span>
    <button type="button" class="btn btn-ghost" onClick=${(e) => popover(e.currentTarget, (close) => html`${Object.entries(SORTS).map(([k, s]) => html`
      <button type="button" key=${k} class=${`mi${k === sort ? ' on' : ''}`} onClick=${() => { setSort(k); close(); }}><span>${s.label}</span>${k === sort && html`<${Icon} name="check" class="sub" />`}</button>`)}`)}>
      <${Icon} name="arrowUpDown" />${SORTS[sort].label}
    </button>
  </div>`;
}

export function Inbox() {
  const lib = useLib();
  const items = lib.inbox();
  const last = lib.index?.generatedAt;
  const [sel, setSel] = useState(() => new Set());
  const chosen = items.filter((n) => sel.has(n.id));
  const toggle = (id, on) => setSel((prev) => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next; });
  const moveMany = (list, anchor) => popover(anchor, (close) => html`<${FolderPicker} close=${close} onPick=${async (p) => {
    if (!p) return;
    const t = toast(`${list.length}개를 옮기는 중`, { busy: true });
    try {
      for (const n of list) await lib.moveTo(lib.get(n.id) ?? n, p);
      setSel(new Set());
      t.update(`${list.length}개를 ${categoryParts(p).join(' / ')}에 넣었어요.`, { action: '폴더 열기', onAction: () => go(folderHref(p)) });
    } catch (e) { t.update(e.message, { duration: 6000 }); }
  }} />`, { width: 300 });
  const removeMany = (list) => modal((close) => html`<${ConfirmDialog} close=${close} danger yes="지우기"
    title=${`${list.length}개를 지울까요?`} text="구글 드라이브 휴지통으로 옮겨요. 30일 안에는 되살릴 수 있어요."
    onYes=${async () => {
      const undos = [];
      try { for (const n of list) undos.push(await lib.remove(n)); } catch (e) { toast(e.message); }
      setSel(new Set());
      toast(`${undos.length}개를 지웠어요.`, { action: '되돌리기', duration: 6000, onAction: async () => { for (const u of undos) await u(); } });
    }} />`);
  return html`
    <${Topbar} crumbs=${[{ label: '인박스' }]} />
    <div class="page narrow">
      <div class="page-head"><${Icon} name="inbox" class="icon-lg" /><h1>인박스</h1>
        <p>새로 넣은 노트가 여기서 정리를 기다려요. Claude가 하루 몇 번 제목, 요약, 태그를 붙여 폴더에 넣고 관련 노트끼리 이어 줘요.${last ? ` 마지막 정리는 ${relTime(last)}이에요.` : ''}</p>
      </div>
      ${items.length > 0 && html`<div class=${`bulkbar${chosen.length ? ' on' : ''}`}>
        <label class="pick-all"><input type="checkbox" checked=${chosen.length === items.length} indeterminate=${chosen.length > 0 && chosen.length < items.length}
          onChange=${(e) => setSel(e.target.checked ? new Set(items.map((n) => n.id)) : new Set())} aria-label="모두 고르기" />
          <span>${chosen.length ? `${chosen.length}개 고름` : `${items.length}개`}</span></label>
        ${chosen.length > 0 && html`
          <button type="button" class="btn" onClick=${(e) => moveMany(chosen, e.currentTarget)}><${Icon} name="folder" />폴더로 옮기기</button>
          <button type="button" class="btn btn-ghost btn-danger" onClick=${() => removeMany(chosen)}><${Icon} name="trash" />지우기</button>
          <button type="button" class="btn btn-ghost" onClick=${() => setSel(new Set())}>고르기 취소</button>`}
      </div>`}
      ${items.length
        ? html`<div class="rows">${items.map((n) => html`<${NoteRow} key=${n.id} note=${n} selectable selected=${sel.has(n.id)} onSelect=${(on) => toggle(n.id, on)} right=${html`
            <span class="num hide-m">${relTime(n.meta.created)}</span>
            <button type="button" class="btn btn-ghost act" onClick=${(e) => moveMany([n], e.currentTarget)}><${Icon} name="folder" /><span class="hide-m">폴더 지정</span></button>`} />`)}</div>`
        : html`<${Empty} icon="check" title="모두 정리됐어요" text="새로 넣은 노트는 여기서 정리를 기다려요.">
            <button type="button" class="btn" onClick=${(e) => openAddMenu(e.currentTarget)}><${Icon} name="plus" />노트 넣기</button>
          </${Empty}>`}
    </div>`;
}

export function Folder({ path }) {
  const lib = useLib();
  const [view, setView] = usePref('view', 'list');
  const [sort, setSort] = usePref('sort', 'updated');
  const parts = categoryParts(path);
  const node = (function find(list) {
    for (const f of list) { if (f.path === path) return f; const x = find(f.children); if (x) return x; }
    return null;
  })(lib.folders());
  const notes = lib.inFolder(path).sort(SORTS[sort]?.fn ?? SORTS.updated.fn);
  const crumbs = parts.map((p, i) => ({ label: p, href: folderHref(parts.slice(0, i + 1).join('/')) }));
  return html`
    <${Topbar} crumbs=${crumbs} />
    <div class="page">
      <div class="page-head"><${Icon} name="folder" class="icon-lg" /><h1>${parts.at(-1)}</h1><p>노트 ${notes.length}개</p></div>
      ${node?.children.length > 0 && html`<div class="chips" style="margin-bottom:18px">${node.children.map((c) => html`
        <a class="chip" key=${c.path} href=${folderHref(c.path)}><${Icon} name="folder" />${c.name}<span class="n">${c.count}</span></a>`)}</div>`}
      <${ViewControls} view=${view} setView=${setView} sort=${sort} setSort=${setSort} />
      ${notes.length
        ? html`<${NoteList} notes=${notes} view=${view} showFolder=${!!node?.children.length} />`
        : html`<${Empty} icon="folder" title="빈 폴더예요" text="이 폴더에 맞는 노트가 들어오면 여기에 보여요." />`}
    </div>`;
}

export function TagView({ tag }) {
  const lib = useLib();
  const [view, setView] = usePref('view', 'list');
  const [sort, setSort] = usePref('sort', 'updated');
  const notes = lib.all.filter((n) => (n.meta.tags ?? []).includes(tag)).sort(SORTS[sort]?.fn ?? SORTS.updated.fn);
  return html`
    <${Topbar} crumbs=${[{ label: '태그' }, { label: `#${tag}` }]} />
    <div class="page">
      <div class="page-head"><${Icon} name="tag" class="icon-lg" /><h1>#${tag}</h1><p>노트 ${notes.length}개</p></div>
      <${ViewControls} view=${view} setView=${setView} sort=${sort} setSort=${setSort} />
      ${notes.length ? html`<${NoteList} notes=${notes} view=${view} />` : html`<${Empty} icon="tag" title="이 태그가 붙은 노트가 없어요" />`}
    </div>`;
}

export function NotFound() {
  return html`<${Topbar} crumbs=${[{ label: '찾을 수 없음' }]} />
    <div class="page narrow"><${Empty} icon="alert" title="없는 페이지예요" text="지워졌거나 주소가 바뀌었어요.">
      <button type="button" class="btn" onClick=${() => go('#/')}>홈으로</button></${Empty}></div>`;
}
