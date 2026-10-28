# Thought Drawer

메모·캡처·링크·인스타 저장을 구글 드라이브 「메모」 폴더에 마크다운 노트로 모으고, Claude가 폴더별로 정리하고 서로 이어 주는 웹앱.

- 예약 작업으로 실행됐다면: `organizer/ROUTINE.md` 의 순서만 따른다. 다른 탐색은 하지 않는다.
- 웹앱: 빌드 없는 정적 사이트 (`index.html`, `js/`, `css/`). 화면은 Preact + htm(`js/vendor/`), 진입점 `js/main.js`. 테스트 `npm test`
- 정리기: `organizer/` (파이썬 표준 라이브러리만 사용). 테스트 `python3 -m pytest -q organizer/tests`
- 노트 형식은 `js/core/note.js` 와 `organizer/td_note.py` 가 같은 규칙을 따른다. 한쪽을 바꾸면 다른 쪽도 바꾼다.
- 크롬 확장: `extension/` (MV3). `extension/app/` 은 웹앱 코드 복사본이라 직접 고치지 않는다. 웹앱 공용 코드를 바꾸면 `node tools/sync-extension.mjs` 로 복사와 zip(`downloads/`)을 다시 만든다 (`npm test`가 확인).
