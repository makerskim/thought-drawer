// 인스타그램 "내 정보 다운로드"에서 받은 저장됨(saved) 파일을 읽는다.
// 공식 형식 문서가 없고 계정 언어에 따라 항목 이름이 바뀌므로,
// 정해진 키 이름 대신 "인스타 게시물 주소 + 시각"이 있는 항목을 찾아내는 방식으로 읽는다.

import { newNote } from './note.js';

const POST_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

// 메타(페이스북) 내보내기 파일은 UTF-8 바이트를 한 글자씩 \u00XX로 적어 둔다 → 원래 글자로 복원
export function fixMojibake(s) {
  if (typeof s !== 'string' || !/[À-ÿ][\u0080-¿]/.test(s)) return s;
  if (/[^\u0000-ÿ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

export function postKey(url) {
  const m = POST_RE.exec(url ?? '');
  if (!m) return null;
  return { kind: m[1] === 'p' ? 'post' : 'reel', code: m[2], url: `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/` };
}

function findTimestamp(obj) {
  let ts = null;
  const walk = (v) => {
    if (ts || v == null) return;
    if (typeof v === 'object') {
      if (typeof v.timestamp === 'number' && v.timestamp > 1e9) { ts = v.timestamp; return; }
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(obj);
  return ts;
}

function findHref(obj) {
  let href = null;
  const walk = (v) => {
    if (href || v == null) return;
    if (typeof v === 'string') { if (POST_RE.test(v)) href = v; return; }
    if (typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(obj);
  return href;
}

function findName(obj) {
  // 컬렉션 머리 항목: href 없이 value(이름)만 있는 항목
  const smd = obj?.string_map_data ?? {};
  for (const v of Object.values(smd)) {
    if (v && typeof v.value === 'string' && !v.href) return v.value;
  }
  if (Array.isArray(obj?.label_values)) {
    for (const lv of obj.label_values) if (typeof lv?.value === 'string' && !POST_RE.test(lv.value)) return lv.value;
  }
  return null;
}

function arraysIn(json) {
  if (Array.isArray(json)) return [json];
  if (json && typeof json === 'object') return Object.values(json).filter(Array.isArray);
  return [];
}

// JSON 하나(saved_posts.json 또는 saved_collections.json)를 읽어 항목 목록을 돌려준다.
export function parseSavedJson(json) {
  const items = [];
  for (const arr of arraysIn(json)) {
    let collection = null;
    for (const entry of arr) {
      const href = findHref(entry);
      if (!href) {
        const name = findName(entry);
        if (name) collection = fixMojibake(name);
        continue;
      }
      const key = postKey(href);
      if (!key) continue;
      const ts = findTimestamp(entry);
      items.push({
        ...key,
        author: fixMojibake(entry.title || findAuthor(entry) || ''),
        savedAt: ts ? new Date(ts * 1000) : null,
        collection,
      });
    }
  }
  return items;
}

function findAuthor(entry) {
  const smd = entry?.string_map_data ?? {};
  for (const v of Object.values(smd)) if (v?.href && typeof v.value === 'string') return v.value;
  return '';
}

// HTML 형식으로 받은 경우: 링크만 뽑는다
export function parseSavedHtml(html) {
  const items = [];
  const re = /href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const key = postKey(m[1].replace(/&amp;/g, '&'));
    if (key) items.push({ ...key, author: '', savedAt: null, collection: null });
  }
  return items;
}

// 여러 파일을 합치고 같은 게시물은 하나로(컬렉션 정보가 있는 쪽을 살린다)
export function mergeSaved(lists) {
  const byCode = new Map();
  for (const list of lists) {
    for (const it of list) {
      const prev = byCode.get(it.code);
      if (!prev) { byCode.set(it.code, { ...it }); continue; }
      prev.author ||= it.author;
      prev.savedAt ||= it.savedAt;
      prev.collection ||= it.collection;
    }
  }
  return [...byCode.values()].sort((a, b) => (b.savedAt?.getTime() ?? 0) - (a.savedAt?.getTime() ?? 0));
}

export function parseInstagramFile(name, text) {
  if (/\.html?$/i.test(name)) return parseSavedHtml(text);
  try {
    return parseSavedJson(JSON.parse(text));
  } catch {
    return parseSavedHtml(text);
  }
}

export function instagramToNote(item, taken) {
  const kindLabel = item.kind === 'reel' ? '릴스' : '게시물';
  const who = item.author ? `@${item.author}` : '인스타그램';
  const lines = [
    `${who}의 ${kindLabel === '릴스' ? '릴스를' : '게시물을'} 저장했어요.`,
    '',
    `[인스타그램에서 보기](${item.url})`,
  ];
  if (item.collection) lines.push('', `인스타 컬렉션: ${item.collection}`);
  return newNote({
    type: 'instagram',
    title: '',
    body: lines.join('\n'),
    date: item.savedAt ?? new Date(),
    taken,
    source: item.url,
    author: item.author || undefined,
    collection: item.collection || undefined,
    tags: item.kind === 'reel' ? ['릴스'] : undefined,
  });
}

export function isInstagramUrl(url) {
  return POST_RE.test(url ?? '');
}
