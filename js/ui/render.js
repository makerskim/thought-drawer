// 노트 본문(마크다운) 그리기. 옵시디언식 [[링크]]와 ![[첨부]]를 앱 안 링크와 사진으로 바꾼다.
import { idFromLink } from '../core/note.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 연결 목록은 오른쪽 패널(또는 아래)에서 따로 보여 준다
export const withoutLinks = (body) => String(body ?? '').replace(/\n*## 연결\n[\s\S]*$/, '').trim();

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
  let out = window.marked?.parse
    ? window.marked.parse(md, { gfm: true, breaks: true })
    : md.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  if (window.DOMPurify) out = window.DOMPurify.sanitize(out);
  return out;
}

export function hydrate(root, lib, onImage) {
  root.querySelectorAll('figure[data-att]:not([data-done])').forEach(async (fig) => {
    fig.dataset.done = '1';
    try {
      const url = await lib.attachmentUrl(fig.dataset.att);
      if (!url) { fig.remove(); return; }
      const img = document.createElement('img');
      img.src = url;
      img.alt = '첨부한 사진';
      img.onclick = (e) => { e.stopPropagation(); onImage?.(url); };
      fig.replaceChildren(img);
    } catch { fig.remove(); }
  });
  root.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}
