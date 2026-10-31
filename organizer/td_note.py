"""카드(마크다운 파일) 읽고 쓰기. 웹앱의 js/core/note.js와 같은 규칙을 따른다.

머리말은 옵시디언이 읽는 YAML이고, 값은 JSON 형식으로 쓴다.
"""
from __future__ import annotations

import json
import re
from datetime import datetime

KEY_ORDER = [
    'id', 'title', 'type', 'status', 'category', 'tags', 'summary', 'thought',
    'source', 'author', 'collection', 'created', 'updated', 'organized',
    'links', 'attachments',
]

_KEY_RE = re.compile(r'^([A-Za-z0-9_\-가-힣]+):(.*)$')


def _scalar(raw: str):
    v = raw.strip()
    if v in ('', '~', 'null'):
        return None
    if v == 'true':
        return True
    if v == 'false':
        return False
    if v.startswith('"'):
        try:
            return json.loads(v)
        except ValueError:
            return v[1:-1]
    if v.startswith("'") and v.endswith("'"):
        return v[1:-1].replace("''", "'")
    if v.startswith('[') and v.endswith(']'):
        try:
            return json.loads(v)
        except ValueError:
            inner = v[1:-1].strip()
            return [x for x in (_scalar(s) for s in inner.split(',')) if x is not None] if inner else []
    return v


def parse_yaml(src: str) -> dict:
    meta: dict = {}
    lines = src.split('\n')
    i = 0
    while i < len(lines):
        m = _KEY_RE.match(lines[i])
        if not m:
            i += 1
            continue
        key, rest = m.group(1), m.group(2).strip()
        if rest in ('|', '>', '|-', '>-'):
            buf = []
            while i + 1 < len(lines) and (lines[i + 1] == '' or re.match(r'^\s+', lines[i + 1])):
                i += 1
                buf.append(re.sub(r'^\s{2}', '', lines[i]))
            meta[key] = (' '.join(buf) if rest.startswith('>') else '\n'.join(buf)).strip()
        elif rest == '':
            items = []
            while i + 1 < len(lines) and re.match(r'^\s*-\s', lines[i + 1]):
                i += 1
                items.append(_scalar(re.sub(r'^\s*-\s', '', lines[i])))
            meta[key] = items or None
        else:
            meta[key] = _scalar(rest)
        i += 1
    return {k: v for k, v in meta.items() if v is not None}


def serialize_yaml(meta: dict) -> str:
    keys = [k for k in KEY_ORDER if k in meta] + sorted(k for k in meta if k not in KEY_ORDER)
    out = []
    for k in keys:
        v = meta[k]
        if v is None or v == '' or (isinstance(v, list) and not v):
            continue
        if isinstance(v, bool):
            out.append(f'{k}: {"true" if v else "false"}')
        else:
            out.append(f'{k}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}')
    return '\n'.join(out)


def parse_note(text: str) -> tuple[dict, str]:
    src = (text or '').lstrip('﻿').replace('\r\n', '\n')
    lines = src.split('\n')
    if not lines or lines[0] != '---':
        return {}, src
    try:
        end = lines.index('---', 1)
    except ValueError:
        return {}, src
    meta = parse_yaml('\n'.join(lines[1:end]))
    body = '\n'.join(lines[end + 1:])
    if body.startswith('\n'):
        body = body[1:]
    return meta, body


def serialize_note(meta: dict, body: str) -> str:
    return f'---\n{serialize_yaml(meta)}\n---\n\n{(body or "").lstrip(chr(10))}'


def safe_name(s, limit: int = 40) -> str:
    s = re.sub(r'[\\/:*?"<>|#^\[\]\n\r\t]', ' ', str(s or ''))
    s = re.sub(r'\s+', ' ', s).strip()
    return s[:limit].strip()


def file_name_for(meta: dict) -> str:
    t = safe_name(meta.get('title'))
    return f"{meta['id']} {t}.md" if t else f"{meta['id']}.md"


def iso_local(d: datetime | None = None) -> str:
    d = (d or datetime.now().astimezone()).replace(microsecond=0)
    return d.isoformat()


def snippet(body: str, limit: int = 140) -> str:
    s = body or ''
    s = re.sub(r'(?m)^\s*[-*+]\s+\[[ xX]\]\s+', '', s)
    s = re.sub(r'!\[\[[^\]]*\]\]', ' ', s)
    s = re.sub(r'!\[[^\]]*\]\([^)]*\)', ' ', s)
    s = re.sub(r'\[\[([^\]|]+)(?:\|([^\]]*))?\]\]', lambda m: m.group(2) or re.sub(r'^\d{14}\s*', '', m.group(1)), s)
    s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', s)
    s = re.sub(r'(?m)^#+\s.*$', ' ', s)
    s = re.sub(r'[*_`>~-]{1,3}', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s if len(s) <= limit else s[:limit - 1] + '…'


LINKS_HEAD = '## 연결'
_LINK_LINE = re.compile(r'^- \[\[(\d{14})[^\]]*\]\](?:\s*\(([^)]*)\))?\s*$')


def merge_links_section(body: str, entries: list[tuple[str, str, str]]) -> str:
    """본문 끝의 "## 연결" 목록에 (번호, 제목, 이유)를 더한다. 같은 번호는 한 번만."""
    body = (body or '').rstrip('\n')
    marker = f'\n{LINKS_HEAD}\n'
    if body.startswith(f'{LINKS_HEAD}\n') or body == LINKS_HEAD:
        head, section = '', body
    elif marker in body:
        idx = body.index(marker)
        head, section = body[:idx], body[idx + 1:]
    elif body.endswith(f'\n{LINKS_HEAD}'):
        head, section = body[:-len(LINKS_HEAD) - 1], LINKS_HEAD
    else:
        head, section = body, ''
    existing: list[str] = []
    seen: set[str] = set()
    for line in section.split('\n')[1:]:
        m = _LINK_LINE.match(line.strip())
        if m:
            seen.add(m.group(1))
        if line.strip():
            existing.append(line.strip())
    for nid, title, why in entries:
        if nid in seen:
            continue
        seen.add(nid)
        target = f'{nid} {safe_name(title)}'.strip()
        existing.append(f'- [[{target}]]' + (f' ({why.strip()})' if why and why.strip() else ''))
    if not existing:
        return head
    return f"{head.rstrip()}\n\n{LINKS_HEAD}\n\n" + '\n'.join(existing) + '\n'


def tokens(text: str) -> list[str]:
    particles = ('에서는', '으로는', '에서', '으로', '에게', '까지', '부터', '처럼', '보다',
                 '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과', '만')
    out = []
    for t in re.split(r'[^\w]+', (text or '').lower()):
        if not t or t.isdigit():
            continue
        if re.search(r'[가-힣]$', t):
            for p in particles:
                if len(t) > len(p) + 1 and t.endswith(p):
                    t = t[:-len(p)]
                    break
        if len(t) > 1:
            out.append(t)
    return out
