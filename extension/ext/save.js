// 인박스에 넣기. 웹앱과 같은 노트 형식(app/core)과 드라이브 저장소(app/store/drive.js)를 쓴다.
// 정리(폴더, 제목, 태그, 연결)는 웹앱과 같이 Claude 정리기가 나중에 한다.

import { INBOX_DIR } from '../app/config.js';
import { serializeNote, fileNameFor, newNote } from '../app/core/note.js';
import { memoNote, linkNote, captureBody, imageExt } from '../app/core/compose.js';
import { createDriveAdapter } from '../app/store/drive.js';
import { AuthRequired } from '../app/store/auth.js';
import { ready, driveAuth } from './auth.js';
import { downscale } from './image.js';

const VIA = 'chrome';

// 같은 초에 두 개를 넣어도 번호가 겹치지 않도록 최근 번호를 기억한다
async function takenIds() {
  const { td_ids: ids = [] } = await chrome.storage.local.get('td_ids');
  return new Set(ids);
}
async function rememberId(id) {
  const { td_ids: ids = [] } = await chrome.storage.local.get('td_ids');
  await chrome.storage.local.set({ td_ids: [...ids, id].slice(-30) });
}

async function withDrive(fn) {
  for (let attempt = 0; ; attempt++) {
    await ready();
    const drive = createDriveAdapter(driveAuth);
    try {
      await drive.init();
      return await fn(drive);
    } catch (e) {
      if (!(e instanceof AuthRequired) || attempt > 0) throw e;
      driveAuth.expire();
    }
  }
}

async function writeNote(drive, { meta, body }) {
  await drive.writeNote({ dir: INBOX_DIR, name: fileNameFor(meta), text: serializeNote({ meta, body }) });
  await rememberId(meta.id);
  return meta;
}

async function blobFrom(src) {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`이미지를 받지 못했어요 (${r.status}).`);
  const b = await r.blob();
  if (!b.type.startsWith('image/')) throw new Error('이미지가 아니에요.');
  return b;
}

// kind: memo | page | image | capture
export async function save(kind, d, onStep = () => {}) {
  const taken = await takenIds();
  return withDrive(async (drive) => {
    if (kind === 'memo') {
      if (!d.text?.trim()) throw new Error('적은 내용이 없어요.');
      return writeNote(drive, memoNote({ text: d.text, taken, via: VIA }));
    }
    if (kind === 'page') {
      return writeNote(drive, linkNote({ url: d.url, title: d.title, memo: d.memo, quote: d.quote, taken, via: VIA }));
    }
    // image: 페이지 속 이미지, capture: 보이는 화면 그대로
    let blob;
    try {
      blob = await blobFrom(d.image);
    } catch (err) {
      if (kind !== 'image') throw err;
      // 사이트가 이미지 내려받기를 막으면 이미지 주소만 남긴다
      const { meta, body } = linkNote({ url: d.url, title: d.title, memo: d.memo, taken, via: VIA });
      return writeNote(drive, { meta, body: `![](${d.image})\n\n${body}` });
    }
    onStep('사진을 줄이는 중');
    blob = await downscale(blob);
    const draft = newNote({ type: 'capture', taken });
    const attName = `${draft.meta.id}.${imageExt(blob.type)}`;
    onStep('드라이브에 올리는 중');
    await drive.uploadAttachment(blob, attName);
    let ocr = '';
    if (d.ocr !== false) {
      onStep('사진 속 글자를 읽는 중');
      try { ocr = await drive.ocr(blob); } catch { ocr = ''; }
    }
    const meta = { ...draft.meta, source: d.url || undefined, attachments: [attName], via: VIA };
    if (!meta.source) delete meta.source;
    return writeNote(drive, { meta, body: captureBody({ attName, memo: d.memo ?? '', ocr, source: d.url, title: d.title }) });
  });
}
