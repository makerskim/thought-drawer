// 서랍장(라이브러리): 저장소(드라이브 또는 체험)에서 카드를 읽어 오고, 만들고, 고친다.
// 화면은 이 객체만 보고, 어떤 저장소인지는 모른다.

import { INBOX_DIR, ATTACH_DIR, SYSTEM_DIR } from '../config.js';
import {
  parseNote, serializeNote, fileNameFor, newNote, isoLocal, snippet, STATUS, categoryParts, wikiLinks, idFromLink,
} from '../core/note.js';
import { docFor } from '../core/search.js';
import { instagramToNote, postKey } from '../core/instagram.js';
import { openStore } from './idb.js';
import { downscale } from './image.js';

const SPECIAL_DIRS = new Set([ATTACH_DIR, SYSTEM_DIR]);

async function pool(items, size, fn, onEach) {
  let i = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
      onEach?.(++done, items.length);
    }
  });
  await Promise.all(workers);
}

export function createLibrary(adapter) {
  const cache = adapter.kind === 'drive' ? openStore('td-cache') : null;
  const notes = new Map(); // id → note
  const attachments = new Map(); // 파일 이름 → { id }
  const urls = new Map();
  let dirs = [];
  let index = null;
  const listeners = new Set();
  const taken = new Set();

  const emit = () => listeners.forEach((fn) => fn());

  function hydrate(file, meta, body, extra = {}) {
    const id = String(meta.id || /^(\d{14})/.exec(file.name)?.[1] || file.id);
    const note = {
      id,
      fileId: file.id,
      name: file.name,
      dir: file.dir,
      modifiedTime: file.modifiedTime,
      meta: { ...meta, id },
      body,
      snippet: extra.snippet ?? snippet(body),
    };
    if (!note.meta.status) note.meta.status = file.dir === INBOX_DIR ? STATUS.inbox : STATUS.organized;
    if (!note.meta.category && note.meta.status === STATUS.organized && file.dir && file.dir !== INBOX_DIR) note.meta.category = file.dir;
    if (!note.meta.title && !body && extra.title) note.meta.title = extra.title;
    note._doc = docFor(note);
    taken.add(id);
    return note;
  }

  async function fetchNote(file) {
    const text = await adapter.readText(file.id);
    const { meta, body } = parseNote(text);
    const note = hydrate(file, meta, body);
    cache?.set(`note:${file.id}`, { modifiedTime: file.modifiedTime, meta: note.meta, body });
    return note;
  }

  function put(note) {
    for (const [k, v] of notes) if (v.fileId === note.fileId && k !== note.id) notes.delete(k);
    notes.set(note.id, note);
  }

  async function load(onProgress) {
    const listing = await adapter.list();
    dirs = listing.dirs.filter((d) => !SPECIAL_DIRS.has(d.split('/')[0]));
    attachments.clear();
    const md = [];
    let indexFile = null;
    for (const f of listing.files) {
      if (f.dir === ATTACH_DIR) attachments.set(f.name, { id: f.id });
      else if (f.dir === SYSTEM_DIR) { if (f.name === 'index.json') indexFile = f; }
      else if (f.name.endsWith('.md')) md.push(f);
    }
    index = null;
    if (indexFile) {
      try { index = JSON.parse(await adapter.readText(indexFile.id)); } catch { index = null; }
    }
    const fromIndex = new Map((index?.notes ?? []).map((e) => [e.fileId, e]));
    const seen = new Set();
    const toFetch = [];
    for (const f of md) {
      seen.add(f.id);
      const known = [...notes.values()].find((n) => n.fileId === f.id);
      if (known && known.modifiedTime === f.modifiedTime) continue;
      const cached = await cache?.get(`note:${f.id}`);
      if (cached && cached.modifiedTime === f.modifiedTime) { put(hydrate(f, cached.meta, cached.body)); continue; }
      const e = fromIndex.get(f.id);
      if (e && e.modifiedTime === f.modifiedTime && e.meta) { put(hydrate(f, e.meta, undefined, { snippet: e.snippet })); continue; }
      toFetch.push(f);
    }
    for (const [id, n] of notes) if (!seen.has(n.fileId)) notes.delete(id);
    if (toFetch.length) {
      await pool(toFetch, 4, async (f) => { put(await fetchNote(f)); }, (d, t) => onProgress?.(d, t));
    }
    emit();
  }

  async function write(note, { meta, body }, { fromDir } = {}) {
    const dir = meta.status === STATUS.inbox ? INBOX_DIR : (meta.category || INBOX_DIR);
    const name = note?.name ?? fileNameFor(meta);
    const text = serializeNote({ meta, body });
    const file = await adapter.writeNote({ id: note?.fileId, dir, name, text, fromDir: note ? (fromDir ?? note.dir) : undefined });
    const fresh = hydrate({ ...file, dir }, meta, body);
    cache?.set(`note:${file.id}`, { modifiedTime: file.modifiedTime, meta: fresh.meta, body });
    put(fresh);
    emit();
    return fresh;
  }

  async function ensureBody(note) {
    if (note.body !== undefined) return note;
    const file = { id: note.fileId, name: note.name, dir: note.dir, modifiedTime: note.modifiedTime };
    const full = await fetchNote(file);
    put(full);
    return full;
  }

  return {
    adapter,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load,
    get all() { return [...notes.values()].sort((a, b) => b.id.localeCompare(a.id)); },
    get index() { return index; },
    get(id) { return notes.get(String(id)); },
    inbox() { return this.all.filter((n) => n.meta.status === STATUS.inbox && n.meta.type !== 'map'); },
    organized() { return this.all.filter((n) => n.meta.status !== STATUS.inbox && n.meta.type !== 'map'); },
    inDrawer(path) {
      return this.all.filter((n) => n.meta.type !== 'map' && n.meta.status !== STATUS.inbox &&
        (n.meta.category === path || String(n.meta.category ?? '').startsWith(`${path}/`)));
    },
    // 서랍 나무: [{ name, path, count, children: [...] }]
    drawers() {
      const root = new Map();
      const add = (path, count) => {
        const parts = categoryParts(path);
        let level = root;
        let cur = '';
        for (const part of parts) {
          cur = cur ? `${cur}/${part}` : part;
          if (!level.has(part)) level.set(part, { name: part, path: cur, count: 0, children: new Map() });
          const node = level.get(part);
          node.count += count;
          level = node.children;
        }
      };
      for (const d of dirs) if (d !== INBOX_DIR) add(d, 0);
      for (const n of this.organized()) if (n.meta.category) add(n.meta.category, 1);
      const toArr = (m) => [...m.values()]
        .map((n) => ({ ...n, children: toArr(n.children) }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
      return toArr(root);
    },
    tags() {
      const counts = new Map();
      for (const n of notes.values()) for (const t of n.meta.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    },
    // 연결: 머리말 links + 본문 [[링크]] + 거꾸로 걸린 링크
    connections(note) {
      const out = new Map();
      const add = (id, dir) => { const n = notes.get(String(id)); if (n && n.id !== note.id && !out.has(n.id)) out.set(n.id, { note: n, dir }); };
      for (const id of note.meta.links ?? []) add(id, 'out');
      for (const t of wikiLinks(note.body)) {
        const id = idFromLink(t);
        if (id) add(id, 'out');
        else { const hit = [...notes.values()].find((n) => n.meta.title === t || n.name === `${t}.md`); if (hit) add(hit.id, 'out'); }
      }
      for (const n of notes.values()) {
        if (n.id === note.id) continue;
        if ((n.meta.links ?? []).map(String).includes(note.id) || (n.body ?? '').includes(`[[${note.id}`)) add(n.id, 'in');
      }
      return [...out.values()];
    },
    edges() {
      const set = new Set();
      const out = [];
      for (const n of notes.values()) {
        const targets = [...(n.meta.links ?? []), ...wikiLinks(n.body).map(idFromLink).filter(Boolean)];
        for (const t of targets) {
          const k = [n.id, String(t)].sort().join('|');
          if (notes.has(String(t)) && !set.has(k)) { set.add(k); out.push([n.id, String(t)]); }
        }
      }
      return out;
    },
    ensureBody,
    async create({ type = 'memo', title = '', body = '', ...rest }) {
      const { meta, body: b } = newNote({ type, title, body, taken, ...rest });
      return write(null, { meta, body: b });
    },
    async update(note, changes) {
      const full = await ensureBody(note);
      const meta = { ...full.meta, ...changes.meta, updated: isoLocal() };
      for (const k of Object.keys(meta)) if (meta[k] === undefined || meta[k] === '') delete meta[k];
      if (meta.status === STATUS.organized && !meta.category) meta.status = STATUS.inbox;
      return write(full, { meta, body: changes.body ?? full.body });
    },
    async remove(note) {
      await adapter.trash(note.fileId);
      notes.delete(note.id);
      cache?.del(`note:${note.fileId}`);
      emit();
    },
    async addCapture(file, memo = '', onStep) {
      onStep?.('사진 줄이는 중');
      const blob = await downscale(file);
      const draft = newNote({ type: 'capture', taken });
      const ext = blob.type === 'image/svg+xml' ? 'svg' : blob.type === 'image/png' ? 'png' : 'jpg';
      const attName = `${draft.meta.id}.${ext}`;
      onStep?.('드라이브에 올리는 중');
      const att = await adapter.uploadAttachment(blob, attName);
      attachments.set(attName, { id: att.id });
      let ocr = '';
      if (adapter.canOcr) {
        onStep?.('사진 속 글자 읽는 중');
        try { ocr = await adapter.ocr(blob); } catch { ocr = ''; }
      }
      const parts = [`![[${attName}]]`];
      if (memo.trim()) parts.push('', memo.trim());
      if (ocr) parts.push('', '## 사진 속 글자', '', ocr);
      onStep?.('카드 만드는 중');
      return write(null, { meta: { ...draft.meta, attachments: [attName] }, body: parts.join('\n') });
    },
    async addLink(url, memo = '', title = '') {
      const ig = postKey(url);
      if (ig) {
        const { meta, body } = instagramToNote({ ...ig, author: '', savedAt: new Date(), collection: null }, taken);
        if (memo.trim()) meta.thought = memo.trim();
        return write(null, { meta, body });
      }
      const body = [`[${title || url}](${url})`, memo.trim() ? `\n${memo.trim()}` : ''].join('\n');
      return this.create({ type: 'bookmark', title, body, source: url });
    },
    // 이미 가져온 게시물은 건너뛴다
    async importInstagram(items, onProgress) {
      const have = new Set(this.all.map((n) => postKey(n.meta.source)?.code).filter(Boolean));
      const fresh = items.filter((it) => !have.has(it.code));
      let made = 0;
      await pool(fresh, 3, async (it) => {
        const { meta, body } = instagramToNote(it, taken);
        await write(null, { meta, body });
        made++;
      }, (d, t) => onProgress?.(d, t));
      return { made, skipped: items.length - fresh.length };
    },
    hasAttachment: (name) => attachments.has(name),
    async attachmentUrl(name, { thumb = false } = {}) {
      const key = `${thumb ? 't' : 'f'}:${name}`;
      if (urls.has(key)) return urls.get(key);
      const att = attachments.get(name);
      if (!att) return null;
      let blob = thumb ? await cache?.get(`thumb:${att.id}`) : null;
      if (!blob) {
        blob = await adapter.readBlob(att.id);
        if (thumb) {
          try { blob = await downscale(blob, 560, 0.8); } catch { /* 원본 사용 */ }
          cache?.set(`thumb:${att.id}`, blob);
        }
      }
      const url = URL.createObjectURL(blob);
      urls.set(key, url);
      return url;
    },
    async exportFiles(onProgress) {
      const list = this.all;
      await pool(list, 4, async (n) => { await ensureBody(n); }, onProgress);
      const out = this.all.map((n) => ({ path: `${n.dir ? `${n.dir}/` : ''}${n.name}`, text: serializeNote({ meta: n.meta, body: n.body ?? '' }), meta: n.meta }));
      const atts = [];
      for (const [name, { id }] of attachments) atts.push({ name, load: () => adapter.readBlob(id) });
      return { notes: out, attachments: atts };
    },
  };
}
