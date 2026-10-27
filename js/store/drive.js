// 구글 드라이브 저장소. 모든 파일은 내 드라이브의 「메모」 폴더 아래에 있고,
// 폴더 경로("패션/상의")로 다룬다. 서버 없이 브라우저가 드라이브 API를 직접 부른다.

import { ROOT_FOLDER, ATTACH_DIR, SYSTEM_DIR } from '../config.js';
import { AuthRequired } from './auth.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,parents,mimeType,modifiedTime,size';

export function createDriveAdapter(auth) {
  let rootId = null;
  const dirIds = new Map(); // '패션/상의' → folderId ('' = 메모 폴더)
  const dirOf = new Map(); // folderId → path

  async function call(url, opts = {}, kind = 'json') {
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${auth.token()}` } });
    if (res.status === 401) { auth.expire(); throw new AuthRequired(); }
    if (!res.ok) {
      let msg = `드라이브 요청이 실패했어요 (${res.status}).`;
      try { const j = await res.json(); if (j?.error?.message) msg += ` ${j.error.message}`; } catch { /* 본문 없음 */ }
      const e = new Error(msg);
      e.status = res.status;
      throw e;
    }
    if (kind === 'none' || res.status === 204) return null;
    return kind === 'blob' ? res.blob() : kind === 'text' ? res.text() : res.json();
  }

  async function listAll(q) {
    const out = [];
    let pageToken = '';
    do {
      const p = new URLSearchParams({ q, fields: `nextPageToken,files(${FIELDS},appProperties)`, pageSize: '1000', spaces: 'drive' });
      if (pageToken) p.set('pageToken', pageToken);
      const r = await call(`${API}/files?${p}`);
      out.push(...r.files);
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  }

  function multipart(meta, blob) {
    const boundary = `td${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ]);
    return { body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } };
  }

  async function createFolder(name, parentId, appProperties) {
    return call(`${API}/files?fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId], appProperties }),
    });
  }

  async function findRoot() {
    const hits = await listAll(`appProperties has { key='tdRole' and value='root' } and trashed=false`);
    if (hits.length) return hits[0].id;
    const f = await createFolder(ROOT_FOLDER, 'root', { tdRole: 'root' });
    return f.id;
  }

  async function ensureDir(path) {
    if (dirIds.has(path)) return dirIds.get(path);
    const parts = path.split('/').filter(Boolean);
    let cur = '';
    let parentId = rootId;
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!dirIds.has(cur)) {
        const f = await createFolder(part, parentId);
        dirIds.set(cur, f.id);
        dirOf.set(f.id, cur);
      }
      parentId = dirIds.get(cur);
    }
    return parentId;
  }

  const toFile = (f) => ({
    id: f.id, name: f.name, dir: dirOf.get(f.parents?.[0]) ?? null,
    mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: Number(f.size || 0),
  });

  return {
    kind: 'drive',
    async init() {
      rootId = await findRoot();
      dirIds.set('', rootId);
      dirOf.set(rootId, '');
      return auth.profile;
    },
    async list() {
      const folders = await listAll(`mimeType='${FOLDER}' and trashed=false`);
      const byId = new Map(folders.map((f) => [f.id, f]));
      const pathOf = (id, depth = 0) => {
        if (id === rootId) return '';
        if (dirOf.has(id)) return dirOf.get(id);
        const f = byId.get(id);
        if (!f || depth > 12) return null;
        const parent = pathOf(f.parents?.[0], depth + 1);
        if (parent === null) return null;
        const p = parent ? `${parent}/${f.name}` : f.name;
        dirOf.set(id, p);
        dirIds.set(p, id);
        return p;
      };
      folders.forEach((f) => pathOf(f.id));
      const files = await listAll(`mimeType!='${FOLDER}' and trashed=false`);
      return {
        dirs: [...dirIds.keys()].filter(Boolean),
        files: files.map(toFile).filter((f) => f.dir !== null),
      };
    },
    readText: (id) => call(`${API}/files/${id}?alt=media`, {}, 'text'),
    readBlob: (id) => call(`${API}/files/${id}?alt=media`, {}, 'blob'),
    async writeNote({ id, dir, name, text, fromDir }) {
      const blob = new Blob([text], { type: 'text/markdown' });
      if (!id) {
        const parent = await ensureDir(dir);
        const { body, headers } = multipart({ name, parents: [parent], mimeType: 'text/markdown' }, blob);
        return toFile(await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers, body }));
      }
      const p = new URLSearchParams({ uploadType: 'multipart', fields: FIELDS });
      if (fromDir !== undefined && fromDir !== dir) {
        p.set('addParents', await ensureDir(dir));
        p.set('removeParents', await ensureDir(fromDir));
      }
      const { body, headers } = multipart({ name }, blob);
      return toFile(await call(`${UPLOAD}/files/${id}?${p}`, { method: 'PATCH', headers, body }));
    },
    async trash(id) {
      await call(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    },
    async uploadAttachment(blob, name) {
      const parent = await ensureDir(ATTACH_DIR);
      const { body, headers } = multipart({ name, parents: [parent] }, blob);
      return toFile(await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', headers, body }));
    },
    // 드라이브 기본 글자 인식: 이미지를 구글 문서로 변환해 글자를 읽고, 임시 문서는 바로 지운다.
    async ocr(blob) {
      const parent = await ensureDir(SYSTEM_DIR);
      const { body, headers } = multipart({ name: '_글자인식_임시', mimeType: 'application/vnd.google-apps.document', parents: [parent] }, blob);
      const doc = await call(`${UPLOAD}/files?uploadType=multipart&ocrLanguage=ko&fields=id`, { method: 'POST', headers, body });
      try {
        const text = await call(`${API}/files/${doc.id}/export?mimeType=text/plain`, {}, 'text');
        return text.replace(/^﻿/, '').replace(/^_+\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
      } finally {
        call(`${API}/files/${doc.id}`, { method: 'DELETE' }, 'none').catch(() => {});
      }
    },
    canOcr: true,
  };
}
