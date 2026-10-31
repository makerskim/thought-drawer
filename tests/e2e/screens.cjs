// README 스크린샷 만들기: node tests/e2e/screens.cjs (npm run serve 를 켜 둔 채)
const path = require('path');
const { open, launch } = require('./harness.cjs');
const out = path.resolve(__dirname, '../../docs/screens');
(async () => {
  const b = await launch();
  const shot = async (name, opts, act) => {
    const p = await open(b, opts);
    await p.waitForSelector('.drawers .dtile, .tour-card', { timeout: 10000 });
    if (act) await act(p);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/${name}.png` });
    await p.context().close();
  };
  const desk = { viewport: { width: 1440, height: 900 } };
  await shot('home', desk, async (p) => { await p.fill('.capture textarea', 'https://www.coupang.com/vp/products/1 가습기 비교'); });
  await shot('drawer', desk, async (p) => { await p.click('.dtile:has-text("쇼핑")'); await p.waitForSelector('.scope-head'); await p.locator('.wall .mcard', { hasText: 'coupang' }).click(); await p.waitForSelector('.sheet .auto-why'); await p.evaluate(() => document.activeElement?.blur()); });
  await shot('connect', desk, async (p) => { await p.evaluate(() => { location.hash = '#/connect'; }); await p.waitForSelector('.tabs-row'); await p.click('.tabs-row button:has-text("웹사이트")'); });
  await shot('mobile', { viewport: { width: 390, height: 844 } });
  await shot('tour', { ...desk, tutorial: true }, async (p) => { await p.click('.tour-card .btn-primary'); await p.click('.tour-card .btn-primary'); await p.waitForTimeout(400); });
  await b.close();
})();
