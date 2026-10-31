// README 스크린샷 만들기: npm run screens (npm run serve 를 켜 둔 채)
const path = require('path');
const { open, launch } = require('./harness.cjs');
const out = path.resolve(__dirname, '../../docs/screens');
(async () => {
  const b = await launch();
  const shot = async (name, opts, act) => {
    const p = await open(b, opts);
    await p.waitForSelector('.capbar, .tour-card', { timeout: 10000 });
    if (act) await act(p);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/${name}.png` });
    await p.context().close();
  };
  const desk = { viewport: { width: 1440, height: 900 } };
  await shot('home', desk, async (p) => { await p.waitForSelector('.cm-bubble'); });
  await shot('typing', desk, async (p) => { await p.fill('.capbar textarea', 'https://www.coupang.com/vp/products/1 가습기 비교'); await p.waitForSelector('.cm-bubble:has-text("쇼핑")'); });
  await shot('plus', desk, async (p) => { await p.click('.capbar .cap-plus'); await p.waitForSelector('.pop .mi'); });
  await shot('rows', desk, async (p) => { await p.evaluate(() => window.scrollTo(0, document.querySelector('.below').offsetTop)); await p.waitForTimeout(900); });
  await shot('sidebar', desk, async (p) => { await p.click('.nav-toggle'); await p.click('.sb [aria-label="고정하기"]'); await p.evaluate(() => { location.hash = '#/drawers'; }); await p.waitForSelector('.dbig'); });
  await shot('note', desk, async (p) => { await p.evaluate(() => { location.hash = '#/n/20261020093000'; }); await p.waitForSelector('.ws .props'); await p.click('.rp-tabs button:has-text("그래프")'); await p.evaluate(() => document.activeElement?.blur()); });
  await shot('mobile', { viewport: { width: 390, height: 844 } }, async (p) => { await p.waitForSelector('.cm-bubble'); });
  await shot('mobile-plus', { viewport: { width: 390, height: 844 } }, async (p) => { await p.click('.capbar .cap-plus'); await p.waitForSelector('.pop .mi'); });
  await b.close();
})();
