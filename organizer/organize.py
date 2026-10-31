#!/usr/bin/env python3
"""Thought Drawer 자동 정리기.

Claude Code 예약 작업이 이 순서로 부른다 (organizer/ROUTINE.md):
  1) python3 organizer/organize.py prepare   정리할 노트를 모아 work/batch.md를 만든다 (토큰 안 씀)
  2) Claude가 batch.md를 읽고 work/decisions.json을 쓴다          (여기서만 토큰을 씀)
  3) python3 organizer/organize.py apply     결정대로 노트를 고치고 폴더로 옮긴다 (토큰 안 씀)

그 밖에: status (대기 수 보기), index (색인만 다시 만들기)
저장소는 기본이 구글 드라이브(환경 변수), --local 폴더를 주면 그 폴더를 쓴다.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from td_note import (  # noqa: E402
    file_name_for, iso_local, merge_links_section, parse_note, safe_name, serialize_note, snippet, tokens,
)

INBOX = '00_인박스'
ATTACH = '_첨부'
SYSTEM = '_시스템'
SPECIAL = {ATTACH, SYSTEM}
WORK = Path(__file__).resolve().parent / 'work'

# 한 번에 Claude에게 보여 줄 양 (구독 사용량을 아끼는 장치)
MAX_CARDS = 30
CHAR_BUDGET = 14000
BODY_LIMIT = 500
OCR_LIMIT = 400
FETCH_LIMIT = 600
SHORT_OCR = 20  # 사진 속 글자가 이보다 적으면 사진을 직접 보게 한다

RULES = """## 정리 규칙
- 노트마다 아래 형식의 결정을 하나씩 쓴다. 결과는 JSON 배열 하나만 `organizer/work/decisions.json`에 저장한다.
  `{"id": "노트 번호", "title": "제목", "category": "큰폴더/작은폴더", "tags": ["태그"], "summary": "한 문장 요약", "links": [{"id": "번호", "why": "이유"}]}`
- title: 30자 이내, 무엇인지 바로 알 수 있게. 사용자가 단 제목이 있으면 그대로 둔다(빈 문자열로 쓴다).
- category: 한국어, 최대 두 단계(예: "패션/상의", "요리/레시피", "여행/제주"). **기존 폴더 목록에 맞는 게 있으면 반드시 그걸 쓴다.**
  새 폴더는 기존 것과 겹치지 않을 때만 만든다. 정보가 너무 부족하면 "확인 필요".
