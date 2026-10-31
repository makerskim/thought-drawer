// 브라우저 북마크 내보내기 파일(크롬·사파리·엣지·파이어폭스 공통 bookmarks.html)을 읽는다
const GENERIC = /^(bookmarks? ?(bar|menu|toolbar)?|북마크 ?(바|메뉴|도구 ?모음)?|즐겨찾기 ?(표시줄|모음)?|favorites( bar)?|other bookmarks|기타 ?북마크|모바일 ?북마크|mobile bookmarks|imported)$/i;

const decode = (s) => String(s ?? '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').trim();

export const isBookmarksFile = (text) => /<!DOCTYPE NETSCAPE-Bookmark-file-1>/i.test(String(text).slice(0, 400)) || /<DT><A HREF=/i.test(String(text).slice(0, 5000));

// [{ url, title, folder, added }] (folder: 의미 없는 「북마크바」 같은 이름은 빼고 「여행/제주」처럼)
export function parseBookmarks(text) {
  const out = [];
  const stack = [];
  const seen = new Set();
  const re = /<H3[^>]*>([\s\S]*?)<\/H3>|<A\s([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;
  let m;
  let pending = null;
  while ((m = re.exec(String(text)))) {
    if (m[1] !== undefined) { pending = decode(m[1]); stack.push(pending); continue; }
    if (m[0].toUpperCase() === '</DL>') { stack.pop(); continue; }
    const attrs = m[2];
    const href = /HREF="([^"]*)"/i.exec(attrs)?.[1];
    const url = decode(href);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const add = Number(/ADD_DATE="(\d+)"/i.exec(attrs)?.[1]);
    out.push({
      url,
      title: decode(m[3].replace(/<[^>]+>/g, '')),
      folder: stack.filter((f) => f && !GENERIC.test(f)).join('/'),
      added: add ? new Date(add * (add > 1e12 ? 1 : 1000)) : null,
    });
  }
  return out;
}
