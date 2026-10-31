// 노트 본문 편집기 (TipTap). 쓰는 그대로 보이고, 저장은 마크다운으로 한다.
// - "# " 제목, "- " 목록, "[] " 할 일, "> " 인용 같은 입력 규칙
// - 글자를 고르면 서식 막대, 빈 줄에서 "/" 를 치면 블록 메뉴, "[[" 를 치면 노트 잇기
import { html, useEffect, useRef, useState } from './h.js';
import { Icon, TYPE_ICON } from './icons.js';
import { app, toast } from './state.js';
import { go, noteHref } from './router.js';
import { toEditorMarkdown, fromEditorMarkdown, WIKI, ATT } from '../core/wiki.js';
import { search } from '../core/search.js';
import { displayTitle } from '../core/note.js';
import { fillVars, takeTokens, matchSlash } from '../core/slash.js';
import { settingsOf, drawerTargets } from './categories.js';

let bundle;
const loadBundle = () => (bundle ??= import('../vendor/editor.bundle.js'));
// 앱이 쉴 때 미리 받아 두면 노트를 처음 열 때 바로 쓸 수 있다
export const preloadEditor = () => loadBundle().catch(() => { bundle = null; });

const BLOCKS = [
  { key: 'h1', icon: 'type', label: '큰 제목', hint: '#', run: (c) => c.toggleHeading({ level: 1 }) },
  { key: 'h2', icon: 'type', label: '중간 제목', hint: '##', run: (c) => c.toggleHeading({ level: 2 }) },
  { key: 'h3', icon: 'type', label: '작은 제목', hint: '###', run: (c) => c.toggleHeading({ level: 3 }) },
  { key: 'ul', icon: 'list', label: '글머리 목록', hint: '-', run: (c) => c.toggleBulletList() },
  { key: 'ol', icon: 'list', label: '번호 목록', hint: '1.', run: (c) => c.toggleOrderedList() },
  { key: 'todo', icon: 'check', label: '할 일 목록', hint: '[]', run: (c) => c.toggleTaskList() },
  { key: 'quote', icon: 'thought', label: '인용', hint: '>', run: (c) => c.toggleBlockquote() },
  { key: 'code', icon: 'memo', label: '코드', hint: '```', run: (c) => c.toggleCodeBlock() },
  { key: 'hr', icon: 'menu', label: '구분선', hint: '---', run: (c) => c.setHorizontalRule() },
  { key: 'photo', icon: 'capture', label: '사진 넣기', special: 'photo' },
  { key: 'link', icon: 'connect', label: '다른 노트 잇기', hint: '[[', special: 'link' },
];

// 날짜·시각과 내 키워드 (설정 → / 명령어)도 같은 목록에
const STAMPS = [
  { key: '오늘', alias: ['today', '날짜'], icon: 'calendar', label: '오늘 날짜', text: '{오늘}' },
  { key: '내일', alias: ['tomorrow'], icon: 'calendar', label: '내일 날짜', text: '{내일}' },
  { key: '지금', alias: ['now', '시간'], icon: 'clock', label: '지금 시각', text: '{지금}' },
];
const KO = { h1: ['제목1', '큰제목'], h2: ['제목2'], h3: ['제목3'], ul: ['목록', '글머리'], ol: ['번호'], todo: ['할일', '체크'], quote: ['인용'], code: ['코드'], hr: ['구분선', '줄'], photo: ['사진', '이미지'], link: ['잇기', '연결'] };
function matchBlocks(q) {
  const mine = app.lib ? settingsOf(app.lib).keywords.map((k) => ({ key: k.key, icon: 'sparkle', label: k.key, hint: '내 키워드', text: k.text, mine: true })) : [];
  const all = [...BLOCKS.map((b) => ({ ...b, alias: KO[b.key] ?? [] })), ...STAMPS, ...mine];
  return matchSlash(q, all).slice(0, 24);
}

function matchNotes(q, selfId) {
  const lib = app.lib;
  const list = q.trim() ? search(lib.all, q, { limit: 8 }).map((r) => r.note) : lib.recent(8);
  return list.filter((n) => n.id !== selfId).slice(0, 7);
}

