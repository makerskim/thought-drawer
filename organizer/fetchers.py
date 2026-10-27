"""링크 내용 가져오기 (AI 토큰을 쓰지 않는 단계).

웹페이지: 제목, 설명, 본문 앞부분. 인스타: 공개 게시물의 캡션과 계정 이름.
가져오지 못하면 None을 돌려주고, 정리는 있는 정보만으로 한다.
"""
from __future__ import annotations

import html
import re
import urllib.request
from html.parser import HTMLParser

from stores import _ssl_context

UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
MAX_BYTES = 1_500_000


def _get(url: str, timeout: int = 12) -> str | None:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.6'})
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as r:
            ctype = r.headers.get('Content-Type', '')
            if 'html' not in ctype and 'text' not in ctype:
                return None
            raw = r.read(MAX_BYTES)
            charset = r.headers.get_content_charset() or 'utf-8'
            return raw.decode(charset, errors='replace')
    except Exception:  # 네트워크, 차단, 시간 초과 모두 "못 가져옴"으로 본다
        return None


class _Text(HTMLParser):
    SKIP = {'script', 'style', 'noscript', 'nav', 'footer', 'header', 'svg', 'form', 'aside'}
    KEEP = {'p', 'h1', 'h2', 'h3', 'li', 'blockquote'}

    def __init__(self):
        super().__init__()
        self.skip = 0
        self.keep = 0
        self.parts: list[str] = []
        self.buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.KEEP:
            self.keep += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag in self.KEEP and self.keep:
            self.keep -= 1
            text = re.sub(r'\s+', ' ', ''.join(self.buf)).strip()
            if len(text) > 20:
                self.parts.append(text)
            self.buf = []

    def handle_data(self, data):
        if self.keep and not self.skip:
            self.buf.append(data)


def _meta(doc: str, *names: str) -> str:
    for n in names:
        m = re.search(rf'<meta[^>]+(?:property|name)=["\']{re.escape(n)}["\'][^>]*content=["\']([^"\']*)', doc, re.I) \
            or re.search(rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']{re.escape(n)}["\']', doc, re.I)
        if m and m.group(1).strip():
            return html.unescape(m.group(1)).strip()
    return ''


def fetch_page(url: str, text_limit: int = 700) -> dict | None:
    doc = _get(url)
    if not doc:
        return None
    title = _meta(doc, 'og:title', 'twitter:title')
    if not title:
        m = re.search(r'<title[^>]*>(.*?)</title>', doc, re.I | re.S)
        title = html.unescape(re.sub(r'\s+', ' ', m.group(1))).strip() if m else ''
    desc = _meta(doc, 'og:description', 'description', 'twitter:description')
    p = _Text()
    try:
        p.feed(doc)
    except Exception:
        pass
    text = ' '.join(p.parts)[:text_limit]
    if not (title or desc or text):
        return None
    return {'title': title[:150], 'description': desc[:300], 'text': text, 'site': _meta(doc, 'og:site_name')}


_IG = re.compile(r'instagram\.com/(?:[A-Za-z0-9_.]+/)?(p|reel|reels|tv)/([A-Za-z0-9_-]+)')


def fetch_instagram(url: str) -> dict | None:
    m = _IG.search(url or '')
    if not m:
        return None
    kind = 'p' if m.group(1) == 'p' else 'reel'
    code = m.group(2)
    # 공개 게시물은 embed 페이지에서 로그인 없이 캡션을 볼 수 있다
    doc = _get(f'https://www.instagram.com/{kind}/{code}/embed/captioned/')
    if doc:
        cap = re.search(r'class="Caption"[^>]*>(.*?)<div class="CaptionComments"', doc, re.S)
        user = re.search(r'class="UsernameText"[^>]*>([^<]+)<', doc) or re.search(r'class="CaptionUsername"[^>]*>([^<]+)<', doc)
        if cap:
            raw = re.sub(r'<br\s*/?>', '\n', cap.group(1))
            raw = re.sub(r'<a[^>]*class="CaptionUsername"[^>]*>.*?</a>', '', raw, flags=re.S)
            text = html.unescape(re.sub(r'<[^>]+>', '', raw)).strip()
            return {'author': (user.group(1).strip() if user else ''), 'caption': text[:1500]}
    doc = _get(f'https://www.instagram.com/{kind}/{code}/')
    if doc:
        desc = _meta(doc, 'og:description')
        # 예: 123 likes, 4 comments - user on March 3, 2025: "캡션"
        cm = re.search(r'-\s*([A-Za-z0-9_.]+)\s+on\s+[^:]+:\s*["“](.*)["”]\s*\.?$', desc, re.S)
        if cm:
            return {'author': cm.group(1), 'caption': cm.group(2)[:1500]}
        title = _meta(doc, 'og:title')
        if desc or title:
            return {'author': '', 'caption': (desc or title)[:1500]}
    return None
