# 도구

앱은 빌드 없이 돌아간다. 다만 편집기(TipTap)와 QR 코드는 여러 패키지라서 한 파일로 묶어 `js/vendor/editor.bundle.js`에 넣어 두었다.
판을 올리거나 다시 만들 때만 아래를 실행한다.

```bash
mkdir /tmp/td-bundle && cp tools/editor-package.json /tmp/td-bundle/package.json && cp tools/editor-entry.js /tmp/td-bundle/entry.js
cd /tmp/td-bundle && npm install
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=<저장소>/js/vendor/editor.bundle.js
```

크롬 확장 프로그램에 들어가는 공용 코드는 `node tools/sync-extension.mjs`로 복사한다.
