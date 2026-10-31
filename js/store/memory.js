// 시험용 저장소: 자동 테스트와 화면 확인에서만 쓴다 (앱 화면에는 나오지 않음).
// window.__TD_TEST__ = { files: [{ dir, name, text | dataUrl }] } 로 내용을 넣는다.

import { INBOX_DIR } from '../config.js';
import { DriveError } from './drive.js';

export function createMemoryAdapter(seed = {}) {
  const files = new Map();
  const trashed = new Map();
  const dirs = new Set([INBOX_DIR]);
  let seq = 0;
  const now = () => new Date(Date.now() + seq).toISOString();
  const pub = (f) => ({ id: f.id, name: f.name, dir: f.dir, mimeType: f.mimeType, modifiedTime: f.modifiedTime });
  const add = (dir, name, data, mimeType) => {
    const f = { id: `m${++seq}`, name, dir, mimeType, modifiedTime: now(), data };
    files.set(f.id, f);
    dirs.add(dir);
    return f;
  };
  for (const f of seed.files ?? []) {
    if (f.dataUrl) {
      const [head, b64] = f.dataUrl.split(',');
      const type = /data:([^;]+)/.exec(head)[1];
      const bin = /;base64/.test(head) ? atob(b64) : decodeURIComponent(b64);
      add(f.dir, f.name, new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type }), type);
    } else {
      add(f.dir, f.name, f.text, 'text/markdown');
    }
  }
  return {
    kind: 'memory',
    canOcr: false,
    async init() { return { name: seed.name ?? '테스트', email: seed.email ?? 'test@example.com' }; },
    async list() {
      if (seed.fail) throw new DriveError(seed.fail, '시험용 오류', `test ${seed.fail}`);
      return { dirs: [...dirs], files: [...files.values()].map(pub) };
    },
    async readText(id) { const f = files.get(id); if (!f) throw new Error('없는 파일'); return typeof f.data === 'string' ? f.data : f.data.text(); },
    async readBlob(id) { return files.get(id).data; },
    async writeNote({ id, dir, name, text, mimeType = 'text/markdown' }) {
      seq++;
      if (id && files.has(id)) { Object.assign(files.get(id), { dir, name, data: text, modifiedTime: now() }); dirs.add(dir); return pub(files.get(id)); }
      return pub(add(dir, name, text, mimeType));
    },
    async trash(id) { trashed.set(id, files.get(id)); files.delete(id); },
    async untrash(id) { files.set(id, trashed.get(id)); trashed.delete(id); },
    async uploadAttachment(blob, name) { return pub(add('_첨부', name, blob, blob.type)); },
    async ocr() { return ''; },
    async mkdir(path) { dirs.add(path); },
  };
}
