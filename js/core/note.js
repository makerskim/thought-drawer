// 카드(메모) 한 장 = 마크다운 파일 하나.
// 머리말(frontmatter)은 옵시디언이 그대로 읽는 YAML이고, 값은 JSON 형식으로 써서
// 파이썬 정리기(organizer/td_note.py)와 같은 규칙으로 읽고 쓴다.

export const TYPES = {
  memo: '메모',
  capture: '캡처',
  bookmark: '북마크',
  instagram: '인스타',
  map: '지도',
};

export const STATUS = { inbox: 'inbox', organized: 'organized' };

const KEY_ORDER = [
  'id', 'title', 'type', 'status', 'category', 'tags', 'summary', 'thought',
  'source', 'author', 'collection', 'created', 'updated', 'organized',
  'links', 'attachments',
];

const pad = (n, w = 2) => String(n).padStart(w, '0');

function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// 제텔카스텐식 고유 번호: 만든 시각(초 단위). 겹치면 1초씩 뒤로 민다.
export function makeId(date = new Date(), taken) {
  let t = date.getTime();
  let id = stamp(new Date(t));
  while (taken && taken.has(id)) {
    t += 1000;
    id = stamp(new Date(t));
  }
  if (taken) taken.add(id);
  return id;
}

export function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith('[') && v.endsWith(']')) {
    try { return JSON.parse(v); } catch {
      const inner = v.slice(1, -1).trim();
      return inner ? inner.split(',').map((s) => parseScalar(s)).filter((s) => s !== null) : [];
    }
  }
  return v;
}

export function parseYaml(src) {
  const meta = {};
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([A-Za-z0-9_\-가-힣]+):(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const rest = m[2].trim();
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const buf = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) {
        buf.push(lines[++i].replace(/^\s{2}/, ''));
      }
      meta[key] = rest.startsWith('>') ? buf.join(' ').trim() : buf.join('\n').trim();
      continue;
    }
    if (rest === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) {
        items.push(parseScalar(lines[++i].replace(/^\s*-\s/, '')));
      }
      meta[key] = items.length ? items : null;
      continue;
    }
    meta[key] = parseScalar(rest);
  }
  for (const k of Object.keys(meta)) if (meta[k] === null) delete meta[k];
  return meta;
}

export function serializeYaml(meta) {
  const keys = [
    ...KEY_ORDER.filter((k) => k in meta),
    ...Object.keys(meta).filter((k) => !KEY_ORDER.includes(k)).sort(),
  ];
  const out = [];
  for (const k of keys) {
    const v = meta[k];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out.push(`${k}: ${typeof v === 'boolean' ? String(v) : JSON.stringify(v)}`);
  }
  return out.join('\n');
}

export function parseNote(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  if (lines[0] !== '---') return { meta: {}, body: src };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { meta: {}, body: src };
  const meta = parseYaml(lines.slice(1, end).join('\n'));
  let body = lines.slice(end + 1).join('\n');
  if (body.startsWith('\n')) body = body.slice(1);
  return { meta, body };
}

export function serializeNote({ meta, body }) {
  return `---\n${serializeYaml(meta)}\n---\n\n${(body ?? '').replace(/^\n+/, '')}`;
}

export function safeName(s, max = 40) {
  return String(s ?? '')
    .replace(/[\\/:*?"<>|#^[\]\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

// 파일 이름은 처음 정해지면 바꾸지 않는다(링크가 깨지지 않도록). 제목은 머리말에서 바뀐다.
export function fileNameFor(meta) {
  const t = safeName(meta.title);
  return t ? `${meta.id} ${t}.md` : `${meta.id}.md`;
}

export function newNote({ type = 'memo', title = '', body = '', date = new Date(), taken, ...rest } = {}) {
  const id = makeId(date, taken);
  const now = isoLocal(new Date());
  const meta = {
    id, title, type, status: STATUS.inbox,
    created: isoLocal(date), updated: now,
    ...rest,
  };
  for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
  return { meta, body };
}

// [[20261027105230 제목]] 또는 [[제목|별칭]] 형태의 위키 링크
export function wikiLinks(body) {
  const out = [];
  const re = /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(body ?? ''))) out.push(m[1].trim());
  return out;
}

export function embeds(body) {
  const out = [];
  const re = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(body ?? ''))) out.push(m[1].trim());
  return out;
}

export function idFromLink(target) {
  const m = /^(\d{14})/.exec(target);
  return m ? m[1] : null;
}

// 본문에서 첫 문단 일부를 뽑아 카드 미리보기로 쓴다.
export function snippet(body, max = 140) {
  const plain = String(body ?? '')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a.replace(/^\d{14}\s*/, ''))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/[*_`>~-]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

export function displayTitle(meta, body) {
  if (meta.title) return meta.title;
  const first = snippet(body, 34);
  if (first) return first;
  return `${TYPES[meta.type] ?? '카드'} ${meta.id ?? ''}`.trim();
}

export function categoryParts(category) {
  return String(category ?? '').split('/').map((s) => s.trim()).filter(Boolean);
}
