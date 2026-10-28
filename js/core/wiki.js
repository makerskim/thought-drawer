// 편집기와 파일 사이의 변환.
// 파일은 옵시디언 문법([[노트]], ![[사진]])으로 저장하고, 편집기 안에서는 보통 링크/사진으로 다룬다.
//   [[20261020093000 흰색 셔츠]]      ⇄  [흰색 셔츠](td-wiki:20261020093000%20%ED%9D%B0...)
//   [[다른 글|별칭]]                   ⇄  [별칭](td-wiki:%EB%8B%A4...)
//   ![[20261020093000.jpg]]            ⇄  ![20261020093000.jpg](td-att:20261020093000.jpg)

export const WIKI = 'td-wiki:';
export const ATT = 'td-att:';

const LINKS_RE = /\n*^## 연결\n[\s\S]*$/m;

// 본문을 "내가 쓰는 부분"과 끝의 "## 연결" 목록으로 나눈다
export function splitLinks(body) {
  const src = String(body ?? '');
  const m = LINKS_RE.exec(src);
  if (!m) return { main: src.replace(/\s+$/, ''), links: '' };
  return { main: src.slice(0, m.index).replace(/\s+$/, ''), links: m[0].trim() };
}

export function joinLinks(main, links) {
  const head = String(main ?? '').replace(/\s+$/, '');
  if (!links) return head ? `${head}\n` : '';
  return head ? `${head}\n\n${links}\n` : `${links}\n`;
}

const defaultLabel = (target) => target.replace(/^\d{14}\s*/, '') || target;

export function toEditorMarkdown(md) {
  return String(md ?? '')
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, name) => `![${name.trim()}](${ATT}${encodeURIComponent(name.trim())})`)
    .replace(/(?<!!)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target, alias) => {
      const t = target.trim();
      return `[${(alias ?? '').trim() || defaultLabel(t)}](${WIKI}${encodeURIComponent(t)})`;
    });
}

export function fromEditorMarkdown(md) {
  return String(md ?? '')
    .replace(/!\[[^\]]*\]\(<?td-att:([^)\s>]+)>?\)/g, (_, enc) => `![[${decodeURIComponent(enc)}]]`)
    .replace(/\[((?:[^\]\\]|\\.)*)\]\(<?td-wiki:([^)\s>]+)>?\)/g, (_, label, enc) => {
      const t = decodeURIComponent(enc);
      const l = label.replace(/\\(.)/g, '$1');
      return l === defaultLabel(t) ? `[[${t}]]` : `[[${t}|${l}]]`;
    });
}
