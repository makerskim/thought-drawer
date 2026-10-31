// 앱·확장 아이콘 PNG 만들기: node tools/make-icons.cjs (icons/icon.svg 를 그려서)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..');
const svg = fs.readFileSync(`${R}/icons/icon.svg`, 'utf8');
// [파일, 크기, 여백, 바탕] 앱 아이콘은 꽉 채우고(홈 화면이 모서리를 깎음), 확장 아이콘은 투명 바탕
const jobs = [
  ['icons/icon-192.png', 192, 0, null], ['icons/icon-512.png', 512, 0, null], ['icons/apple-touch-icon.png', 180, 0, '#f5f5f7'],
  ['extension/icons/16.png', 16, 0, null], ['extension/icons/32.png', 32, 0, null], ['extension/icons/48.png', 48, 2, null], ['extension/icons/128.png', 128, 8, null],
];
(async () => {
  const b = await chromium.launch();
  for (const [file, size, pad, bg] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    let s = svg.replace('<svg ', `<svg width="${size - pad * 2}" height="${size - pad * 2}" `);
    if (bg) s = s.replace('rx="120" ', 'rx="0" '); // 아이폰은 직접 둥글게 깎는다
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="padding:${pad}px;width:${size}px;height:${size}px;box-sizing:border-box;line-height:0">${s}</div></body></html>`);
    await p.screenshot({ path: `${R}/${file}`, omitBackground: !bg });
    await p.close();
  }
  await b.close();
})();