- tags: 2~5개, 짧은 명사. 사고 싶은 물건이면 "위시리스트"를 넣는다.
- summary: 80자 이내 한 문장. 나중에 검색할 핵심 단어(브랜드, 가격, 장소, 재료 등)를 넣는다.
- links: 그 노트의 "연결 후보"나 이번 묶음의 다른 노트 중 정말 관련 있는 것만, 0~3개. why는 15자 이내.
- 사진 경로가 적힌 노트만 그 사진을 열어 본다. 다른 파일은 열지 않는다.
"""


def open_store(args):
    if args.local:
        from stores import LocalStore
        return LocalStore(args.local)
    from stores import DriveStore
    return DriveStore.from_env()


def top(path: str) -> str:
    return (path or '').split('/')[0]


def load_rules(store, files):
    """웹앱 설정(_시스템/settings.json)의 내 분류 규칙. 앱의 자동 분류와 같은 규칙을 Claude도 따른다."""
    f = next((x for x in files if x['dir'] == SYSTEM and x['name'] == 'settings.json'), None)
    if not f:
        return []
    try:
        rules = json.loads(store.read_text(f['id'])).get('rules') or []
    except Exception:  # 깨진 파일이면 규칙 없이
        return []
    out = []
    for r in rules:
        match = str(r.get('match', '')).strip()
        drawer = '/'.join(p.strip() for p in str(r.get('drawer', '')).split('/') if p.strip())
        tags = [str(t).strip().lstrip('#') for t in (r.get('tags') or []) if str(t).strip()]
        if match and (drawer or tags):
            out.append({'match': match, 'drawer': drawer, 'tags': tags})
    return out


def rules_lines(rules):
    if not rules:
        return []
    lines = ['## 내 분류 규칙 (사용자가 정함. 맞으면 반드시 따른다)', '']
    for r in rules:
        to = []
        if r['drawer']:
            to.append(f"category: {r['drawer']}")
        if r['tags']:
            to.append('tags에 ' + ', '.join(r['tags']))
        lines.append(f"- 「{r['match']}」 중 하나가 나오면 → " + ', '.join(to))
    return lines + ['']


def load_index(store, files):
    f = next((x for x in files if x['dir'] == SYSTEM and x['name'] == 'index.json'), None)
    if not f:
        return None, {}
    try:
        data = json.loads(store.read_text(f['id']))
        return f, {e['fileId']: e for e in data.get('notes', []) if 'fileId' in e}
    except (ValueError, KeyError):
        return f, {}


def note_files(files):
    return [f for f in files if f['name'].endswith('.md') and top(f['dir']) not in SPECIAL]


def read_all_meta(store, files, cached):
    """모든 노트의 머리말. 색인에 있는 건 다시 읽지 않는다."""
    out = []
    for f in note_files(files):
        e = cached.get(f['id'])
        if e and e.get('modifiedTime') == f['modifiedTime'] and 'meta' in e:
            out.append({'file': f, 'meta': e['meta'], 'snippet': e.get('snippet', '')})
            continue
        meta, body = parse_note(store.read_text(f['id']))
        meta.setdefault('id', (re.match(r'^(\d{14})', f['name']) or [None, f['id']])[1])
        meta.setdefault('status', 'inbox' if f['dir'] == INBOX else 'organized')
        if meta.get('status') == 'organized' and not meta.get('category') and f['dir'] != INBOX:
            meta['category'] = f['dir']
        out.append({'file': f, 'meta': meta, 'snippet': snippet(body), 'body': body})
    return out


def section(body: str, head: str) -> str:
    m = re.search(rf'(?m)^## {re.escape(head)}\n+(.*?)(?=^## |\Z)', body or '', re.S)
    return m.group(1).strip() if m else ''


def main_text(body: str) -> str:
    b = re.sub(r'(?ms)^## (사진 속 글자|연결|캡션|페이지 내용)\n.*?(?=^## |\Z)', '', body or '')
    # 앱이 자동으로 적은 안내 문장과 출처 링크는 빼서 토큰을 아낀다
    b = re.sub(r'(?m)^.*의 (릴스|게시물)(을|를) 저장했어요\.\s*$', '', b)
    b = re.sub(r'(?m)^\[(인스타그램에서 보기|https?://[^\]]*)\]\([^)]*\)\s*$', '', b)
    b = re.sub(r'(?m)^인스타 컬렉션: .*$', '', b)
    b = re.sub(r'!\[\[[^\]]*\]\]', '[사진]', b)
    return re.sub(r'\n{2,}', '\n', b).strip()


def candidates(card_tokens: set[str], organized: list[dict], limit: int = 4):
    scored = []
    for o in organized:
        m = o['meta']
        words = set(tokens(' '.join([m.get('title', ''), ' '.join(m.get('tags') or []), m.get('category', '').replace('/', ' '), m.get('summary', '')])))
        s = len(card_tokens & words)
        if s:
            scored.append((s, o))
    scored.sort(key=lambda x: (-x[0], str(x[1]['meta'].get('id'))))
    return [o for _, o in scored[:limit]]


def drawer_counts(organized):
    c = Counter(o['meta'].get('category') for o in organized if o['meta'].get('category'))
    return sorted(c.items(), key=lambda x: (-x[1], x[0]))


def thumbnail(store, att_files, name):
    f = att_files.get(name)
    if not f:
        return None
    data = store.read_bytes(f['id'])
    WORK.joinpath('img').mkdir(parents=True, exist_ok=True)
    out = WORK / 'img' / (Path(name).stem + '.jpg')
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data))
        im.thumbnail((640, 640))
        im.convert('RGB').save(out, 'JPEG', quality=80)
    except Exception:
        if name.lower().endswith(('.jpg', '.jpeg', '.png')) and len(data) < 1_500_000:
            out = WORK / 'img' / name
            out.write_bytes(data)
        else:
            return None
    return out


def cmd_status(store, args):
    files = store.list()
    inbox = [f for f in note_files(files) if f['dir'] == INBOX]
    print(f'정리 대기 {len(inbox)}장, 전체 노트 {len(note_files(files))}장')


def cmd_prepare(store, args):
    from fetchers import fetch_instagram, fetch_page

    if WORK.exists():
        for p in sorted(WORK.rglob('*'), reverse=True):
            p.unlink() if p.is_file() else p.rmdir()
    files = store.list()
    _, cached = load_index(store, files)
    inbox_files = sorted((f for f in note_files(files) if f['dir'] == INBOX), key=lambda f: f['name'], reverse=True)
    if not inbox_files:
        print('정리할 노트 없음. 여기서 끝내세요.')
        return
    all_meta = read_all_meta(store, [f for f in files if f['dir'] != INBOX], cached)
    organized = [o for o in all_meta if o['meta'].get('status') == 'organized']
    att_files = {f['name']: f for f in files if f['dir'] == ATTACH}

    batch, used = [], 0
    for f in inbox_files:
        if len(batch) >= args.max:
            break
        meta, body = parse_note(store.read_text(f['id']))
        meta.setdefault('id', (re.match(r'^(\d{14})', f['name']) or [None, f['name'][:-3]])[1])
        card = {'id': str(meta['id']), 'fileId': f['id'], 'name': f['name'], 'dir': f['dir'], 'type': meta.get('type', 'memo'),
                'title': meta.get('title', ''), 'tags': meta.get('tags') or [], 'thought': meta.get('thought', ''),
                'source': meta.get('source', ''), 'author': meta.get('author', ''), 'collection': meta.get('collection', ''),
                'text': re.sub(r'^\[사진\]$', '', main_text(body))[:BODY_LIMIT], 'ocr': section(body, '사진 속 글자')[:OCR_LIMIT],
                'caption': section(body, '캡션')[:FETCH_LIMIT], 'page': section(body, '페이지 내용')[:FETCH_LIMIT], 'fetched': None, 'image': None}
        if card['source'] and not (card['caption'] or card['page']):
            if card['type'] == 'instagram':
                got = fetch_instagram(card['source'])
                if got:
                    card['fetched'] = {'kind': 'instagram', **got}
                    card['caption'] = got['caption'][:FETCH_LIMIT]
                    card['author'] = card['author'] or got.get('author', '')
            elif card['type'] == 'bookmark':
                got = fetch_page(card['source'])
                if got:
                    card['fetched'] = {'kind': 'page', **got}
                    card['page'] = '\n'.join(x for x in (got['title'], got['description'], got['text']) if x)[:FETCH_LIMIT]
        if card['type'] == 'capture' and len(card['ocr']) < SHORT_OCR:
            for name in meta.get('attachments') or re.findall(r'!\[\[([^\]|]+)', body):
                img = thumbnail(store, att_files, name.strip())
                if img:
                    card['image'] = str(img.relative_to(WORK.parent.parent))
                    break
        size = sum(len(str(card[k])) for k in ('text', 'ocr', 'caption', 'page', 'thought')) + 120
        if batch and used + size > args.budget:
            break
        used += size
        words = set(tokens(' '.join([card['title'], card['text'], card['ocr'], card['caption'], card['page'], card['thought'], ' '.join(card['tags']), card['collection']])))
        card['candidates'] = [{'id': str(o['meta']['id']), 'title': o['meta'].get('title', ''), 'category': o['meta'].get('category', ''), 'tags': o['meta'].get('tags') or []} for o in candidates(words, organized)]
        batch.append(card)

    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / 'batch.json').write_text(json.dumps(batch, ensure_ascii=False, indent=1), encoding='utf-8')
    lines = [f'# 정리할 노트 {len(batch)}장 (전체 대기 {len(inbox_files)}장)', '', RULES, *rules_lines(load_rules(store, files)), '## 기존 폴더 (노트 수)', '']
    drawers = drawer_counts(organized)
    lines.append(', '.join(f'{c} ({n})' for c, n in drawers) if drawers else '(아직 없음. 필요한 폴더를 새로 만든다)')
    lines += ['', '## 노트', '']
    kinds = {'memo': '메모', 'capture': '캡처', 'bookmark': '북마크', 'instagram': '인스타'}
    for c in batch:
        lines.append(f"### {c['id']} [{kinds.get(c['type'], c['type'])}]")
        for label, key in (('사용자 제목', 'title'), ('내 생각', 'thought'), ('출처', 'source'), ('계정', 'author'), ('인스타 컬렉션', 'collection')):
            if c[key]:
                lines.append(f'{label}: {c[key]}')
        if c['tags']:
            lines.append(f"기존 태그: {', '.join(c['tags'])}")
        for label, key in (('내용', 'text'), ('사진 속 글자', 'ocr'), ('캡션', 'caption'), ('페이지', 'page')):
            if c[key]:
                lines.append(f'{label}: ' + re.sub(r'\s*\n\s*', ' / ', c[key]))
        if c['source'] and not (c['caption'] or c['page']) and c['type'] in ('instagram', 'bookmark'):
            lines.append('(링크 내용을 읽지 못함)')
        if c['image']:
            lines.append(f"사진: {c['image']}  ← 글자가 거의 없어 이 사진을 직접 본다")
        if c['candidates']:
            lines.append('연결 후보:')
            lines += [f"- {x['id']} | {x['title']} | {x['category']} | {', '.join(x['tags'])}" for x in c['candidates']]
        lines.append('')
    (WORK / 'batch.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'정리할 노트 {len(batch)}장을 organizer/work/batch.md에 모았어요. (남은 대기 {len(inbox_files) - len(batch)}장)')


def clean_category(raw: str) -> str:
    parts = [safe_name(p, 20) for p in str(raw or '').split('/')]
    parts = [p for p in parts if p and not p.startswith('_') and not p.startswith('00_')]
    return '/'.join(parts[:2])


def body_with_fetched(body: str, card: dict) -> str:
    got = card.get('fetched')
    if not got:
        return body
    if got['kind'] == 'instagram' and got.get('caption') and '## 캡션' not in body:
        return f"{body.rstrip()}\n\n## 캡션\n\n{got['caption']}\n"
    if got['kind'] == 'page' and '## 페이지 내용' not in body:
        parts = [x for x in (got.get('title'), got.get('description')) if x]
        if parts:
            return f"{body.rstrip()}\n\n## 페이지 내용\n\n" + '\n\n'.join(parts) + '\n'
    return body


def fix_bare_links(store, note_id: str, new_target: str, skip_file: str):
    """[[번호]]처럼 번호만으로 걸린 링크를 새 파일 이름으로 바꾼다(옵시디언에서 안 깨지게)."""
    for fid in store.search_text(note_id):
        if fid == skip_file:
            continue
        text = store.read_text(fid)
        new = re.sub(rf'\[\[{note_id}(\||\]\])', lambda m: f'[[{new_target}{m.group(1)}', text)
        if new != text:
            info = next((f for f in store.list() if f['id'] == fid), None)
            if info:
                store.write_note(fid, info['dir'], info['name'], new)


def cmd_apply(store, args):
    batch_p, dec_p = WORK / 'batch.json', WORK / 'decisions.json'
    if not batch_p.exists():
        sys.exit('batch.json이 없어요. 먼저 prepare를 실행하세요.')
    if not dec_p.exists():
        sys.exit('decisions.json이 없어요. batch.md를 읽고 결정을 저장하세요.')
    batch = {c['id']: c for c in json.loads(batch_p.read_text(encoding='utf-8'))}
    try:
        decisions = json.loads(dec_p.read_text(encoding='utf-8'))
    except ValueError as e:
        sys.exit(f'decisions.json이 올바른 JSON이 아니에요: {e}')
    if isinstance(decisions, dict):
        decisions = decisions.get('decisions') or list(decisions.values())
    problems = []
    for i, d in enumerate(decisions):
        if not isinstance(d, dict) or str(d.get('id')) not in batch:
            problems.append(f'{i + 1}번째 결정: id가 이번 묶음에 없어요 ({d.get("id") if isinstance(d, dict) else d})')
        elif not clean_category(d.get('category')):
            problems.append(f'{d["id"]}: category가 비어 있어요')
    if problems:
        sys.exit('decisions.json을 고쳐 주세요:\n- ' + '\n- '.join(problems))

    files = store.list()
    _, cached = load_index(store, files)
    known_ids = {str(o['meta'].get('id')) for o in read_all_meta(store, [f for f in files if f['dir'] != INBOX], cached)} | set(batch)
    now = iso_local()
    done, backlinks = [], {}
    for d in decisions:
        card = batch[str(d['id'])]
        meta, body = parse_note(store.read_text(card['fileId']))
        meta.setdefault('id', card['id'])
        if meta.get('status') == 'organized':
            continue  # 그 사이 사용자가 직접 정리했다
        title = meta.get('title') or safe_name(d.get('title'), 60)
        category = clean_category(d['category'])
        tags = list(dict.fromkeys([*(meta.get('tags') or []), *[safe_name(t, 20) for t in (d.get('tags') or []) if safe_name(t, 20)]]))[:6]
        links = []
        for l in d.get('links') or []:
            lid = str(l.get('id') if isinstance(l, dict) else l)
            if lid in known_ids and lid != card['id'] and lid not in [x[0] for x in links]:
                links.append((lid, (l.get('why') if isinstance(l, dict) else '') or ''))
        meta.update({'title': title, 'category': category, 'tags': tags, 'status': 'organized', 'organized': now, 'updated': now})
        if d.get('summary'):
            meta['summary'] = str(d['summary']).strip()[:200]
        if card.get('fetched', {}) and card['fetched'].get('author') and not meta.get('author'):
            meta['author'] = card['fetched']['author']
        meta['links'] = list(dict.fromkeys([*(meta.get('links') or []), *[l[0] for l in links]]))
        titles = {**{c['id']: c.get('title', '') for c in batch.values()}, **{x['id']: x['title'] for c in batch.values() for x in c['candidates']}}
        dec_titles = {str(x.get('id')): x.get('title', '') for x in decisions if isinstance(x, dict)}
        body = body_with_fetched(body, card)
        body = merge_links_section(body, [(lid, dec_titles.get(lid) or titles.get(lid, ''), why) for lid, why in links])
        old_name = card['name']
        name = file_name_for(meta) if re.fullmatch(r'\d{14}\.md', old_name) else old_name
        info = store.write_note(card['fileId'], category, name, serialize_note(meta, body), from_dir=card['dir'])
        if name != old_name:
            fix_bare_links(store, card['id'], name[:-3], info['id'])
        for lid, why in links:
            backlinks.setdefault(lid, []).append((card['id'], title, why))
        done.append((card['id'], title, category))

    # 거꾸로 걸린 연결도 상대 노트에 적어 둔다 (제텔카스텐: 양쪽에서 찾아갈 수 있게)
    if backlinks:
        files = store.list()
        by_id = {}
        for f in note_files(files):
            m = re.match(r'^(\d{14})', f['name'])
            if m:
                by_id[m.group(1)] = f
        for target, srcs in backlinks.items():
            f = by_id.get(target)
            if not f:
                continue
            meta, body = parse_note(store.read_text(f['id']))
            meta['links'] = list(dict.fromkeys([*(meta.get('links') or []), *[s[0] for s in srcs]]))
            body = merge_links_section(body, srcs)
            store.write_note(f['id'], f['dir'], f['name'], serialize_note(meta, body))

    build_index(store)
    log_run(store, done)
    print(f'{len(done)}장을 정리했어요.')
    for nid, title, cat in done:
        print(f'- {cat}: {title} ({nid})')


def build_index(store):
    files = store.list()
    idx_file, cached = load_index(store, files)
    entries = []
    for o in read_all_meta(store, files, cached):
        f = o['file']
        entries.append({'fileId': f['id'], 'name': f['name'], 'dir': f['dir'], 'modifiedTime': f['modifiedTime'], 'meta': o['meta'], 'snippet': o['snippet']})
    data = {'version': 1, 'generatedAt': iso_local(), 'notes': entries}
    store.write_file(SYSTEM, 'index.json', json.dumps(data, ensure_ascii=False).encode('utf-8'), 'application/json', idx_file['id'] if idx_file else None)
    return data


def log_run(store, done):
    files = store.list()
    f = next((x for x in files if x['dir'] == SYSTEM and x['name'] == '정리기록.md'), None)
    old = store.read_text(f['id']) if f else '# 정리 기록\n'
    entry = f"\n## {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M')} ({len(done)}장)\n\n" + '\n'.join(f'- {c}: {t}' for _, t, c in done) + '\n'
    head, _, rest = old.partition('\n## ')
    runs = ('## ' + rest).split('\n## ') if rest else []
    text = head.rstrip() + '\n' + entry + ('\n## '.join([''] + runs[:49]) if runs else '')
    store.write_file(SYSTEM, '정리기록.md', text.encode('utf-8'), 'text/markdown', f['id'] if f else None)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Thought Drawer 자동 정리기')
    ap.add_argument('command', choices=['status', 'prepare', 'apply', 'index'])
    ap.add_argument('--local', help='드라이브 대신 쓸 로컬 「메모」 폴더 경로')
    ap.add_argument('--max', type=int, default=MAX_CARDS, help="한 번에 정리할 최대 노트 수")
    ap.add_argument('--budget', type=int, default=CHAR_BUDGET, help='한 번에 Claude에게 보여 줄 최대 글자 수')
    args = ap.parse_args(argv)
    store = open_store(args)
    {'status': cmd_status, 'prepare': cmd_prepare, 'apply': cmd_apply, 'index': lambda s, a: print(f"색인 {len(build_index(s)['notes'])}장")}[args.command](store, args)


if __name__ == '__main__':
    main()
