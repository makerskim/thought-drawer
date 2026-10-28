// 새 노트 만들기. 웹앱과 크롬 확장 프로그램이 같은 모양으로 저장하도록 한곳에 둔다.

import { newNote } from './note.js';
import { instagramToNote, postKey } from './instagram.js';

const linkText = (s) => String(s).replace(/[[\]]/g, '\\$&');
const quoted = (s) => s.trim().split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');

export function memoNote({ text = '', taken, ...rest } = {}) {
  return newNote({ type: 'memo', body: text.trim(), taken, ...rest });
}

// 링크(북마크). 인스타 게시물 주소면 인스타 노트로 만든다. quote는 페이지에서 고른 글.
export function linkNote({ url, title = '', memo = '', quote = '', taken, ...rest }) {
  const ig = postKey(url);
  if (ig) {
    const { meta, body } = instagramToNote({ ...ig, author: '', savedAt: new Date(), collection: null }, taken);
    const thought = [quote.trim(), memo.trim()].filter(Boolean).join('\n\n');
    return { meta: { ...meta, ...(thought ? { thought } : {}), ...rest }, body };
  }
  const parts = [];
  if (quote.trim()) parts.push(quoted(quote), '');
  parts.push(`[${linkText(title || url)}](${url})`);
  if (memo.trim()) parts.push('', memo.trim());
  return newNote({ type: 'bookmark', title, body: parts.join('\n'), source: url, taken, ...rest });
}

// 사진(캡처) 노트의 본문: 사진, 나온 곳, 메모, 사진 속 글자 순서
export function captureBody({ attName, memo = '', ocr = '', source = '', title = '' }) {
  const parts = [`![[${attName}]]`];
  if (source) parts.push('', `[${linkText(title || source)}](${source})`);
  if (memo.trim()) parts.push('', memo.trim());
  if (ocr) parts.push('', '## 사진 속 글자', '', ocr);
  return parts.join('\n');
}

export const imageExt = (type) => (type === 'image/svg+xml' ? 'svg' : type === 'image/png' ? 'png' : type === 'image/gif' ? 'gif' : 'jpg');
