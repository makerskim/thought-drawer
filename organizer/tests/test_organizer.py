import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import fetchers  # noqa: E402
import organize  # noqa: E402
from stores import LocalStore  # noqa: E402
from td_note import merge_links_section, parse_note, serialize_note, tokens  # noqa: E402


def write(root: Path, rel: str, meta: dict, body: str):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(serialize_note(meta, body), encoding='utf-8')


@pytest.fixture
def vault(tmp_path, monkeypatch):
    root = tmp_path / '메모'
    write(root, '패션/상의/20260912214510 흰색 옥스포드 셔츠.md',
          {'id': '20260912214510', 'title': '흰색 옥스포드 셔츠', 'type': 'capture', 'status': 'organized', 'category': '패션/상의', 'tags': ['셔츠', '위시리스트']},
          '매장에서 입어봄')
    write(root, '요리/레시피/20261008083522 들기름 막국수.md',
          {'id': '20261008083522', 'title': '들기름 막국수', 'type': 'instagram', 'status': 'organized', 'category': '요리/레시피', 'tags': ['면요리']},
          '레시피')
    write(root, '00_인박스/20261027093012.md',
          {'id': '20261027093012', 'type': 'capture', 'status': 'inbox', 'attachments': ['20261027093012.jpg']},
          '![[20261027093012.jpg]]\n\n## 사진 속 글자\n\n오크우드 가을 시즌오프 옥스포드 셔츠 35,400원')
    write(root, '00_인박스/20261026213300.md',
          {'id': '20261026213300', 'type': 'instagram', 'status': 'inbox', 'source': 'https://www.instagram.com/reel/ABC/', 'author': 'homecafe.kim'},
          '@homecafe.kim 의 릴스을 저장했어요.\n\n[인스타그램에서 보기](https://www.instagram.com/reel/ABC/)')
    write(root, '00_인박스/20261025180000.md',
          {'id': '20261025180000', 'type': 'memo', 'status': 'inbox'},
          '주말에 성수 팝업 가볼 것. [[20261027093012]] 매장 근처')
    (root / '_첨부').mkdir()
    (root / '_첨부' / '20261027093012.jpg').write_bytes(b'\xff\xd8fake')
    monkeypatch.setattr(organize, 'WORK', tmp_path / 'work')
    monkeypatch.setattr(fetchers, 'fetch_instagram', lambda url: {'author': 'homecafe.kim', 'caption': '달고나 라떼 만드는 법 #홈카페'})
    monkeypatch.setattr(fetchers, 'fetch_page', lambda url: None)
    return root


def run(root, *args):
    organize.main([*args, '--local', str(root)])


def test_prepare_builds_compact_batch(vault, capsys):
    run(vault, 'prepare')
    out = capsys.readouterr().out
    assert '정리할 노트 3장' in out
    md = (organize.WORK / 'batch.md').read_text(encoding='utf-8')
    assert '패션/상의 (1)' in md and '요리/레시피 (1)' in md
    assert '달고나 라떼' in md, 'instagram caption fetched without AI'
    assert '저장했어요' not in md and '인스타그램에서 보기' not in md, 'boilerplate stripped'
    assert '20260912214510 | 흰색 옥스포드 셔츠' in md, 'link candidate by shared words'
    assert '## 기본 서랍' in md and '- 쇼핑: 가전,' in md and '- 생각·기록: 메모,' in md, 'app drawer names for consistent folders'
    batch = json.loads((organize.WORK / 'batch.json').read_text(encoding='utf-8'))
    assert [c['id'] for c in batch] == ['20261027093012', '20261026213300', '20261025180000'], 'newest first'


def test_prepare_passes_my_rules_from_the_web_app(vault):
    (vault / '_시스템').mkdir(exist_ok=True)
    (vault / '_시스템' / 'settings.json').write_text(json.dumps({'rules': [
        {'match': '시즌오프, 옥스포드', 'drawer': '패션/상의', 'tags': ['세일']},
        {'match': '', 'drawer': 'x'},
    ]}, ensure_ascii=False), encoding='utf-8')
    run(vault, 'prepare')
    md = (organize.WORK / 'batch.md').read_text(encoding='utf-8')
    assert '## 내 분류 규칙' in md
    assert '「시즌오프, 옥스포드」 중 하나가 나오면 → category: 패션/상의, tags에 세일' in md
    assert md.count('나오면 →') == 1, 'empty rules are dropped'


