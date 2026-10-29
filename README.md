# Thought Drawer

메모, 캡처, 링크, 인스타 저장을 한곳에 던져 넣으면 Claude가 폴더별로 정리하고 서로 이어 주는 노트 앱.
노트는 내 구글 드라이브의 `메모` 폴더에 마크다운으로 저장돼서 폰과 PC 어디서든 열리고, 옵시디언에서도 그대로 보인다.

- **넣기**: 홈의 빠른 기록, 사진 붙여넣기와 끌어다 놓기(드라이브 무료 OCR로 글자 추출), 링크, 인스타 저장함 일괄 가져오기, 아이폰 공유 「메모로 보내기」, 안드로이드 공유, 크롬 확장 프로그램(페이지, 고른 글, 화면 캡처)
- **정리**: Claude Code 예약 작업이 하루 몇 번 인박스의 새 노트만 읽고 제목, 폴더, 태그, 요약, 연결을 붙인다 (지금 쓰는 Claude 구독, API 비용 0원)
- **쓰기**: 큰 제목 아래 폴더·태그·출처 한 줄, 보이는 그대로 편집하는 본문(`/` 블록 메뉴, `[[` 노트 잇기, 사진 붙여넣기), 자동 저장, 즐겨찾기
- **찾기**: `Ctrl/⌘ K` 검색 팔레트 (`#태그`, `폴더:패션`, `종류:인스타`), 문장으로 묻기, 옵시디언 같은 연결 패널과 그래프
- **옮기기**: 옵시디언은 드라이브 폴더 그대로, 노션은 zip 내보내기

| 홈 | 노트 | 모바일 |
|---|---|---|
| ![홈](docs/screens/home.png) | ![노트](docs/screens/note.png) | ![모바일](docs/screens/mobile.png) |

## 시작하기

1. 설정: [docs/설정가이드.md](docs/설정가이드.md)
2. 아이폰 공유 단축어: [docs/단축어.md](docs/단축어.md)
3. 크롬 확장 프로그램: [docs/크롬확장.md](docs/크롬확장.md)
4. 설계와 제텔카스텐 반영 방식: [docs/설계.md](docs/설계.md)

단축키: `Ctrl/⌘ K` 또는 `/` 검색, `N` 새 노트, `Ctrl/⌘ S` 바로 저장. 크롬 확장은 `Ctrl/⌘ Shift Y`.

## 개발

빌드 도구 없는 정적 사이트다.

```bash
npm run serve                          # http://localhost:8080
npm test                               # 노트 형식, 검색, 인스타 파일 읽기, 묻기, 내보내기, 확장 프로그램 동기화
node tools/sync-extension.mjs          # 웹앱 공용 코드를 extension/app 에 복사하고 zip 만들기
python3 -m pytest -q organizer/tests   # 자동 정리기
```

```
index.html, css/app.css      화면 뼈대와 디자인 (라이트/다크)
js/main.js                   시작점
js/core/                     노트 형식, 검색, 인스타 파일 읽기, 묻기, 내보내기 (DOM 없음, 테스트 대상)
js/store/                    구글 로그인, 드라이브 저장소, 라이브러리(기기 사본 먼저 보여 주기), 시험용 저장소
js/ui/                       Preact + htm 화면: App, parts(사이드바, 팔레트, 메뉴), views(홈, 노트, 폴더, 그래프…)
extension/                   크롬 확장 프로그램 (MV3). app/ 은 웹앱 코드 복사본
downloads/                   확장 프로그램 받기용 zip
organizer/                   Claude Code 예약 작업용 정리기 (파이썬 표준 라이브러리)
```

자동 테스트에서는 `window.__TD_TEST__ = { files: [...] }`를 미리 넣으면 드라이브 대신 메모리 저장소로 열린다 (앱 화면에는 나오지 않음).

포함한 외부 라이브러리 (`js/vendor/`): Preact (MIT), htm (Apache-2.0), marked (MIT), DOMPurify (Apache-2.0/MPL-2.0), JSZip (MIT), TipTap (MIT), tiptap-markdown (MIT), qrcode-generator (MIT).
글꼴: Wanted Sans (OFL), JetBrains Mono, Noto Serif KR (OFL).
