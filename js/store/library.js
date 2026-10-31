// 라이브러리: 저장소(구글 드라이브)에서 노트를 읽고, 만들고, 고친다.
// 화면은 이 객체만 보고, 어떤 저장소인지는 모른다.
// 시작할 때 기기에 저장해 둔 노트를 먼저 보여 주고(cache-first), 드라이브와는 뒤에서 맞춘다.

import { INBOX_DIR, ATTACH_DIR, SYSTEM_DIR } from '../config.js';
import {
  parseNote, serializeNote, fileNameFor, newNote, isoLocal, snippet, STATUS, categoryParts, wikiLinks, idFromLink,
  mergeLinksSection, displayTitle,
} from '../core/note.js';
import { docFor, tokenize } from '../core/search.js';
import { instagramToNote, postKey } from '../core/instagram.js';
import { linkNote, captureBody, imageExt } from '../core/compose.js';
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

const time = (n) => Date.parse(n.meta.updated || n.meta.created || '') || 0;

export function createLibrary(adapter, { cacheName = 'td-cache' } = {}) {
  const cache = openStore(cacheName);
  const notes = new Map(); // id → note
  const attachments = new Map(); // 파일 이름 → { id }
  const urls = new Map();
  let dirs = [];
  let index = null;
  let settings = null; // 드라이브 _시스템/settings.json (기기 사이에 함께 쓰는 설정)
  let settingsFile = null;
  const listeners = new Set();
  const taken = new Set();
  const state = { syncing: false, synced: false, error: null, lastSync: null };

  let bytes = 0; // 「메모」 폴더가 드라이브에서 쓰는 양 (노트 + 사진 + 설정)
  let version = 0; // 바뀔 때마다 하나씩 (화면 쪽 계산을 다시 할지 정할 때 쓴다)
  const emit = () => { version++; listeners.forEach((fn) => fn()); };

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
    note._doc = docFor(note);
    taken.add(id);
    return note;
  }

  const fileOf = (n) => ({ id: n.fileId, name: n.name, dir: n.dir, modifiedTime: n.modifiedTime });

  function remember(note) {
    cache.set(`note:${note.fileId}`, { file: fileOf(note), meta: note.meta, body: note.body, snippet: note.snippet }).catch(() => {});
  }

  async function fetchNote(file) {
    const text = await adapter.readText(file.id);
    const { meta, body } = parseNote(text);
    const note = hydrate(file, meta, body);
    remember(note);
    return note;
  }

  function put(note) {
    for (const [k, v] of notes) if (v.fileId === note.fileId && k !== note.id) notes.delete(k);
    notes.set(note.id, note);
  }

  // 기기에 저장해 둔 노트로 바로 화면을 채운다 (드라이브 응답을 기다리지 않음)
  async function loadCached() {
    const entries = await cache.entries().catch(() => []);
    for (const [key, v] of entries) {
      if (key === 'listing') {
        dirs = v.dirs ?? [];
        for (const [name, id] of v.attachments ?? []) attachments.set(name, { id });
        index = v.index ?? null;
        settings = v.settings ?? null;
        settingsFile = v.settingsFile ?? null;
        bytes = v.bytes ?? 0;
        state.lastSync = v.lastSync ?? null;
      } else if (String(key).startsWith('note:') && v?.file) {
        put(hydrate(v.file, v.meta, v.body, { snippet: v.snippet }));
      }
    }
    emit();
    return notes.size > 0;
  }

  async function sync(onProgress) {
    state.syncing = true;
    state.error = null;
    emit();
    try {
      const listing = await adapter.list();
      bytes = listing.files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
      dirs = listing.dirs.filter((d) => !SPECIAL_DIRS.has(d.split('/')[0]));
      attachments.clear();
      const md = [];
      let indexFile = null;
      let nextSettings = null;
      for (const f of listing.files) {
        if (f.dir === ATTACH_DIR) attachments.set(f.name, { id: f.id });
        else if (f.dir === SYSTEM_DIR) { if (f.name === 'index.json') indexFile = f; else if (f.name === 'settings.json') nextSettings = f; }
        else if (f.name.endsWith('.md')) md.push(f);
      }
      if (indexFile && indexFile.modifiedTime !== index?._modifiedTime) {
        try { index = { ...JSON.parse(await adapter.readText(indexFile.id)), _modifiedTime: indexFile.modifiedTime }; } catch { index = null; }
      }
      if (nextSettings && nextSettings.modifiedTime !== settingsFile?.modifiedTime) {
        try { settings = JSON.parse(await adapter.readText(nextSettings.id)); } catch { /* 깨진 파일이면 그전 값 */ }
      }
      if (nextSettings) settingsFile = { id: nextSettings.id, modifiedTime: nextSettings.modifiedTime };
      const fromIndex = new Map((index?.notes ?? []).map((e) => [e.fileId, e]));
      const byFile = new Map([...notes.values()].map((n) => [n.fileId, n]));
      const seen = new Set();
      const toFetch = [];
      for (const f of md) {
        seen.add(f.id);
        const known = byFile.get(f.id);
        if (known && known.modifiedTime === f.modifiedTime) {
          if (known.dir !== f.dir || known.name !== f.name) put(hydrate(f, known.meta, known.body, { snippet: known.snippet }));
          continue;
        }
        const e = fromIndex.get(f.id);
        if (e && e.modifiedTime === f.modifiedTime && e.meta) {
          const n = hydrate(f, e.meta, undefined, { snippet: e.snippet });
          put(n);
          remember(n);
          continue;
        }
        toFetch.push(f);
      }
      for (const [id, n] of notes) {
        if (!seen.has(n.fileId)) { notes.delete(id); cache.del(`note:${n.fileId}`).catch(() => {}); }
      }
      if (toFetch.length) {
        await pool(toFetch, 4, async (f) => { put(await fetchNote(f)); }, (d, t) => { onProgress?.(d, t); if (d % 10 === 0) emit(); });
      }
      state.synced = true;
      state.lastSync = new Date().toISOString();
      saveListing();
    } catch (e) {
      state.error = e;
      throw e;
    } finally {
      state.syncing = false;
      emit();
    }
  }

  function saveListing() {
    cache.set('listing', { dirs, attachments: [...attachments].map(([n, a]) => [n, a.id]), index, settings, settingsFile, bytes, lastSync: state.lastSync }).catch(() => {});
  }

  async function write(note, { meta, body }, { fromDir } = {}) {
    // 새 노트는 넣기 전에 다듬는다 (자동 태그 등). 화면 쪽에서 lib.enrich 를 정해 준다.
    if (!note && lib.enrich) {
      try { ({ meta, body } = lib.enrich({ meta, body })); } catch (e) { console.warn('[enrich]', e); }
    }
    const dir = meta.status === STATUS.inbox ? INBOX_DIR : (meta.category || INBOX_DIR);
    const name = note?.name ?? fileNameFor(meta);
    const text = serializeNote({ meta, body });
    const file = await adapter.writeNote({ id: note?.fileId, dir, name, text, fromDir: note ? (fromDir ?? note.dir) : undefined });
    const fresh = hydrate({ ...file, dir }, meta, body);
    if (!dirs.includes(dir)) dirs = [...dirs, dir];
    put(fresh);
    remember(fresh);
    emit();
    return fresh;
  }

  async function ensureBody(note) {
    if (note.body !== undefined) return note;
    const full = await fetchNote(fileOf(note));
    put(full);
    emit();
    return full;
  }

  const lib = {
    adapter,
    state,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    loadCached,
    sync,
    get all() { return [...notes.values()].sort((a, b) => b.id.localeCompare(a.id)); },
    get index() { return index; },
    get settings() { return settings; },
    get version() { return version; },
    get bytes() { return bytes; },
    // 구글 저장 공간 → { limit, used, drive, app } (바이트, limit 0이면 무제한)
    async quota() {
      if (!adapter.quota) return null;
      const q = await adapter.quota();
      const n = (v) => Number(v) || 0;
      return { limit: n(q.limit), used: n(q.usage), drive: n(q.usageInDrive), app: bytes };
    },
    enrich: null,
    // 함께 쓰는 설정 저장: 드라이브 _시스템/settings.json
    async saveSettings(next) {
      const text = JSON.stringify(next, null, 2);
      const file = await adapter.writeNote({ id: settingsFile?.id, dir: SYSTEM_DIR, name: 'settings.json', text, mimeType: 'application/json' });
      settings = next;
      settingsFile = { id: file.id, modifiedTime: file.modifiedTime };
      saveListing();
      emit();
      return settings;
    },
    get(id) { return notes.get(String(id)); },
    inbox() { return lib.all.filter((n) => n.meta.status === STATUS.inbox); },
    organized() { return lib.all.filter((n) => n.meta.status !== STATUS.inbox); },
    recent(limit = 10) { return [...notes.values()].sort((a, b) => time(b) - time(a)).slice(0, limit); },
    inFolder(path, { deep = true } = {}) {
      return lib.all.filter((n) => n.meta.status !== STATUS.inbox &&
        (n.meta.category === path || (deep && String(n.meta.category ?? '').startsWith(`${path}/`))));
    },
    // 폴더 나무: [{ name, path, count, children: [...] }]
    folders() {
      const root = new Map();
      const add = (path, count) => {
        let level = root;
        let cur = '';
        for (const part of categoryParts(path)) {
          cur = cur ? `${cur}/${part}` : part;
          if (!level.has(part)) level.set(part, { name: part, path: cur, count: 0, children: new Map() });
          const node = level.get(part);
          node.count += count;
          level = node.children;
        }
      };
      for (const d of dirs) if (d !== INBOX_DIR && !SPECIAL_DIRS.has(d.split('/')[0])) add(d, 0);
      for (const n of lib.organized()) if (n.meta.category) add(n.meta.category, 1);
      const toArr = (m) => [...m.values()]
        .map((n) => ({ ...n, children: toArr(n.children) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      return toArr(root);
    },
    folderPaths() {
      const out = [];
      const walk = (list) => list.forEach((f) => { out.push(f.path); walk(f.children); });
      walk(lib.folders());
      return out;
    },
    tags() {
      const counts = new Map();
      for (const n of notes.values()) for (const t of n.meta.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
    },
    // 연결: 머리말 links + 본문 [[링크]] (나가는 연결), 다른 노트에서 걸린 연결 (들어오는 연결)
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
    // 아직 잇지 않은 비슷한 노트 (같은 낱말이 많은 순)
    related(note, limit = 5) {
      const words = (n) => new Set(tokenize([n.meta.title, (n.meta.tags ?? []).join(' '), String(n.meta.category ?? '').replace(/\//g, ' '), n.meta.summary, n.snippet].join(' ')));
      const mine = words(note);
      if (!mine.size) return [];
      const linked = new Set(lib.connections(note).map((c) => c.note.id));
      const scored = [];
      for (const n of notes.values()) {
        if (n.id === note.id || linked.has(n.id)) continue;
        let s = 0;
        for (const w of words(n)) if (mine.has(w)) s++;
        if (n.meta.category && n.meta.category === note.meta.category) s += 0.5;
        if (s >= 1.5) scored.push({ note: n, score: s });
      }
      return scored.sort((a, b) => b.score - a.score).slice(0, limit);
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
      for (const k of Object.keys(meta)) if (meta[k] === undefined || meta[k] === '' || (Array.isArray(meta[k]) && !meta[k].length)) delete meta[k];
      if (meta.status === STATUS.organized && !meta.category) meta.status = STATUS.inbox;
      return write(full, { meta, body: changes.body ?? full.body });
    },
    async createFolder(path) {
      const clean = categoryParts(path).slice(0, 2).join('/');
      if (!clean) throw new Error('폴더 이름을 적어 주세요.');
      await adapter.mkdir(clean);
      if (!dirs.includes(clean)) dirs = [...dirs, clean];
      emit();
      return clean;
    },
    pinned() { return lib.all.filter((n) => n.meta.pinned); },
    async moveTo(note, folder) {
      const cat = categoryParts(folder).join('/');
      return lib.update(note, { meta: { category: cat || undefined, status: cat ? STATUS.organized : STATUS.inbox } });
    },
    // 두 노트를 양쪽에서 잇는다 (제텔카스텐: 어느 쪽에서든 찾아갈 수 있게)
    async connect(a, b, why = '') {
      const [x, y] = await Promise.all([ensureBody(a), ensureBody(b)]);
      const link = (from, to) => lib.update(from, {
        meta: { links: [...new Set([...(from.meta.links ?? []).map(String), to.id])] },
        body: mergeLinksSection(from.body, [[to.id, displayTitle(to.meta, to.body ?? to.snippet), why]]),
      });
      await link(x, y);
      await link(lib.get(y.id), lib.get(x.id));
    },
    // 지우면 드라이브 휴지통으로 간다. 돌려주는 함수를 부르면 되살린다.
    async remove(note) {
      await adapter.trash(note.fileId);
      notes.delete(note.id);
      cache.del(`note:${note.fileId}`).catch(() => {});
      emit();
      return async () => {
        await adapter.untrash(note.fileId);
        put(note);
        remember(note);
        emit();
      };
    },
    async addCapture(file, memo = '', onStep, extra = {}) {
      onStep?.('사진을 줄이는 중');
      const blob = await downscale(file);
      const draft = newNote({ type: 'capture', taken });
      const attName = `${draft.meta.id}.${imageExt(blob.type)}`;
      onStep?.('드라이브에 올리는 중');
      const att = await adapter.uploadAttachment(blob, attName);
      attachments.set(attName, { id: att.id });
      let ocr = '';
      if (adapter.canOcr) {
        onStep?.('사진 속 글자를 읽는 중');
        try { ocr = await adapter.ocr(blob); } catch { ocr = ''; }
      }
      return write(null, { meta: { ...draft.meta, ...extra, attachments: [attName] }, body: captureBody({ attName, memo, ocr }) });
    },
    // 노트 안에 넣을 사진만 올린다 (사진 노트를 따로 만들지 않음). 첨부 이름을 돌려준다.
    async attach(file) {
      const blob = await downscale(file);
      const id = newNote({ taken: new Set(taken) }).meta.id;
      const name = `${id}-${Math.random().toString(36).slice(2, 6)}.${imageExt(blob.type)}`;
      const att = await adapter.uploadAttachment(blob, name);
      attachments.set(name, { id: att.id });
      return name;
    },
    async addLink(url, memo = '', title = '', extra = {}) {
      return write(null, linkNote({ url, title, memo, taken, ...extra }));
    },
    // 이미 가져온 게시물은 건너뛴다
    async importInstagram(items, onProgress) {
      const have = new Set(lib.all.map((n) => postKey(n.meta.source)?.code).filter(Boolean));
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
      let blob = thumb ? await cache.get(`thumb:${att.id}`) : null;
      if (!blob) {
        blob = await adapter.readBlob(att.id);
        if (thumb) {
          try { blob = await downscale(blob, 640, 0.8); } catch { /* 원본 사용 */ }
          cache.set(`thumb:${att.id}`, blob).catch(() => {});
        }
      }
      const url = URL.createObjectURL(blob);
      urls.set(key, url);
      return url;
    },
    async exportFiles(onProgress) {
      await pool(lib.all, 4, async (n) => { await ensureBody(n); }, onProgress);
      const out = lib.all.map((n) => ({ path: `${n.dir ? `${n.dir}/` : ''}${n.name}`, text: serializeNote({ meta: n.meta, body: n.body ?? '' }), meta: n.meta }));
      const atts = [];
      for (const [name, { id }] of attachments) atts.push({ name, load: () => adapter.readBlob(id) });
      return { notes: out, attachments: atts };
    },
    async clearCache() { await cache.clear().catch(() => {}); },
  };
  return lib;
}
