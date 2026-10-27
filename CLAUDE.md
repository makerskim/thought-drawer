# 생각서랍

메모·캡처·북마크·인스타 저장을 구글 드라이브 「메모」 폴더에 마크다운 카드로 모으고, Claude가 서랍(폴더)별로 정리하는 웹앱.

- 예약 작업으로 실행됐다면: `organizer/ROUTINE.md` 의 순서만 따른다. 다른 탐색은 하지 않는다.
- 웹앱: 빌드 없는 정적 사이트 (`index.html`, `js/`, `css/`). 테스트 `npm test`
- 정리기: `organizer/` (파이썬 표준 라이브러리만 사용). 테스트 `python3 -m pytest -q organizer/tests`
- 카드 형식은 `js/core/note.js` 와 `organizer/td_note.py` 가 같은 규칙을 따른다. 한쪽을 바꾸면 다른 쪽도 바꾼다.