def test_prepare_nothing_to_do(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(organize, 'WORK', tmp_path / 'work')
    run(tmp_path / '메모', 'prepare')
    assert '정리할 노트 없음' in capsys.readouterr().out


def test_apply_files_cards_links_and_index(vault, capsys):
    run(vault, 'prepare')
    decisions = [
        {'id': '20261027093012', 'title': '오크우드 가을 시즌오프', 'category': '패션/쇼핑', 'tags': ['세일', '오크우드'], 'summary': '옥스포드 셔츠 35,400원 시즌오프.',
         'links': [{'id': '20260912214510', 'why': '같은 셔츠 할인'}, {'id': '99999999999999', 'why': '없는 카드'}]},
        {'id': '20261026213300', 'title': '달고나 라떼 레시피', 'category': '요리/음료', 'tags': ['홈카페'], 'summary': '집에서 만드는 달고나 라떼.', 'links': []},
        {'id': '20261025180000', 'title': '성수 팝업 가기', 'category': '/_시스템/할일/주말/더깊이', 'tags': [], 'summary': '주말 성수 팝업.', 'links': [{'id': '20261027093012', 'why': '매장 근처'}]},
    ]
    (organize.WORK / 'decisions.json').write_text(json.dumps(decisions, ensure_ascii=False), encoding='utf-8')
    run(vault, 'apply')
    out = capsys.readouterr().out
    assert '3장을 정리했어요' in out
    assert not list((vault / '00_인박스').glob('*.md')), 'inbox emptied'

    sale = vault / '패션/쇼핑/20261027093012 오크우드 가을 시즌오프.md'
    meta, body = parse_note(sale.read_text(encoding='utf-8'))
    assert meta['status'] == 'organized' and meta['category'] == '패션/쇼핑'
    assert meta['links'] == ['20260912214510', '20261025180000'], 'unknown ids dropped; backlink from the memo added'
    assert '- [[20260912214510 흰색 옥스포드 셔츠]] (같은 셔츠 할인)' in body

    shirt_meta, shirt_body = parse_note((vault / '패션/상의/20260912214510 흰색 옥스포드 셔츠.md').read_text(encoding='utf-8'))
    assert '20261027093012' in shirt_meta['links'], 'backlink recorded'
    assert '[[20261027093012 오크우드 가을 시즌오프]]' in shirt_body

    reel_meta, reel_body = parse_note((vault / '요리/음료/20261026213300 달고나 라떼 레시피.md').read_text(encoding='utf-8'))
    assert '## 캡션' in reel_body and '달고나 라떼 만드는 법' in reel_body

    memo = vault / '할일/주말/더깊이/20261025180000 성수 팝업 가기.md'
    assert memo.exists(), 'category sanitized to three levels without system folders'
    assert '[[20261027093012 오크우드 가을 시즌오프]] 매장 근처' in memo.read_text(encoding='utf-8'), 'bare [[id]] link renamed'

    idx = json.loads((vault / '_시스템/index.json').read_text(encoding='utf-8'))
    assert len(idx['notes']) == 5
    entry = next(e for e in idx['notes'] if e['meta']['id'] == '20261027093012')
    assert entry['dir'] == '패션/쇼핑' and entry['fileId'].endswith('.md') and entry['modifiedTime']
    assert '정리 기록' in (vault / '_시스템/정리기록.md').read_text(encoding='utf-8')


def test_apply_rejects_bad_decisions(vault):
    run(vault, 'prepare')
    (organize.WORK / 'decisions.json').write_text('[{"id": "123", "category": "x"}]', encoding='utf-8')
    with pytest.raises(SystemExit) as e:
        run(vault, 'apply')
    assert 'id가 이번 묶음에 없어요' in str(e.value)


def test_user_organized_meanwhile_is_left_alone(vault):
    run(vault, 'prepare')
    p = vault / '00_인박스/20261025180000.md'
    meta, body = parse_note(p.read_text(encoding='utf-8'))
    meta.update(status='organized', category='일/할일')
    p.write_text(serialize_note(meta, body), encoding='utf-8')
    (organize.WORK / 'decisions.json').write_text(json.dumps([{'id': '20261025180000', 'title': 'x', 'category': '다른/곳', 'tags': [], 'summary': '', 'links': []}]), encoding='utf-8')
    run(vault, 'apply')
    assert p.exists(), 'not moved because the user already filed it'


def test_once_organized_notes_are_never_sent_again(vault, capsys):
    """한 번 정리한 노트는 인박스로 돌아와도 Claude에게 다시 보내지 않는다 (구독 사용량을 아끼게)"""
    write(vault, '00_인박스/20261020090000 예전에 정리한 노트.md',
          {'id': '20261020090000', 'title': '예전에 정리한 노트', 'type': 'memo', 'status': 'inbox', 'organized': '2026-10-21T07:00:00+09:00'}, '셔츠 세일')
    run(vault, 'prepare')
    out = capsys.readouterr().out
    assert '정리할 노트 3장' in out
    ids = [c['id'] for c in json.loads((organize.WORK / 'batch.json').read_text(encoding='utf-8'))]
    assert '20261020090000' not in ids
    run(vault, 'status')
    assert '정리 대기 3장' in capsys.readouterr().out


def test_nothing_new_means_nothing_sent(vault, capsys):
    for p in (vault / '00_인박스').glob('*.md'):
        meta, body = parse_note(p.read_text(encoding='utf-8'))
        meta['organized'] = '2026-10-21T07:00:00+09:00'
        p.write_text(serialize_note(meta, body), encoding='utf-8')
    run(vault, 'prepare')
    out = capsys.readouterr().out
    assert '정리할 노트 없음' in out and '3장은 다시 보내지 않아요' in out
    assert not (organize.WORK / 'batch.md').exists()


def test_renamed_drawers_move_files_without_claude(vault, capsys):
    """앱에서 서랍 이름을 바꾸면(settings.json 의 renames) 정리기는 파일만 옮긴다. Claude가 다시 분류하지 않는다."""
    (vault / '_시스템').mkdir(exist_ok=True)
    (vault / '_시스템' / 'settings.json').write_text(json.dumps({
        'rules': [{'match': '옥스포드', 'drawer': '패션/상의', 'tags': []}],
        'renames': [{'from': '패션', 'to': '옷장', 'at': '2026-11-01'}, {'from': '요리/레시피', 'to': '요리/만들기'}],
    }, ensure_ascii=False), encoding='utf-8')
    run(vault, 'prepare')
    out = capsys.readouterr().out
    assert '노트 2장을 새 이름으로 옮겼어요' in out and 'Claude 안 씀' in out
    moved = vault / '옷장/상의/20260912214510 흰색 옥스포드 셔츠.md'
    meta, body = parse_note(moved.read_text(encoding='utf-8'))
    assert meta['category'] == '옷장/상의' and body == '매장에서 입어봄' and 'updated' not in meta
    assert (vault / '요리/만들기/20261008083522 들기름 막국수.md').exists()
    assert not (vault / '패션').exists() and not (vault / '요리/레시피').exists(), 'empty old folders removed'
    md = (organize.WORK / 'batch.md').read_text(encoding='utf-8')
    assert '옷장/상의 (1)' in md and '패션/상의' not in md, 'Claude sees only new names'
    assert 'category: 옷장/상의' in md, 'my rules follow the rename'
    assert '이름 바꿈 2장' in (vault / '_시스템/정리기록.md').read_text(encoding='utf-8')
    # Claude가 옛 이름을 써도 새 이름으로 들어간다
    (organize.WORK / 'decisions.json').write_text(json.dumps([{'id': '20261027093012', 'title': '시즌오프', 'category': '패션/상의/셔츠', 'tags': [], 'summary': '', 'links': []}], ensure_ascii=False), encoding='utf-8')
    run(vault, 'apply')
    assert (vault / '옷장/상의/셔츠/20261027093012 시즌오프.md').exists()
    # 두 번째 실행은 옮길 게 없다
    capsys.readouterr()
    run(vault, 'prepare')
    assert '새 이름으로 옮겼어요' not in capsys.readouterr().out


def test_builtin_drawer_renames_reach_claude(vault, tmp_path, monkeypatch):
    """앱의 기본 서랍 이름이 바뀌면(taxonomy.json 의 renamed) Claude에게 보여 주는 기본 서랍도 새 이름"""
    tax = json.loads(organize.TAXONOMY.read_text(encoding='utf-8'))
    tax['renamed'] = [{'from': '쇼핑', 'to': '장보기'}, {'from': '쇼핑/가전', 'to': '쇼핑/전자기기'}]
    alt = tmp_path / 'taxonomy.json'
    alt.write_text(json.dumps(tax, ensure_ascii=False), encoding='utf-8')
    monkeypatch.setattr(organize, 'TAXONOMY', alt)
    run(vault, 'prepare')
    md = (organize.WORK / 'batch.md').read_text(encoding='utf-8')
    assert '- 장보기: 전자기기, 생활용품,' in md and '- 쇼핑:' not in md


def test_taxonomy_json_names_never_get_lost():
    """한 번 내보낸 기본 서랍 이름은 지금 이름이거나, renamed 로 지금 이름에 이어져야 한다"""
    from td_note import rename_path
    tax = json.loads(organize.TAXONOMY.read_text(encoding='utf-8'))
    now = {d['name'] for d in tax['drawers']} | {f"{d['name']}/{s}" for d in tax['drawers'] for s in d['subs']}
    assert [n for n in tax['known'] if rename_path(n, tax['renamed']) not in now] == []


def test_rename_rule_matches_the_web_app():
    from td_note import rename_path
    cases = json.loads((ROOT.parent / 'tests/fixtures/renames.json').read_text(encoding='utf-8'))['cases']
    assert [rename_path(c['path'], c['renames']) for c in cases] == [c['want'] for c in cases]
    from td_note import fold_renames, stable_target
    folds = json.loads((ROOT.parent / 'tests/fixtures/renames.json').read_text(encoding='utf-8'))['folds']
    assert [fold_renames(c['list']) for c in folds] == [c['want'] for c in folds]
    assert stable_target('A', [{'from': 'A', 'to': 'B'}, {'from': 'B', 'to': 'A'}]) == ''


def test_merge_links_section_dedupes():
    body = '본문\n\n## 연결\n\n- [[20260101000000 가]] (이유)\n'
    out = merge_links_section(body, [('20260101000000', '가', '중복'), ('20260102000000', '나', '')])
    assert out.count('20260101000000') == 1
    assert '- [[20260102000000 나]]' in out


def test_tokens_strip_particles():
    assert tokens('셔츠를 오크우드에서 샀다') == ['셔츠', '오크우드', '샀다']


@pytest.mark.skipif(shutil.which('node') is None, reason='node 없음')
def test_same_format_as_web_app():
    note = ROOT.parent / 'js' / 'core' / 'note.js'
    js = (
        f"import('{note.as_uri()}').then(m => {{"
        "const t = m.serializeNote({meta: {id: '20261027105230', title: '따옴표 \"제목\"', tags: ['a', '한글'], status: 'inbox', done: true}, body: '본문\\n\\n[[x]]'});"
        "process.stdout.write(t); })"
    )
    text = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, check=True).stdout
    meta, body = parse_note(text)
    assert meta == {'id': '20261027105230', 'title': '따옴표 "제목"', 'tags': ['a', '한글'], 'status': 'inbox', 'done': True}
    assert body == '본문\n\n[[x]]'
    assert serialize_note(meta, body) == text, 'python writes byte-identical files'


def test_snippet_drops_checkbox_markers_like_the_web_app():
    from td_note import snippet
    assert snippet('- [ ] 우유\n- [x] 달걀') == '우유 달걀'


def test_snippet_keeps_dates_and_ranges_like_the_web_app():
    from td_note import snippet
    assert snippet('10.28~11.03 최대 40%, 2026-10-30 **세일**\n- 목록\n> 인용') == '10.28~11.03 최대 40%, 2026-10-30 세일 목록 인용'


def test_category_keeps_three_levels():
    # 대분류/중분류/소분류까지 쓰고, 그보다 깊으면 자른다
    assert organize.clean_category('쇼핑/가전/노트북') == '쇼핑/가전/노트북'
    assert organize.clean_category('쇼핑/가전/노트북/맥북') == '쇼핑/가전/노트북'
    assert '기타' in organize.RULES and '세 단계' in organize.RULES
