// 카드 본문(마크다운) 그리기. 옵시디언식 [[링크]]와 ![[첨부]]를 앱 안 링크와 사진으로 바꾼다.

import { esc } from './dom.js';
import { idFromLink } from '../core/note.js';

function fallback(md) {
  return md.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

export function renderMarkdown(body, lib) {
  let md = String(body ?? '');
  md = md.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, name) => `\n\n<figure class="att" data-att="${esc(name.trim())}"></figure>\n\n`);
  md = md.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target, alias) => {
    const t = target.trim();
    const id = idFromLink(t);
    const hit = id ? lib.get(id) : lib.all.find((n) => n.meta.title === t || n.name === `${t}.md`);
    const label = alias || hit?.meta.title || t.replace(/^\d{14}\s*/, '') || t;
    return hit ? `<a class="wl" href="#/n/${esc(hit.id)}">${esc(label)}</a>` : `<span class="wl missing">${esc(label)}</span>`;
  });
  let html;
  if (window.marked?.parse) {
    html = window.marked.parse(md, { gfm: true, breaks: true });
  } else {
    html = fallback(md);
  }
  if (window.DOMPurify) html = window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
  return html;
}

export function hydrateAttachments(root, lib) {
  root.querySelectorAll('figure[data-att]').forEach(async (fig) => {
    try {
      const url = await lib.attachmentUrl(fig.dataset.att);
      if (url) fig.innerHTML = `<img src="${url}" alt="첨부한 사진">`;
      else fig.remove();
    } catch { fig.remove(); }
  });
  root.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}