// 파일에 쓸 때의 규칙: 사진은 한 블록(앞뒤 빈 줄), 줄바꿈은 그냥 줄바꿈 (\ 없이)
export function fileRules(Image, HardBreak) {
  const Attachment = Image.extend({
    addStorage() {
      return {
        markdown: {
          serialize(state, node) {
            state.write(`![${state.esc(node.attrs.alt ?? '')}](${node.attrs.src})`);
            state.closeBlock(node);
          },
          parse: {},
        },
      };
    },
  });
  const LineBreak = HardBreak.extend({
    addStorage() {
      return {
        markdown: {
          serialize(state, node, parent, index) {
            for (let i = index + 1; i < parent.childCount; i++) {
              if (parent.child(i).type !== node.type) { state.write('\n'); return; }
            }
          },
          parse: {},
        },
      };
    },
  });
  return { Attachment, LineBreak };
}

// 노트 화면에 쓰는 편집기. key를 노트마다 달리 줘서 다시 만든다.
export function NoteEditor({ value, onChange, onImage, noteId, placeholder, editorRef, onReady, onTokens }) {
  const host = useRef();
  const ed = useRef(null);
  const [ready, setReady] = useState(false);
  const [bubble, setBubble] = useState(null); // { x, y } 고른 글자 위 서식 막대
  const [menu, setMenu] = useState(null); // { kind: 'block' | 'link', x, y, query, from, items, idx }
  const menuRef = useRef(null);
  menuRef.current = menu;
  const lastOut = useRef(null);
  const change = useRef(onChange);
  change.current = onChange;
  const self = useRef(noteId); // 새 노트는 처음 저장할 때 번호가 생긴다
  self.current = noteId;

  // 편집기 만들기
  useEffect(() => {
    let alive = true;
    loadBundle().then(({ Editor, StarterKit, Placeholder, Link, Image, HardBreak, TaskList, TaskItem, Markdown }) => {
      if (!alive) return;
      const { Attachment, LineBreak } = fileRules(Image, HardBreak);
      const AttachmentView = Attachment.extend({
        addNodeView() {
          return ({ node }) => {
            const wrap = document.createElement('figure');
            wrap.className = 'att';
            wrap.contentEditable = 'false';
            const src = String(node.attrs.src ?? '');
            const img = document.createElement('img');
            img.alt = node.attrs.alt ?? '';
            img.draggable = false;
            if (src.startsWith(ATT)) {
              app.lib.attachmentUrl(decodeURIComponent(src.slice(ATT.length))).then((u) => { if (u) img.src = u; }).catch(() => {});
            } else {
              img.src = src;
            }
            img.addEventListener('click', () => img.src && onImage?.(img.src));
            wrap.append(img);
            return { dom: wrap };
          };
        },
      });
      const editor = new Editor({
        element: host.current,
        extensions: [
          StarterKit.configure({ heading: { levels: [1, 2, 3] }, hardBreak: false }),
          LineBreak,
          Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? '제목' : placeholder), showOnlyCurrent: true }),
          Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ['td-wiki'], HTMLAttributes: { rel: 'noopener', target: null } }),
          AttachmentView.configure({ inline: false, allowBase64: false }),
          TaskList,
          TaskItem.configure({ nested: true }),
          Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: false, breaks: true, transformPastedText: true }),
        ],
        content: toEditorMarkdown(value),
        editorProps: {
          attributes: { class: 'prose editor-pm', 'aria-label': '본문', role: 'textbox', 'aria-multiline': 'true' },
          handleKeyDown: (_, e) => {
            const m = menuRef.current;
            if (!m || !m.items.length) return false;
            if (e.key === 'ArrowDown') { setMenu({ ...m, idx: (m.idx + 1) % m.items.length }); return true; }
            if (e.key === 'ArrowUp') { setMenu({ ...m, idx: (m.idx - 1 + m.items.length) % m.items.length }); return true; }
            if (e.key === 'Enter' || e.key === 'Tab') { pick(m, m.idx); return true; }
            if (e.key === 'Escape') { setMenu(null); return true; }
            return false;
          },
          handleClick: (view, pos, e) => {
            const a = e.target.closest?.('a[href]');
            if (!a) return false;
            const href = a.getAttribute('href');
            if (href.startsWith(WIKI)) {
              const target = decodeURIComponent(href.slice(WIKI.length));
              const id = /^(\d{14})/.exec(target)?.[1];
              const hit = id ? app.lib.get(id) : app.lib.all.find((n) => n.meta.title === target);
              if (hit) { go(noteHref(hit.id)); return true; }
              return false;
            }
            if (/^https?:/.test(href) && (e.metaKey || e.ctrlKey || !view.hasFocus())) { window.open(href, '_blank', 'noopener'); return true; }
            return false;
          },
          handlePaste: (_, e) => {
            const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length) return false;
            insertPhotos(files);
            return true;
          },
          handleDrop: (_, e) => {
            const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length) return false;
            e.preventDefault();
            insertPhotos(files);
            return true;
          },
        },
        onUpdate: ({ editor: e }) => {
          const out = fromEditorMarkdown(e.storage.markdown.getMarkdown());
          lastOut.current = out;
          change.current(out);
          updateMenu(e);
        },
        onSelectionUpdate: ({ editor: e }) => { updateBubble(e); updateMenu(e); },
        onBlur: () => setTimeout(() => {
          const a = document.activeElement;
          if (!host.current?.contains(a) && !a?.closest?.('.bubble')) { setBubble(null); setMenu(null); setLinkEdit(null); }
        }, 150),
      });
      ed.current = editor;
      lastOut.current = fromEditorMarkdown(editor.storage.markdown.getMarkdown());
      if (editorRef) editorRef.current = editor;
      setReady(true);
      onReady?.(editor);
    });
    return () => { alive = false; ed.current?.destroy(); ed.current = null; if (editorRef) editorRef.current = null; };
  }, []);

  // 다른 기기에서 바뀐 내용 받기 (내가 방금 쓴 값이면 무시)
  useEffect(() => {
    const e = ed.current;
    if (!e || value === lastOut.current || e.isFocused) return;
    e.commands.setContent(toEditorMarkdown(value), false);
    lastOut.current = value;
  }, [value]);

  function updateBubble(e) {
    const { from, to, empty } = e.state.selection;
    if (empty || !e.isFocused || e.isActive('codeBlock')) { setBubble(null); return; }
    const a = e.view.coordsAtPos(from);
    const b = e.view.coordsAtPos(to);
    setBubble({ x: (a.left + b.right) / 2, y: Math.min(a.top, b.top) });
  }

  function updateMenu(e) {
    const { $from, empty } = e.state.selection;
    if (!empty) { setMenu(null); return; }
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const link = /\[\[([^\]\n]{0,40})$/.exec(before);
    const block = /(?:^|\s)\/([^\s/]{0,12})$/.exec(before);
    if (!link && !block) { if (menuRef.current) setMenu(null); return; }
    const coords = e.view.coordsAtPos($from.pos);
    const query = (link ?? block)[1];
    const from = $from.pos - (link ? query.length + 2 : query.length + 1);
    const items = link ? matchNotes(query, self.current) : matchBlocks(query);
    const prev = menuRef.current;
    setMenu({ kind: link ? 'link' : 'block', x: coords.left, y: coords.bottom, query, from, items, idx: prev && prev.query === query ? prev.idx : 0 });
  }

  async function insertPhotos(files) {
    const list = [...files].filter((f) => f.type?.startsWith('image/'));
    if (!list.length) return;
    const t = toast(list.length > 1 ? `사진 ${list.length}장을 올리는 중` : '사진을 올리는 중', { busy: true });
    try {
      for (const f of list) {
        const name = await app.lib.attach(f);
        ed.current?.chain().focus().insertContent({ type: 'image', attrs: { src: `${ATT}${encodeURIComponent(name)}`, alt: name } }).run();
      }
      t.update('사진을 넣었어요.');
    } catch (err) { t.update(`사진을 올리지 못했어요. ${err.message}`, { duration: 6000 }); }
  }

  function choosePhotos() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => insertPhotos(input.files);
    input.click();
  }

  function pick(m, i) {
    const e = ed.current;
    const item = m.items[i];
    if (!e || !item) return;
    const to = e.state.selection.from;
    setMenu(null);
    if (m.kind === 'link') {
      const target = `${item.id} ${displayTitle(item.meta, item.body ?? item.snippet)}`.replace(/[[\]|#]/g, ' ').replace(/\s+/g, ' ').trim();
      const label = displayTitle(item.meta, item.body ?? item.snippet);
      e.chain().focus().deleteRange({ from: m.from, to })
        .insertContent([{ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: `${WIKI}${encodeURIComponent(target)}` } }] }, { type: 'text', text: ' ' }])
        .run();
      return;
    }
    e.chain().focus().deleteRange({ from: m.from, to }).run();
    if (item.text !== undefined) {
      // 내 키워드: #태그·@서랍 은 노트에 달고, 나머지 글을 넣는다
      const got = takeTokens(fillVars(item.text), { drawers: drawerTargets(app.lib) });
      if (got.tags.length || got.drawer) onTokens?.(got);
      if (got.text) e.chain().focus().insertContent(item.mine ? toEditorMarkdown(got.text) : got.text).run();
      return;
    }
    if (item.special === 'photo') { choosePhotos(); return; }
    if (item.special === 'link') { e.chain().focus().insertContent('[[').run(); return; }
    item.run(e.chain().focus()).run();
  }

  const mark = (name, cmd, child, label) => html`<button type="button" class=${ed.current?.isActive(name) ? 'on' : ''} aria-label=${label} title=${label}
    onMouseDown=${(ev) => ev.preventDefault()} onClick=${() => { cmd(ed.current.chain().focus()).run(); updateBubble(ed.current); }}>${child}</button>`;
  const [linkEdit, setLinkEdit] = useState(null); // 링크 주소 입력 중이면 그 값
  const applyLink = (url) => {
    const e = ed.current;
    const u = url.trim();
    if (!u) e.chain().focus().extendMarkRange('link').unsetLink().run();
    else e.chain().focus().extendMarkRange('link').setLink({ href: /^[a-z][\w+.-]*:/i.test(u) ? u : `https://${u}` }).run();
    setLinkEdit(null);
  };

  return html`<div class="editor-wrap">
    ${!ready && html`<div class="sk" style="height:16px;width:72%;margin:6px 0 12px"></div><div class="sk" style="height:16px;width:54%"></div>`}
    <div ref=${host} class="editor-host"></div>
    ${bubble && html`<div class="bubble" style=${`left:${bubble.x}px;top:${bubble.y}px`} role="toolbar" aria-label="서식">
      ${linkEdit !== null
        ? html`<input class="bubble-input" value=${linkEdit} placeholder="링크 주소 붙여넣기" aria-label="링크 주소"
            ref=${(el) => el && !el.dataset.f && (el.dataset.f = '1', el.focus())}
            onInput=${(ev) => setLinkEdit(ev.target.value)}
            onKeyDown=${(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); applyLink(linkEdit); } else if (ev.key === 'Escape') { ev.preventDefault(); setLinkEdit(null); ed.current.commands.focus(); } }} />
           <button type="button" onMouseDown=${(ev) => ev.preventDefault()} onClick=${() => applyLink(linkEdit)} aria-label="링크 적용"><${Icon} name="check" /></button>`
        : html`
          ${mark('bold', (c) => c.toggleBold(), html`<b>B</b>`, '굵게')}
          ${mark('italic', (c) => c.toggleItalic(), html`<i>I</i>`, '기울임')}
          ${mark('strike', (c) => c.toggleStrike(), html`<s>S</s>`, '취소선')}
          ${mark('code', (c) => c.toggleCode(), html`<span class="mono">{}</span>`, '코드')}
          <span class="sep"></span>
          ${mark('heading', (c) => c.toggleHeading({ level: 2 }), html`<span>제목</span>`, '제목')}
          ${mark('bulletList', (c) => c.toggleBulletList(), html`<${Icon} name="list" />`, '목록')}
          ${mark('link', () => { const href = ed.current.getAttributes('link').href ?? ''; setLinkEdit(href.startsWith(WIKI) ? '' : href); return ed.current.chain(); }, html`<${Icon} name="link" />`, '링크')}`}
    </div>`}
    ${menu && menu.items.length > 0 && html`<div class="pop slash" style=${`left:${Math.min(menu.x, window.innerWidth - 300)}px;top:${menu.y + 6}px`} role="listbox">
      <div class="mi-label">${menu.kind === 'link' ? '이을 노트' : '명령어'}</div>
      ${menu.items.map((it, i) => html`<button type="button" key=${it.id ?? it.key} role="option" aria-selected=${i === menu.idx} class=${`mi${i === menu.idx ? ' on' : ''}`}
          onMouseDown=${(ev) => ev.preventDefault()} onMouseMove=${() => i !== menu.idx && setMenu({ ...menu, idx: i })} onClick=${() => pick(menu, i)}>
        ${menu.kind === 'link'
          ? html`<${Icon} name=${TYPE_ICON[it.meta.type] ?? 'memo'} /><span class="mi-text"><span>${displayTitle(it.meta, it.body ?? it.snippet)}</span><small>${it.meta.category || '인박스'}</small></span>`
          : html`<${Icon} name=${it.icon} /><span>${it.label}</span>${it.hint && html`<span class="sub">${it.hint}</span>`}`}
      </button>`)}
    </div>`}
  </div>`;
}
