// 화면 시험 도구: 메모리 저장소로 앱을 열고, 글꼴은 node_modules 사본으로 대신한다 (CDN이 막힌 곳에서도).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.TD_PORT || 8080;
let seedP = null;
const seed = () => (seedP ??= import('./seed.mjs').then((m) => m.seed));
const FONTS = { 'wanted-sans@1.0.3': 'wanted-sans', '@kfonts/nanum-square-round@0.2.0': '@kfonts/nanum-square-round' };

exports.open = async (b, { viewport = { width: 1440, height: 900 }, dark = false, seedData, hash = '', tutorial = false } = {}) => {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  await ctx.route('https://cdn.jsdelivr.net/**', (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/npm\//, '');
    const pkg = Object.keys(FONTS).find((k) => p.startsWith(`${k}/`));
    const f = pkg && path.join(ROOT, 'node_modules', FONTS[pkg], p.slice(pkg.length + 1));
    if (!f || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.css') ? 'text/css' : f.endsWith('.woff') ? 'font/woff' : 'font/woff2' });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|google\.com\/s2\/favicons/, (route) => route.fulfill({ status: 404, body: '' }));
  const data = seedData === undefined ? await seed() : seedData;
  if (data) await ctx.addInitScript((s) => { window.__TD_TEST__ = s; }, data);
  if (!tutorial) await ctx.addInitScript(() => { try { localStorage.setItem('td.tutorialDone', 'true'); } catch { /* 없음 */ } });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|net::|404/.test(m.text())) p.errors.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/${hash}`);
  return p;
};
exports.launch = () => chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
exports.check = () => {
  let fails = 0;
  const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) { fails++; process.exitCode = 1; } };
  return ok;
};
