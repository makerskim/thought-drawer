// 구글 드라이브 저장소. 모든 파일은 내 드라이브의 「메모」 폴더 아래에 있고,
// 폴더 경로("패션/상의")로 다룬다. 서버 없이 브라우저가 드라이브 API를 직접 부른다.

import { ROOT_FOLDER, ATTACH_DIR, SYSTEM_DIR } from '../config.js';
import { AuthRequired } from './auth.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,parents,mimeType,modifiedTime,size';

// 드라이브 오류를 사람이 고칠 수 있는 원인으로 나눈다
export class DriveError extends Error {
  constructor(code, message, detail = '') {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function driveError(status, body) {
  const err = body?.error ?? {};
  const reasons = [
    ...(err.errors ?? []).map((x) => x.reason),
    ...(err.details ?? []).map((x) => x.reason),
    err.status,
  ].filter(Boolean).join(' ');
  const detail = `${status} ${reasons} ${err.message ?? ''}`.trim();
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/i.test(detail)) {
    const project = /project[= ](\d+)/.exec(err.message ?? '')?.[1];
    const e = new DriveError('api_disabled', '구글 클라우드에서 Google Drive API가 꺼져 있어요.', detail);
    e.project = project;
    return e;
  }
  if (/insufficient|SCOPE_INSUFFICIENT|insufficientPermissions/i.test(detail)) {
    return new DriveError('scope', '드라이브 권한이 허용되지 않았어요.', detail);
  }
  if (status === 429 || /rateLimit|userRateLimitExceeded/i.test(detail)) {
    return new DriveError('rate', '드라이브가 잠시 바빠요. 조금 뒤에 다시 시도해 주세요.', detail);
  }
  if (status === 404) return new DriveError('not_found', '파일을 찾지 못했어요. 지워졌을 수 있어요.', detail);
  return new DriveError('other', `드라이브 요청이 실패했어요 (${status}).`, detail);
}

export function createDriveAdapter(auth) {
  let rootId = null;
  const dirIds = new Map(); // '패션/상의' → folderId ('' = 메모 폴더)
  const dirOf = new Map(); // folderId → path
  let listed = false; // list()로 폴더를 모두 읽었으면 없는 폴더는 정말 없는 것

  async function call(url, opts = {}, kind = 'json') {
    let res;
    await auth.ready?.(); // 구글 연결을 다시 받는 중이면 기다렸다가
    try {
      res = await fetch(url, { ...opts, headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${auth.token()}` } });
    } catch (err) {
      if (err instanceof AuthRequired) throw err;
      throw new DriveError('network', '인터넷에 연결되지 않았어요.', String(err?.message ?? err));
    }
    if (res.status === 401) { auth.expire(); throw new AuthRequired(); }
    if (!res.ok) {
      let j = null;
      try { j = await res.json(); } catch { /* 본문 없음 */ }
      throw driveError(res.status, j);
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

  // 전체 목록을 읽기 전(크롬 확장 프로그램 등)에도 같은 이름 폴더를 두 번 만들지 않도록 먼저 찾아본다
  async function findChild(name, parentId) {
    const q = `name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER}' and trashed=false`;
    return (await listAll(q))[0] ?? null;
  }

  async function ensureDir(path) {
    if (dirIds.has(path)) return dirIds.get(path);
    const parts = path.split('/').filter(Boolean);
    let cur = '';
    let parentId = rootId;
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!dirIds.has(cur)) {
        const f = (listed ? null : await findChild(part, parentId)) ?? await createFolder(part, parentId);
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
    get rootId() { return rootId; }, // 드라이브의 「메모」 폴더 (내 계정 메뉴에서 바로 열기)
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
      listed = true;
      const files = await listAll(`mimeType!='${FOLDER}' and trashed=false`);
      return {
        dirs: [...dirIds.keys()].filter(Boolean),
        files: files.map(toFile).filter((f) => f.dir !== null),
      };
    },
    readText: (id) => call(`${API}/files/${id}?alt=media`, {}, 'text'),
    readBlob: (id) => call(`${API}/files/${id}?alt=media`, {}, 'blob'),
    async writeNote({ id, dir, name, text, fromDir, mimeType = 'text/markdown' }) {
      const blob = new Blob([text], { type: mimeType });
      if (!id) {
        const parent = await ensureDir(dir);
        const { body, headers } = multipart({ name, parents: [parent], mimeType }, blob);
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
    async untrash(id) {
      await call(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: false }) });
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
    mkdir: (path) => ensureDir(path),
  };
}
