// 노션·일반 마크다운용 내보내기: 옵시디언식 [[링크]]와 ![[첨부]]를
// 표준 마크다운 상대 경로로 바꾼다. 옵시디언은 드라이브 「메모」 폴더를 그대로 열면 된다.

import { idFromLink } from './note.js';

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

export function relPath(fromDir, toPath) {
  const from = fromDir ? fromDir.split('/') : [];
  const to = toPath.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/');
}

// notes: [{ path: '패션/상의/2026... 제목.md', text, meta }]
export function convertForExport(notes, attachmentDir = '_첨부') {
  const byId = new Map(notes.map((n) => [String(n.meta.id), n]));
  const byName = new Map(notes.map((n) => [n.path.split('/').pop().replace(/\.md$/, ''), n]));
  return notes.map((n) => {
    const dir = n.path.split('/').slice(0, -1).join('/');
    let text = n.text.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, name) =>
      `![${name}](${enc(relPath(dir, `${attachmentDir}/${name.trim()}`))})`);
    text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (all, target, alias) => {
      const t = target.trim();
      const hit = byId.get(idFromLink(t)) ?? byName.get(t);
      if (!hit) return alias || t;
      const label = alias || hit.meta.title || t.replace(/^\d{14}\s*/, '');
      return `[${label}](${enc(relPath(dir, hit.path))})`;
    });
    return { path: n.path, text };
  });
}
